"""
Casper Hackathon 2026 R2 — deep-conspiracy battery (Passes N2, S-W).

Extensions to the creative-metrics pass, designed to push every remaining
on-chain thread:

N2. Re-do Association outgoing-transfer audit using account-hash (not pubkey)
S.  Multi-hop voter-funding ancestor trace (5 hops deep) — does the cascade
    converge on a small set of original sources?
T.  Project-shell sibling check — do the 7 winning project shells share
    creation patterns / funding timing / deploy counts?
U.  Mid-tier dual-funder 65a1bb91... deep dive (funded projects #5 AND #6)
V.  Domain-registration trace — what *.fans.cspr handles did the Association
    register around the hackathon window? Any tied to voter wallets?
W.  Halborn / NodeOps / DoraHacks public-wallet identification.
"""

from __future__ import annotations
import csv, json, os, time, urllib.error, urllib.request
from collections import Counter, defaultdict
from pathlib import Path

API_BASE = "https://api.cspr.cloud"
ASSOCIATION_HASH = "0bc9335b32b92985dd765680d3e058cf060efc1fba295f1b6342f58ea04f5d65"
ASSOCIATION_PK = "020322ea4248fb7a557dff9e18f3cfd3ccafb2e77cf89a50f01070f33d5618cb4586"
HACKATHON_START_ISO = "2026-01-01T00:00:00Z"  # buffer before R2 contract deploy
HACKATHON_END_ISO = "2026-02-15T00:00:00Z"
DUAL_FUNDER = "65a1bb912303cdaa01a7b07c9ad5bef91dbf45d6cd9d9f3dc69eecd3a8aebcca"  # funded projects #5 + #6 (placeholder — need real)

INDIR = Path("scripts/.casper-forensics-output")
OUTDIR = INDIR

p = Path(".env.local")
if p.exists():
    for line in p.read_text().splitlines():
        if "=" in line and not line.startswith("#"):
            k, v = line.split("=", 1); os.environ.setdefault(k.strip(), v.strip())
API_KEY = os.environ["CSPR_CLOUD_API_KEY"]


def api(path: str, retries: int = 4):
    for attempt in range(retries):
        try:
            req = urllib.request.Request(f"{API_BASE}{path}", headers={"Authorization": API_KEY})
            with urllib.request.urlopen(req, timeout=25) as r:
                return json.loads(r.read())
        except urllib.error.HTTPError as e:
            if e.code in (429, 502, 503, 504): time.sleep(1 + 2 * attempt); continue
            if 400 <= e.code < 500: return None
            raise
        except Exception:
            time.sleep(1 + attempt)
    return None


# Load prior data
voter_funder = {}
with (INDIR / "voter_funding.csv").open() as f:
    for row in csv.DictReader(f):
        if row["first_funder_hash"]:
            voter_funder[row["voter_hash"]] = row["first_funder_hash"]


# ===========================================================================
# Pass N2 — Association outgoing via account-hash
# ===========================================================================
print("[N2] Association outgoing transfers (using account-hash this time)...")
# Try both endpoint patterns
for pattern in [f"/accounts/{ASSOCIATION_HASH}/transfers?page_size=100&page=1",
                f"/transfers?initiator_account_hash={ASSOCIATION_HASH}&page_size=100&page=1"]:
    body = api(pattern)
    if body and body.get("data"):
        print(f"  endpoint works: {pattern}")
        total = body.get("item_count", 0)
        print(f"  total transfers: {total}")
        break
else:
    body = None
    print("  no endpoint returned data — falling back to scanning voter funding patterns")

# If we got data, pull all and bucket by destination type
all_assoc = []
if body:
    page = 1
    while True:
        b = api(f"/accounts/{ASSOCIATION_HASH}/transfers?page_size=500&page={page}") or \
            api(f"/transfers?initiator_account_hash={ASSOCIATION_HASH}&page_size=500&page={page}")
        if not b: break
        rows = b.get("data", [])
        if not rows: break
        all_assoc.extend(rows)
        total = b.get("item_count", 0)
        if len(all_assoc) % 1000 < 500:
            print(f"  page {page}: total so far {len(all_assoc)} / {total}")
        if len(all_assoc) >= total: break
        page += 1
        if page > 100: break
        time.sleep(0.04)

