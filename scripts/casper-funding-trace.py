"""
Casper Hackathon 2026 R2 — funding-ancestor + mint-event trace.

Follows the money: for every voter, find who funded their wallet (incoming
CSPR transfers); for every funder, trace one more hop upstream; pull the
contract's full FANR2 mint log (who got voting power, when, from whom).

Builds three artifacts:
  - voter_funding.csv      one row per voter, first funder + amount + ts
  - funder_clusters.csv    funder → # voters funded, total CSPR sent, upstream
  - mints.csv              every FANR2 mint, who received it, when, amount
  - project_identities.csv project account-hash → pubkey + first funder
  - SECOND_PASS_FINDINGS.md narrative writeup

The hypothesis to test:
  H1. Voters trace back to a small set of upstream wallets (bot operator funders).
  H2. The funders themselves trace back to a single hub or a known bridge contract.
  H3. The contract owner minted FANR2 voting power to voters in a templated
      pattern (identical amounts + timestamps) consistent with a scripted batch.
"""

from __future__ import annotations

import csv
import json
import os
import time
import urllib.error
import urllib.request
from collections import Counter, defaultdict
from datetime import datetime
from pathlib import Path

CONTRACT_PACKAGE_HASH = "cbf2518437fbf7f8bdc895dad8eb1bcc5ea4fa0b7978b33721ea73366ad42428"
CONTRACT_OWNER_PK = "020322ea4248fb7a557dff9e18f3cfd3ccafb2e77cf89a50f01070f33d5618cb4586"
CONTRACT_OWNER_HASH = "0bc9335b32b92985dd765680d3e058cf060efc1fba295f1b6342f58ea04f5d65"

API_BASE = "https://api.cspr.cloud"
PAGE_SIZE = 250
INDIR = Path("scripts/.casper-forensics-output")
OUTDIR = INDIR
OUTDIR.mkdir(parents=True, exist_ok=True)

HACKATHON_START_ISO = "2026-01-15T00:00:00Z"
HACKATHON_END_ISO = "2026-02-05T00:00:00Z"
HACKATHON_START = datetime.fromisoformat(HACKATHON_START_ISO.replace("Z", "+00:00"))
HACKATHON_END = datetime.fromisoformat(HACKATHON_END_ISO.replace("Z", "+00:00"))


def load_env_local():
    p = Path(".env.local")
    if p.exists():
        for line in p.read_text().splitlines():
            if "=" in line and not line.strip().startswith("#"):
                k, v = line.split("=", 1)
                os.environ.setdefault(k.strip(), v.strip())

load_env_local()
API_KEY = os.environ["CSPR_CLOUD_API_KEY"]


def api(path: str, retries: int = 4):
    url = f"{API_BASE}{path}"
    for attempt in range(retries):
        try:
            req = urllib.request.Request(url, headers={"Authorization": API_KEY})
            with urllib.request.urlopen(req, timeout=25) as r:
                return json.loads(r.read())
        except urllib.error.HTTPError as e:
            if e.code in (429, 502, 503, 504):
                time.sleep(1 + 2 * attempt)
                continue
            # 400/404/etc — treat as "no data for this query," don't blow up the run
            if 400 <= e.code < 500:
                return None
            raise
        except Exception:
            time.sleep(1 + attempt)
    raise RuntimeError(f"API failed: {url}")


def parse_ts(s: str) -> datetime:
    return datetime.fromisoformat(s.replace("Z", "+00:00"))


# ---------- Pass: load prior-pass data ----------
print("Loading prior-pass voter universe from raw_deploys.json...")
with (INDIR / "raw_deploys.json").open() as f:
    deploys = json.load(f)

