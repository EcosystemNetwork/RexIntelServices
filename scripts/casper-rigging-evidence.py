"""
Casper Hackathon 2026 — rigging evidence consolidation.

Four passes designed to either confirm or falsify the claim that Casper
Association rigged its own hackathon:

  E. Per-project voter quality scorecard — does the bot pool concentrate
     on the announced/winning projects, or is it distributed evenly?
  F. Apex wallet trace — for the top 3 funders and the Association wallet,
     pull recent activity + incoming sources to classify each as
     Association sub-wallet / exchange / third-party operator.
  G. Round 1 / Qualification contract analysis — confirm 4475016098...
     is the R1 voting contract; if so, sample its voter pool for the same
     fresh-baked / dust-funded pattern.
  H. Prize-payout audit — did the announced winners (CasPay, Shroud,
     CasperLink, BridgeX) actually receive CSPR or token payouts from the
     Association after the Feb 5 recap?

Reads prior-pass artifacts from scripts/.casper-forensics-output/ and writes
new findings to RIGGING_EVIDENCE.md + several JSON dumps.
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

API_BASE = "https://api.cspr.cloud"
ASSOCIATION_HASH = "0bc9335b32b92985dd765680d3e058cf060efc1fba295f1b6342f58ea04f5d65"
ASSOCIATION_PK = "020322ea4248fb7a557dff9e18f3cfd3ccafb2e77cf89a50f01070f33d5618cb4586"
R2_CONTRACT = "cbf2518437fbf7f8bdc895dad8eb1bcc5ea4fa0b7978b33721ea73366ad42428"
R1_CONTRACT_CANDIDATE = "4475016098705466254edd18d267a9dad43e341d4dafadb507d0fe3cf2d4a74b"
POINTS_CONTRACT_CANDIDATE = "2c41427f79cc69456a9ad38e8cb379cb0f1084f17c467b17ccb389346fd2c139"
POST_HACKATHON_START = "2026-02-05T00:00:00Z"

INDIR = Path("scripts/.casper-forensics-output")
OUTDIR = INDIR
OUTDIR.mkdir(parents=True, exist_ok=True)

p = Path(".env.local")
if p.exists():
    for line in p.read_text().splitlines():
        if "=" in line and not line.startswith("#"):
            k, v = line.split("=", 1)
            os.environ.setdefault(k.strip(), v.strip())
API_KEY = os.environ["CSPR_CLOUD_API_KEY"]


def api(path: str, retries: int = 4):
    for attempt in range(retries):
        try:
            req = urllib.request.Request(f"{API_BASE}{path}", headers={"Authorization": API_KEY})
            with urllib.request.urlopen(req, timeout=25) as r:
                return json.loads(r.read())
        except urllib.error.HTTPError as e:
            if e.code in (429, 502, 503, 504):
                time.sleep(1 + 2 * attempt); continue
            if 400 <= e.code < 500:
                return None
            raise
        except Exception:
            time.sleep(1 + attempt)
    return None


# ---------- Load prior-pass artifacts ----------
print("Loading prior-pass data...")
with (INDIR / "raw_deploys.json").open() as f:
    deploys = json.load(f)

# Map voter_hash -> classification (fresh-baked / dormant / etc) from voters.csv
voter_class: dict[str, dict] = {}
with (INDIR / "voters.csv").open() as f:
    reader = csv.DictReader(f)
    for row in reader:
        voter_class[row["voter_account_hash"]] = row

# Map voter_hash -> first_funder (from voter_funding.csv)
voter_funder: dict[str, str] = {}
with (INDIR / "voter_funding.csv").open() as f:
    reader = csv.DictReader(f)
    for row in reader:
        if row["first_funder_hash"]:
            voter_funder[row["voter_hash"]] = row["first_funder_hash"]

# Map project_hash -> {pubkey, first_funder} (from project_identities.csv)
project_meta: dict[str, dict] = {}
with (INDIR / "project_identities.csv").open() as f:
    reader = csv.DictReader(f)
    for row in reader:
        project_meta[row["project_hash"]] = row

# Top funders + their identity hashes (the "bot pool" — funders feeding many voters)
BOT_FUNDER_THRESHOLD = 10  # funder must have funded ≥10 voters to be "bot-pool"
bot_funders: set[str] = set()
funder_voter_counts: Counter = Counter()
for vh, fh in voter_funder.items():
    funder_voter_counts[fh] += 1
for fh, n in funder_voter_counts.items():
    if n >= BOT_FUNDER_THRESHOLD:
        bot_funders.add(fh)
print(f"  bot-pool funders (≥{BOT_FUNDER_THRESHOLD} voters fed): {len(bot_funders)}")


# ---------- Pass E: per-project voter quality scorecard ----------
print("\n[E] per-project voter quality scorecard...")
# For each project, aggregate the votes and classify their voters
project_votes: dict[str, list[dict]] = defaultdict(list)
for d in deploys:
    args = d.get("args") or {}
    project = ((args.get("project") or {}).get("parsed") or "").replace("account-hash-", "")
    voter = ((args.get("voter") or {}).get("parsed") or "").replace("account-hash-", "")
    amount = int(((args.get("token_amount") or {}).get("parsed") or "0") or 0)
    if project and voter:
        project_votes[project].append({"voter": voter, "amount": amount, "ts": d["timestamp"]})

project_scorecard: list[dict] = []
for ph, votes in project_votes.items():
    voters = {v["voter"] for v in votes}
    total_tokens = sum(v["amount"] for v in votes)
    n_voters = len(voters)
    fresh = sum(1 for v in voters if v in voter_class and
                voter_class[v].get("first_deploy_ever_ts") and
                voter_class[v].get("first_vote_ts") and
                voter_class[v]["first_deploy_ever_ts"] <= voter_class[v]["first_vote_ts"] and
                # fresh = first_deploy within 24h before first_vote
                True)
    # Compute "fresh-baked" precisely using the original classification
    fresh = sum(1 for v in voters if v in voter_class and
                voter_class[v].get("first_deploy_ever_ts") and
                voter_class[v].get("first_vote_ts") and
                (datetime.fromisoformat(voter_class[v]["first_vote_ts"]) -
                 datetime.fromisoformat(voter_class[v]["first_deploy_ever_ts"])).total_seconds() < 86400)
    dormant = sum(1 for v in voters if v in voter_class and
                  str(voter_class[v].get("still_active_post_hackathon", "")).lower() == "false")
    bot_funded = sum(1 for v in voters if voter_funder.get(v) in bot_funders)
    assoc_funded = sum(1 for v in voters if voter_funder.get(v) == ASSOCIATION_HASH)
    project_scorecard.append({
        "project_hash": ph,
        "project_public_key": project_meta.get(ph, {}).get("public_key", ""),
        "n_votes": len(votes),
        "n_unique_voters": n_voters,
        "total_fanr2_received": total_tokens,
        "voters_fresh_baked": fresh,
        "pct_fresh_baked": round(100 * fresh / n_voters, 1) if n_voters else 0,
        "voters_dormant_post_hackathon": dormant,
        "pct_dormant": round(100 * dormant / n_voters, 1) if n_voters else 0,
        "voters_funded_by_bot_pool": bot_funded,
        "pct_bot_funded": round(100 * bot_funded / n_voters, 1) if n_voters else 0,
        "voters_funded_directly_by_association": assoc_funded,
        "pct_association_funded": round(100 * assoc_funded / n_voters, 1) if n_voters else 0,
    })
project_scorecard.sort(key=lambda r: -r["total_fanr2_received"])

print("\n  Top 15 projects by FANR2 received:")
print(f"  {'rank':<4} {'tokens':>10} {'voters':>7} {'fresh%':>7} {'dormant%':>9} {'botfund%':>9} {'assocfund%':>11}")
for i, r in enumerate(project_scorecard[:15], 1):
    print(f"  #{i:<3} {r['total_fanr2_received']:>10,} {r['n_unique_voters']:>7} "
          f"{r['pct_fresh_baked']:>6.1f}% {r['pct_dormant']:>8.1f}% "
          f"{r['pct_bot_funded']:>8.1f}% {r['pct_association_funded']:>10.1f}%")

# Save
with (OUTDIR / "project_scorecard.csv").open("w") as f:
    w = csv.writer(f)
    w.writerow(list(project_scorecard[0].keys()))
    for r in project_scorecard:
        w.writerow(list(r.values()))


# ---------- Pass F: apex wallet attribution ----------
print("\n[F] apex wallet attribution...")
apex_candidates = [
    ("74ab92cebdb16189b8a1d3ed5a87d6fff8df694e9ede46393b5e11bb441be597", "Top funder #1 (106 voters)"),
    ("41e4339ebc8a4f2941be99cc64fabb028be6fca8dd071ba7fbebfec13533fb37", "Top funder #2 (88 voters)"),
    ("0bc9335b32b92985dd765680d3e058cf060efc1fba295f1b6342f58ea04f5d65", "Casper Association (34 voters)"),
    ("496d542527e1a29f576ab7c3f4c947bfcdc9b4145f75f6ec40e36089432d7351", "Top funder #3 (71 voters, big balances)"),
    ("b1905aee750b1089f7cb33d11e01bbbc843c5599ade67cb0b9eff4d9cf6dccec", "Top funder #7"),
    ("eb747cd191aa5d8403606d05094153f2ad282c949987e3c4740143658bdc7af4", "Top funder #6"),
]
apex_profile: list[dict] = []
for hash_, label in apex_candidates:
    info = api(f"/accounts/{hash_}")
    if not info or not info.get("data"):
        apex_profile.append({"hash": hash_, "label": label, "status": "missing"})
        continue
    d = info["data"]
    pk = d.get("public_key")
    balance_motes = int(d.get("balance", "0") or 0)
    # All-time transfer counts
    tin = api(f"/accounts/{pk}/transfers?page_size=1&page=1") if pk else None
    transfers_total = (tin or {}).get("item_count", 0)
    # First incoming = oldest page
    first_funder = first_amt = first_ts = None
    if pk and tin and transfers_total > 0:
        last_page = tin.get("page_count", 1)
        oldest = api(f"/accounts/{pk}/transfers?page_size=1&page={last_page}")
        if oldest and oldest.get("data"):
            t = oldest["data"][0]
            first_funder = t.get("initiator_account_hash")
            first_amt = int(t.get("amount", 0))
            first_ts = t.get("timestamp")
    # Deploy count
    dep = api(f"/accounts/{pk}/deploys?page_size=1&page=1") if pk else None
    deploys_total = (dep or {}).get("item_count", 0)
    apex_profile.append({
        "hash": hash_,
        "label": label,
        "public_key": pk,
        "balance_motes": balance_motes,
        "balance_cspr": round(balance_motes / 1e9, 2),
        "transfers_total": transfers_total,
        "deploys_total": deploys_total,
        "first_funder_hash": first_funder,
        "first_funder_amount_motes": first_amt,
        "first_funder_amount_cspr": round((first_amt or 0) / 1e9, 2),
        "first_funder_ts": first_ts,
        "first_funder_is_association": (first_funder == ASSOCIATION_HASH),
    })
    time.sleep(0.05)

print("  Apex wallet profile:")
for p_ in apex_profile:
    if p_.get("status") == "missing":
        print(f"    {p_['hash'][:18]}... [{p_['label']}] missing/no data")
        continue
    flag = " ⚠ ASSOCIATION-FUNDED" if p_["first_funder_is_association"] else ""
    print(f"    {p_['hash'][:18]}... [{p_['label']}]{flag}")
    print(f"      balance: {p_['balance_cspr']:>10,.1f} CSPR, "
          f"deploys: {p_['deploys_total']:>5}, transfers: {p_['transfers_total']:>5}")
    print(f"      first funded by {p_['first_funder_hash'][:18] if p_['first_funder_hash'] else 'NULL'}... "
          f"({p_['first_funder_amount_cspr']:.1f} CSPR @ {p_['first_funder_ts']})")

(OUTDIR / "apex_attribution.json").write_text(json.dumps(apex_profile, indent=2, default=str))


# ---------- Pass G: Round 1 / Qualification contract check ----------
print(f"\n[G] checking suspected R1 voting contract {R1_CONTRACT_CANDIDATE[:18]}...")
r1_info = api(f"/contract-packages/{R1_CONTRACT_CANDIDATE}")
if r1_info and r1_info.get("data"):
    rd = r1_info["data"]
    print(f"  contract name:  {rd.get('name')}")
    print(f"  description:    {(rd.get('metadata') or {}).get('contract_description', '')}")
    print(f"  symbol:         {(rd.get('metadata') or {}).get('symbol', '')}")
    print(f"  owner pubkey:   {rd.get('owner_public_key')}")
    print(f"  deployed:       {rd.get('timestamp')}")

    # Count R1 voting deploys
    r1_first = api(f"/deploys?contract_package_hash={R1_CONTRACT_CANDIDATE}&page_size=1")
    r1_total = (r1_first or {}).get("item_count", 0)
    print(f"  total deploys to R1: {r1_total}")

    # Sample first 250 R1 deploys to count voter overlap with R2
    r2_voters = set(voter_class.keys())
    r1_voters = set()
    r1_sample = api(f"/deploys?contract_package_hash={R1_CONTRACT_CANDIDATE}&page_size=250&page=1")
    if r1_sample:
        for d in r1_sample.get("data", []):
            v = ((d.get("args") or {}).get("voter") or {}).get("parsed", "").replace("account-hash-", "")
            if v: r1_voters.add(v)
    overlap = r2_voters & r1_voters
    print(f"  R1 deploy sample (first 250): {len(r1_voters)} unique voters")
    print(f"  voters who participated in BOTH R1 sample and R2: {len(overlap)}")
    (OUTDIR / "r1_contract_summary.json").write_text(json.dumps({
        "contract_metadata": rd,
        "total_deploys": r1_total,
        "sampled_unique_voters": len(r1_voters),
        "overlap_with_r2_voters": len(overlap),
    }, indent=2, default=str))
else:
    print("  not found / not a contract package")


# ---------- Pass H: on-chain prize-payout audit ----------
print(f"\n[H] on-chain prize-payout audit for top-7 projects (incoming after {POST_HACKATHON_START})...")
payout_findings: list[dict] = []
for r in project_scorecard[:7]:
    ph = r["project_hash"]
    pk = r["project_public_key"]
    if not pk:
        payout_findings.append({"project_hash": ph, "status": "no pubkey"}); continue

    incoming = api(f"/accounts/{pk}/transfers?page_size=50&page=1")
    if not incoming:
        payout_findings.append({"project_hash": ph, "status": "no transfers data"}); continue

    post_hackathon_incoming = []
    from_assoc_post_hackathon = []
    for t in incoming.get("data", []):
        ts = t.get("timestamp", "")
        if ts >= POST_HACKATHON_START:
            post_hackathon_incoming.append({
                "from": t.get("initiator_account_hash"),
                "amount_motes": int(t.get("amount", 0)),
                "amount_cspr": round(int(t.get("amount", 0)) / 1e9, 2),
                "ts": ts,
            })
            if t.get("initiator_account_hash") == ASSOCIATION_HASH:
                from_assoc_post_hackathon.append(post_hackathon_incoming[-1])

    payout_findings.append({
        "project_hash": ph,
        "project_pubkey": pk,
        "fanr2_received_in_vote": r["total_fanr2_received"],
        "post_hackathon_incoming_count": len(post_hackathon_incoming),
        "post_hackathon_incoming_from_association_count": len(from_assoc_post_hackathon),
        "post_hackathon_incoming_total_cspr": round(sum(t["amount_motes"] for t in post_hackathon_incoming) / 1e9, 2),
        "post_hackathon_from_association_total_cspr": round(sum(t["amount_motes"] for t in from_assoc_post_hackathon) / 1e9, 2),
        "sample_assoc_payouts": from_assoc_post_hackathon[:5],
    })
    time.sleep(0.05)

print("\n  Top-7 project post-hackathon receipt audit:")
print(f"  {'rank':<4} {'fanr2':>10} {'post-Feb5 in':>13} {'from Assoc':>11} {'Assoc CSPR':>11}")
for i, p_ in enumerate(payout_findings, 1):
    if "post_hackathon_incoming_count" not in p_:
        print(f"  #{i}  {p_['project_hash'][:14]}... {p_.get('status', '')}")
        continue
    print(f"  #{i:<3} {p_['fanr2_received_in_vote']:>10,} {p_['post_hackathon_incoming_count']:>13} "
          f"{p_['post_hackathon_incoming_from_association_count']:>11} "
          f"{p_['post_hackathon_from_association_total_cspr']:>10,.1f}")

(OUTDIR / "prize_payout_audit.json").write_text(json.dumps(payout_findings, indent=2, default=str))


print("\nDone. Artifacts written to scripts/.casper-forensics-output/")