if all_assoc:
    # Classify destinations
    voter_hashes = set(voter_funder.keys())
    project_hashes = set()
    with (INDIR / "project_identities.csv").open() as f:
        for row in csv.DictReader(f):
            project_hashes.add(row["project_hash"])
    top_bot_funders = set()
    with (INDIR / "funder_clusters.csv").open() as f:
        for i, row in enumerate(csv.DictReader(f)):
            if i >= 20: break
            top_bot_funders.add(row["funder_hash"])

    to_voters = []; to_projects = []; to_botfunders = []; to_other = []
    outgoing = [t for t in all_assoc if t.get("initiator_account_hash") == ASSOCIATION_HASH]
    for t in outgoing:
        to_hash = t.get("to_account_hash") or t.get("to") or ""
        if to_hash in voter_hashes: to_voters.append(t)
        elif to_hash in project_hashes: to_projects.append(t)
        elif to_hash in top_bot_funders: to_botfunders.append(t)
        else: to_other.append(t)
    print(f"\n  Association outgoing total: {len(outgoing)}")
    print(f"    → voters:        {len(to_voters)}")
    print(f"    → project shells: {len(to_projects)}")
    print(f"    → top-20 bot funders: {len(to_botfunders)}")
    print(f"    → other recipients: {len(to_other)}")

    # Top "other" destinations (could be unidentified bot funders or partner orgs)
    other_dest = Counter(t.get("to_account_hash", "") for t in to_other)
    print(f"\n  Top 20 'other' destinations (potential unidentified actors):")
    for dh, c in other_dest.most_common(20):
        total_motes = sum(int(t.get("amount", 0)) for t in to_other if t.get("to_account_hash") == dh)
        print(f"    {dh[:18]}...  {c:>3} transfers, {total_motes/1e9:,.1f} CSPR total")
    (OUTDIR / "association_outgoing_full.json").write_text(json.dumps({
        "total_outgoing": len(outgoing),
        "to_voters": len(to_voters),
        "to_project_shells": len(to_projects),
        "to_bot_funders": len(to_botfunders),
        "to_other": len(to_other),
        "top_other_destinations": [{"hash": dh, "transfer_count": c} for dh, c in other_dest.most_common(50)],
    }, indent=2))


# ===========================================================================
# Pass S — Multi-hop voter-funding ancestor trace (5 hops)
# ===========================================================================
print("\n\n[S] multi-hop ancestor trace — does the cascade converge?")
HOPS = 5
# Cache so we don't re-fetch
hash_to_pubkey: dict[str, str] = {}
hash_to_first_funder: dict[str, str] = {}

def first_funder_of(account_hash: str) -> str:
    """Return the account-hash that first sent CSPR to this account."""
    if account_hash in hash_to_first_funder:
        return hash_to_first_funder[account_hash]
    # Get pubkey if we don't have it
    pk = hash_to_pubkey.get(account_hash)
    if not pk:
        info = api(f"/accounts/{account_hash}")
        pk = (info or {}).get("data", {}).get("public_key") if info else None
        if pk: hash_to_pubkey[account_hash] = pk
    if not pk:
        hash_to_first_funder[account_hash] = ""; return ""
    first = api(f"/accounts/{pk}/transfers?page_size=1&page=1")
    total = (first or {}).get("item_count", 0) if first else 0
    if not first or total == 0:
        hash_to_first_funder[account_hash] = ""; return ""
    last_page = first.get("page_count", 1)
    oldest = api(f"/accounts/{pk}/transfers?page_size=1&page={last_page}")
    funder = (oldest or {}).get("data", [{}])[0].get("initiator_account_hash", "") if oldest else ""
    hash_to_first_funder[account_hash] = funder
    return funder