# Voter universe: voter_hash → caller_public_key (so we can hit /accounts/{pk})
voter_to_pk: dict[str, str] = {}
voter_to_caller_hash: dict[str, str] = {}
project_hashes: set[str] = set()
for d in deploys:
    args = d.get("args") or {}
    v = ((args.get("voter") or {}).get("parsed") or "").replace("account-hash-", "")
    p = ((args.get("project") or {}).get("parsed") or "").replace("account-hash-", "")
    ch = d.get("caller_hash", "")
    cpk = d.get("caller_public_key", "")
    if v and cpk and ch == v:  # self-submitted: caller pubkey IS this voter's pubkey
        voter_to_pk.setdefault(v, cpk)
    if v:
        voter_to_caller_hash.setdefault(v, ch)
    if p:
        project_hashes.add(p)
print(f"  voters with resolvable pubkey: {len(voter_to_pk)} (of {len(voter_to_caller_hash)})")
print(f"  projects to identify: {len(project_hashes)}")


# ---------- Pass A: project identities ----------
print("\n[A/E] resolving project account-hashes to pubkeys + first funder...")
projects_out: list[dict] = []
for i, ph in enumerate(sorted(project_hashes)):
    info = api(f"/accounts/{ph}")
    pk = (info or {}).get("data", {}).get("public_key") if info else None
    balance = (info or {}).get("data", {}).get("balance") if info else None
    first_funder = first_funder_amt = first_funder_ts = None
    if pk:
        # /accounts/{pk}/transfers ordered desc by default. Get last page for oldest.
        first = api(f"/accounts/{pk}/transfers?page_size=1&page=1")
        if first:
            total = first.get("item_count", 0)
            if total > 0:
                last_page = first.get("page_count", 1)
                oldest = api(f"/accounts/{pk}/transfers?page_size=1&page={last_page}")
                if oldest and oldest.get("data"):
                    t0 = oldest["data"][0]
                    first_funder = t0.get("initiator_account_hash")
                    first_funder_amt = t0.get("amount")
                    first_funder_ts = t0.get("timestamp")
    projects_out.append({
        "project_hash": ph,
        "public_key": pk,
        "balance_motes": balance,
        "first_funder_hash": first_funder,
        "first_fund_amount_motes": first_funder_amt,
        "first_fund_ts": first_funder_ts,
    })
    if i % 10 == 0:
        print(f"  {i}/{len(project_hashes)} projects resolved")
    time.sleep(0.05)
print(f"  done: {len(projects_out)} projects")


# ---------- Pass B: voter funding ancestors ----------
print(f"\n[B/E] tracing funding for {len(voter_to_pk)} voters...")
voter_funding: list[dict] = []
funder_counts: Counter = Counter()
funder_total_sent: dict[str, int] = defaultdict(int)
funder_sample_ts: dict[str, str] = {}
errors = 0
for i, (voter_hash, pk) in enumerate(voter_to_pk.items()):
    try:
        first = api(f"/accounts/{pk}/transfers?page_size=1&page=1")
        if not first or first.get("item_count", 0) == 0:
            voter_funding.append({
                "voter_hash": voter_hash, "voter_pk": pk,
                "first_funder_hash": None, "first_fund_amount_motes": None, "first_fund_ts": None,
            })
            continue
        last_page = first.get("page_count", 1)
        oldest = api(f"/accounts/{pk}/transfers?page_size=1&page={last_page}")
        if not oldest or not oldest.get("data"):
            voter_funding.append({
                "voter_hash": voter_hash, "voter_pk": pk,
                "first_funder_hash": None, "first_fund_amount_motes": None, "first_fund_ts": None,
            })
            continue
        t = oldest["data"][0]
        funder = t.get("initiator_account_hash")
        amt = int(t.get("amount", 0))
        ts = t.get("timestamp", "")
        voter_funding.append({
            "voter_hash": voter_hash,
            "voter_pk": pk,
            "first_funder_hash": funder,
            "first_fund_amount_motes": amt,
            "first_fund_ts": ts,
        })
        if funder:
            funder_counts[funder] += 1
            funder_total_sent[funder] += amt
            funder_sample_ts.setdefault(funder, ts)
    except Exception as e:
        errors += 1
    if i % 50 == 0:
        print(f"  {i}/{len(voter_to_pk)} voters traced, {errors} errors")
    time.sleep(0.04)
print(f"  done: {len(voter_funding)} voters traced ({errors} errors)")

# ---------- Pass C: funder cluster ranking ----------
print(f"\n[C/E] funder cluster: {len(funder_counts)} distinct funders")
top_funders = funder_counts.most_common()
top_n = min(50, len(top_funders))
print(f"  top {top_n} funders by # of voters funded:")
for f, n in top_funders[:top_n]:
    print(f"    {f[:18]}... → funded {n} voters, {funder_total_sent[f]/1e9:,.1f} CSPR total")

# Trace upstream for the top funders — one more hop. Need pubkey via /accounts/{hash}
print("\n[C2] upstream funders (one hop above the top 30 funders)...")
funder_upstream: list[dict] = []
for f, n in top_funders[:30]:
    info = api(f"/accounts/{f}")
    pk = (info or {}).get("data", {}).get("public_key") if info else None
    upstream_hash = upstream_amt = upstream_ts = None
    total_received = 0
    if pk:
        first = api(f"/accounts/{pk}/transfers?page_size=1&page=1")
        if first and first.get("item_count", 0) > 0:
            total_received = first.get("item_count", 0)
            last_page = first.get("page_count", 1)
            oldest = api(f"/accounts/{pk}/transfers?page_size=1&page={last_page}")
            if oldest and oldest.get("data"):
                t = oldest["data"][0]
                upstream_hash = t.get("initiator_account_hash")
                upstream_amt = int(t.get("amount", 0))
                upstream_ts = t.get("timestamp", "")
    funder_upstream.append({
        "funder_hash": f, "funder_pk": pk,
        "voters_funded": n,
        "total_csspr_sent_to_voters_motes": funder_total_sent[f],
        "incoming_xfer_count_alltime": total_received,
        "upstream_funder_hash": upstream_hash,
        "upstream_fund_amount_motes": upstream_amt,
        "upstream_fund_ts": upstream_ts,
    })
    time.sleep(0.05)

# Hub detection: are multiple top-funders themselves funded by a common upstream?
upstream_concentration = Counter(x["upstream_funder_hash"] for x in funder_upstream if x["upstream_funder_hash"])
print("\n  upstream-hub concentration (how many top funders share an upstream):")
for h, c in upstream_concentration.most_common(10):
    print(f"    {h[:18]}... ← shared by {c} top-funder wallets")


# ---------- Pass D (relabeled E): FANR2 mint events ----------
print(f"\n[D/E] pulling all ft-token-actions for the voting contract...")
all_actions = []
page = 1
while True:
    body = api(f"/contract-packages/{CONTRACT_PACKAGE_HASH}/ft-token-actions?page_size={PAGE_SIZE}&page={page}")
    if not body:
        break
    rows = body.get("data", [])
    if not rows:
        break
    all_actions.extend(rows)
    total = body.get("item_count", 0)
    if page == 1:
        print(f"  total ft-token-actions: {total}")
    if len(all_actions) >= total:
        break
    page += 1
    time.sleep(0.05)
print(f"  fetched {len(all_actions)} actions")

# Split by action type. type_id 1 = mint (from_hash null), type_id 2 = transfer
mints = [a for a in all_actions if a.get("from_hash") is None]
transfers = [a for a in all_actions if a.get("from_hash") is not None]
print(f"  mints: {len(mints)}, transfers: {len(transfers)}")

# Group mint recipients
mint_recipients = Counter()
mint_total_per_recipient = defaultdict(int)
mint_first_ts = {}
mint_last_ts = {}
for m in mints:
    to = m.get("to_hash") or ""
    amt = int(m.get("amount", 0))
    ts = m.get("timestamp", "")
    if not to: continue
    mint_recipients[to] += 1
    mint_total_per_recipient[to] += amt
    if to not in mint_first_ts or ts < mint_first_ts[to]: mint_first_ts[to] = ts
    if to not in mint_last_ts or ts > mint_last_ts[to]: mint_last_ts[to] = ts