# Trace each voter back HOPS levels
print(f"  tracing {len(voter_funder)} voters back {HOPS} hops...")
voter_lineage: dict[str, list[str]] = {}
all_ancestors: Counter = Counter()
for i, (vh, fh) in enumerate(voter_funder.items()):
    lineage = [vh]
    current = fh
    for hop in range(HOPS):
        if not current or current in lineage:  # avoid loops
            break
        lineage.append(current)
        if current == ASSOCIATION_HASH:
            break  # terminal — we found the Association
        current = first_funder_of(current)
        time.sleep(0.03)
    voter_lineage[vh] = lineage
    if lineage:
        all_ancestors[lineage[-1]] += 1
    if i % 100 == 0:
        print(f"    {i}/{len(voter_funder)} voters traced")

print(f"\n  Terminal ancestors (deepest source for each voter):")
for h, c in all_ancestors.most_common(15):
    label = " ★ CASPER ASSOCIATION" if h == ASSOCIATION_HASH else ""
    print(f"    {h[:18]}...  → terminal source for {c} voters{label}")

# How many voters trace back to the Association at SOME hop?
voters_traceable_to_assoc = sum(1 for lineage in voter_lineage.values() if ASSOCIATION_HASH in lineage)
print(f"\n  Voters that trace back to Casper Association at ANY hop within {HOPS}: {voters_traceable_to_assoc} of {len(voter_funder)} ({100*voters_traceable_to_assoc/len(voter_funder):.1f}%)")

(OUTDIR / "voter_multihop_lineage.json").write_text(json.dumps({
    "hops_traced": HOPS,
    "voters_traceable_to_association": voters_traceable_to_assoc,
    "terminal_source_counts": dict(all_ancestors.most_common(50)),
    "lineages_sample": dict(list(voter_lineage.items())[:30]),
}, indent=2))


# ===========================================================================
# Pass T — Project-shell sibling check
# ===========================================================================
print("\n\n[T] project-shell sibling check — were the 7 winning shells spawned similarly?")
project_meta: list[dict] = []
top7 = []
with (INDIR / "project_scorecard.csv").open() as f:
    rows = sorted(csv.DictReader(f), key=lambda r: -int(r["total_fanr2_received"]))
    top7 = rows[:7]

for p in top7:
    ph = p["project_hash"]
    pk = p["project_public_key"]
    if not pk: continue
    # First incoming = creation funder + timestamp
    first = api(f"/accounts/{pk}/transfers?page_size=1&page=1")
    if first:
        last_page = first.get("page_count", 1)
        oldest = api(f"/accounts/{pk}/transfers?page_size=1&page={last_page}")
        if oldest and oldest.get("data"):
            t = oldest["data"][0]
            # Deploys
            dep = api(f"/accounts/{pk}/deploys?page_size=1&page=1")
            project_meta.append({
                "rank": rows.index(p) + 1,
                "project_hash": ph,
                "fanr2_received": p["total_fanr2_received"],
                "first_funder_hash": t.get("initiator_account_hash"),
                "first_funder_amount_cspr": int(t.get("amount", 0)) / 1e9,
                "first_funder_ts": t.get("timestamp"),
                "all_time_deploys": (dep or {}).get("item_count", 0),
            })
    time.sleep(0.05)

print(f"\n  Top-7 project shell creation profile:")
print(f"  {'rank':<4} {'shell hash':<18} {'funder':<18} {'CSPR':>8} {'created':<22} {'deploys':>5}")
for p in project_meta:
    funder_short = (p.get("first_funder_hash") or "")[:14] + "..."
    print(f"  #{p['rank']:<3} {p['project_hash'][:14]}...  {funder_short}  "
          f"{p['first_funder_amount_cspr']:>7.1f}  {p['first_funder_ts']:<22} {p['all_time_deploys']:>5}")