print(f"\n  unique mint recipients: {len(mint_recipients)}")
voter_hashes_set = set(voter_to_caller_hash.keys())
project_hashes_set = set(project_hashes)
mint_to_voters = sum(1 for r in mint_recipients if r in voter_hashes_set)
mint_to_projects = sum(1 for r in mint_recipients if r in project_hashes_set)
mint_to_other = len(mint_recipients) - mint_to_voters - mint_to_projects
print(f"  mints to voters: {mint_to_voters}")
print(f"  mints to projects: {mint_to_projects}")
print(f"  mints to other: {mint_to_other}")

# Histogram of mint amounts → if 500+ wallets got the EXACT same amount, that's bot-pool minting
amount_dist = Counter(int(m["amount"]) for m in mints)
print(f"\n  top mint amounts (most common):")
for amt, cnt in amount_dist.most_common(10):
    print(f"    {amt:>10,}  → {cnt} mint events")


# ---------- Write artifacts ----------
print("\n[write] saving CSVs and JSON...")

with (OUTDIR / "project_identities.csv").open("w") as f:
    w = csv.writer(f); w.writerow(list(projects_out[0].keys()))
    for r in projects_out: w.writerow(list(r.values()))

with (OUTDIR / "voter_funding.csv").open("w") as f:
    w = csv.writer(f); w.writerow(list(voter_funding[0].keys()) if voter_funding else [])
    for r in voter_funding: w.writerow(list(r.values()))

with (OUTDIR / "funder_clusters.csv").open("w") as f:
    w = csv.writer(f)
    w.writerow(["funder_hash", "voters_funded", "total_motes_sent_to_voters", "earliest_fund_ts"])
    for fh, n in top_funders:
        w.writerow([fh, n, funder_total_sent[fh], funder_sample_ts.get(fh, "")])

with (OUTDIR / "funder_upstream.csv").open("w") as f:
    w = csv.writer(f); w.writerow(list(funder_upstream[0].keys()) if funder_upstream else [])
    for r in funder_upstream: w.writerow(list(r.values()))

with (OUTDIR / "mints.csv").open("w") as f:
    w = csv.writer(f)
    w.writerow(["to_hash", "is_voter", "is_project", "mint_events", "total_minted", "first_mint_ts", "last_mint_ts"])
    for to in mint_recipients:
        w.writerow([
            to,
            to in voter_hashes_set,
            to in project_hashes_set,
            mint_recipients[to],
            mint_total_per_recipient[to],
            mint_first_ts.get(to, ""),
            mint_last_ts.get(to, ""),
        ])

summary = {
    "n_projects_identified": len(projects_out),
    "n_voters_traced": len(voter_funding),
    "unique_funders_for_voters": len(funder_counts),
    "top_10_funders": [{"hash": f, "voters_funded": n, "csspr_total_motes": funder_total_sent[f]}
                       for f, n in top_funders[:10]],
    "upstream_hub_concentration": [{"upstream_hash": h, "top_funders_sharing_it": c}
                                    for h, c in upstream_concentration.most_common(10)],
    "ft_actions_total": len(all_actions),
    "ft_mints": len(mints),
    "ft_transfers": len(transfers),
    "unique_mint_recipients": len(mint_recipients),
    "mints_to_voters": mint_to_voters,
    "mints_to_projects": mint_to_projects,
    "top_10_mint_amounts": [{"amount_units": amt, "n_mint_events": cnt}
                            for amt, cnt in amount_dist.most_common(10)],
}
(OUTDIR / "funding_summary.json").write_text(json.dumps(summary, indent=2))
print("\n=== FUNDING SUMMARY ===")
print(json.dumps(summary, indent=2))
print(f"\nArtifacts in {OUTDIR}/")