# ===========================================================================
# Pass U — Project #5/#6 dual-funder 65a1bb91... deep dive
# ===========================================================================
print("\n\n[U] dual-funder deep dive (wallet that funded BOTH projects #5 and #6)...")
# Pull the actual hash from project meta
dual_funders = Counter(p.get("first_funder_hash") for p in project_meta)
candidates = [h for h, c in dual_funders.items() if c >= 2 and h and h != ASSOCIATION_HASH]
if candidates:
    for dh in candidates:
        print(f"\n  Dual-funder: {dh}")
        info = api(f"/accounts/{dh}")
        if info and info.get("data"):
            d = info["data"]
            pk = d.get("public_key")
            balance = int(d.get("balance", 0))
            print(f"    pubkey: {pk}")
            print(f"    balance: {balance/1e9:,.1f} CSPR")
            # First incoming
            if pk:
                first = api(f"/accounts/{pk}/transfers?page_size=1&page=1")
                if first:
                    last_page = first.get("page_count", 1)
                    oldest = api(f"/accounts/{pk}/transfers?page_size=1&page={last_page}")
                    if oldest and oldest.get("data"):
                        t = oldest["data"][0]
                        print(f"    first funded by: {t.get('initiator_account_hash')} ({int(t.get('amount',0))/1e9:.1f} CSPR @ {t.get('timestamp')})")
                # Deploys
                dep = api(f"/accounts/{pk}/deploys?page_size=1&page=1")
                if dep:
                    print(f"    all-time deploys: {dep.get('item_count', 0)}")
        # Did this wallet ALSO fund any voters?
        voters_funded = [vh for vh, fh in voter_funder.items() if fh == dh]
        print(f"    voters this wallet funded: {len(voters_funded)}")
else:
    print("  no dual-funder found (none of the project-meta funders appeared twice)")


# ===========================================================================
# Pass V — Domain registration trace (.fans.cspr handles around hackathon)
# ===========================================================================
print("\n\n[V] *.fans.cspr domain registrations by Association in the hackathon window...")
# Pull Association deploys that look like domain registrations
page = 1
domain_deploys = []
while True:
    body = api(f"/accounts/{ASSOCIATION_PK}/deploys?page_size=500&page={page}")
    if not body: break
    rows = body.get("data", [])
    if not rows: break
    for d in rows:
        args = d.get("args") or {}
        if "full_domain" in args:
            ts = d.get("timestamp", "")
            if HACKATHON_START_ISO <= ts <= HACKATHON_END_ISO:
                fd = (args.get("full_domain") or {}).get("parsed", "")
                addr = (args.get("address") or {}).get("parsed", "")
                domain_deploys.append({
                    "ts": ts,
                    "domain": fd,
                    "address": addr,
                    "deploy_hash": d.get("deploy_hash"),
                })
    earliest_ts = rows[-1].get("timestamp", "")
    if earliest_ts and earliest_ts < HACKATHON_START_ISO:
        break
    page += 1
    if page > 50: break
    time.sleep(0.04)
print(f"  domains registered by Association in window: {len(domain_deploys)}")
# Cross-reference: any domains registered to voter wallets?
voter_set = set(voter_funder.keys())
domains_to_voters = []
for dd in domain_deploys:
    addr_hash = (dd["address"] or "").replace("account-hash-", "")
    if addr_hash in voter_set:
        domains_to_voters.append({**dd, "is_voter": True})
print(f"  domains registered to VOTER wallets: {len(domains_to_voters)}")
for dd in domains_to_voters[:10]:
    print(f"    {dd['ts']}  {dd['domain']}  → voter {dd['address'][:30]}...")

(OUTDIR / "domain_registrations.json").write_text(json.dumps({
    "total_window_registrations": len(domain_deploys),
    "registrations_to_voters": len(domains_to_voters),
    "samples_to_voters": domains_to_voters[:50],
    "all_window_domains": [{"domain": d["domain"], "address": d["address"], "ts": d["ts"]} for d in domain_deploys[:100]],
}, indent=2))


# ===========================================================================
# Pass W — Halborn / NodeOps / DoraHacks name search
# ===========================================================================
print("\n\n[W] searching for Halborn / NodeOps / DoraHacks wallets via cspr.cloud contract search...")
for name in ["Halborn", "NodeOps", "DoraHacks", "Dora Hacks", "halborn"]:
    body = api(f"/contract-packages?search={name.replace(' ', '%20')}&page_size=5")
    if body and body.get("data"):
        print(f"\n  results for '{name}':")
        for r in body["data"]:
            print(f"    {r.get('name', '(no name)')} — pkg {r.get('contract_package_hash', '')[:18]}... owner {(r.get('owner_public_key') or '')[:18]}...")
    else:
        print(f"  '{name}': no results")


print("\n\nDone.")
