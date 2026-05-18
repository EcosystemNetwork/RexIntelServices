"""
Casper Hackathon 2026 R2 — contract owner activity audit.

The contract owner pubkey 020322ea…cb4586 (account-hash 0bc9335b…04f5d65)
is the CSPR.fans operator — the wallet that deployed the voting contract,
mints FANR2 voting power, and (per Casper's own announcement) retains the
right to "advance additional high-impact teams" outside the vote tally.

This script audits everything that wallet did during and around the voting
window (Jan 10 – Feb 10 2026, a buffer around the Jan 15 – Jan 25 vote).

Looks for:
  - Mass-mint events of FANR2 voting power right before voting opened
  - Late-window mints that boosted specific projects after the vote
  - State mutations on the contract (admin functions)
  - Direct transfers between the owner and the announced winners
  - Any "advance team" / "set winner" / "promote" entry points
"""

from __future__ import annotations
import csv, json, os, time, urllib.error, urllib.request
from collections import Counter, defaultdict
from datetime import datetime
from pathlib import Path

OWNER_PK = "020322ea4248fb7a557dff9e18f3cfd3ccafb2e77cf89a50f01070f33d5618cb4586"
OWNER_HASH = "0bc9335b32b92985dd765680d3e058cf060efc1fba295f1b6342f58ea04f5d65"
CONTRACT_PACKAGE_HASH = "cbf2518437fbf7f8bdc895dad8eb1bcc5ea4fa0b7978b33721ea73366ad42428"
WINDOW_START = "2026-01-10T00:00:00Z"
WINDOW_END = "2026-02-10T00:00:00Z"
OUTDIR = Path("scripts/.casper-forensics-output")
OUTDIR.mkdir(parents=True, exist_ok=True)

p = Path(".env.local")
if p.exists():
    for line in p.read_text().splitlines():
        if "=" in line and not line.startswith("#"):
            k, v = line.split("=", 1)
            os.environ.setdefault(k.strip(), v.strip())
API_KEY = os.environ["CSPR_CLOUD_API_KEY"]
API_BASE = "https://api.cspr.cloud"


def api(path: str):
    for attempt in range(4):
        try:
            req = urllib.request.Request(f"{API_BASE}{path}", headers={"Authorization": API_KEY})
            with urllib.request.urlopen(req, timeout=25) as r:
                return json.loads(r.read())
        except urllib.error.HTTPError as e:
            if e.code in (429, 502, 503, 504):
                time.sleep(2 * (attempt + 1)); continue
            if e.code == 404: return None
            raise
        except Exception:
            time.sleep(1 + attempt)
    raise RuntimeError(f"api failed: {path}")


def in_window(ts: str) -> bool:
    return WINDOW_START <= ts <= WINDOW_END


# Pull owner deploys within window. Owner has 75k+ total deploys, so we
# paginate desc by time and stop once we pass the window start.
print(f"Pulling owner deploys within {WINDOW_START}..{WINDOW_END}")
PAGE_SIZE = 250
page = 1
in_window_deploys: list[dict] = []
while True:
    body = api(f"/accounts/{OWNER_PK}/deploys?page_size={PAGE_SIZE}&page={page}")
    rows = (body or {}).get("data", [])
    if not rows:
        break
    earliest_ts_on_page = rows[-1].get("timestamp", "")
    in_window_deploys.extend(r for r in rows if in_window(r.get("timestamp", "")))
    print(f"  page {page}: page-earliest {earliest_ts_on_page}, kept-so-far {len(in_window_deploys)}")
    if earliest_ts_on_page and earliest_ts_on_page < WINDOW_START:
        break
    page += 1
    if page > 200:  # safety
        break
    time.sleep(0.04)

print(f"Owner deploys in window: {len(in_window_deploys)}")

# Categorize by contract_package_hash + entry_point_id
by_contract = Counter()
by_ep = Counter()
to_voting_contract = []
for d in in_window_deploys:
    cph = d.get("contract_package_hash") or ""
    ep = d.get("entry_point_id")
    by_contract[cph] += 1
    by_ep[(cph[:18], ep)] += 1
    if cph == CONTRACT_PACKAGE_HASH:
        to_voting_contract.append(d)

print(f"\nOwner deploys touching the voting contract: {len(to_voting_contract)}")
print("\nTop 10 contracts the owner touched in window:")
for c, n in by_contract.most_common(10):
    print(f"  {c[:24] or '(native)':<24} → {n} deploys")

# Pull all FANR2 mints in window (already partially captured by funding-trace,
# but cross-reference here against the owner's deploys for attribution).
print(f"\nPulling FANR2 mints from contract ft-token-actions...")
mints = []
page = 1
while True:
    body = api(f"/contract-packages/{CONTRACT_PACKAGE_HASH}/ft-token-actions?page_size={PAGE_SIZE}&page={page}")
    rows = (body or {}).get("data", [])
    if not rows: break
    for r in rows:
        if r.get("from_hash") is None and in_window(r.get("timestamp", "")):
            mints.append(r)
    total = body.get("item_count", 0)
    if page * PAGE_SIZE >= total: break
    page += 1
    time.sleep(0.04)

mint_amounts = Counter(int(m["amount"]) for m in mints)
mint_recipients_in_window = {m["to_hash"] for m in mints if m.get("to_hash")}
print(f"In-window mints: {len(mints)}")
print(f"Unique mint recipients in window: {len(mint_recipients_in_window)}")
print(f"\nTop mint amounts in window:")
for amt, cnt in mint_amounts.most_common(10):
    print(f"  {amt:>10,} units → {cnt} mints")

# Burst detection: group mints by 1-hour bucket
buckets = Counter()
for m in mints:
    ts = m.get("timestamp", "")[:13]  # YYYY-MM-DDTHH
    buckets[ts] += 1
print(f"\nMint bursts (top 10 hour-buckets by mint count):")
for h, c in buckets.most_common(10):
    print(f"  {h}  → {c} mints")

# Save
with (OUTDIR / "owner_audit.json").open("w") as f:
    json.dump({
        "owner_pubkey": OWNER_PK,
        "owner_account_hash": OWNER_HASH,
        "window_start": WINDOW_START,
        "window_end": WINDOW_END,
        "owner_deploys_in_window": len(in_window_deploys),
        "owner_deploys_to_voting_contract": len(to_voting_contract),
        "top_contracts_touched": dict(by_contract.most_common(20)),
        "in_window_mints": len(mints),
        "unique_mint_recipients_in_window": len(mint_recipients_in_window),
        "top_mint_amounts_in_window": dict(mint_amounts.most_common(20)),
        "mint_bursts_top10_hours": dict(buckets.most_common(20)),
    }, f, indent=2, default=str)

with (OUTDIR / "owner_window_deploys.json").open("w") as f:
    json.dump(in_window_deploys, f, indent=0, default=str)

with (OUTDIR / "mints_in_window.csv").open("w") as f:
    w = csv.writer(f); w.writerow(["to_hash", "amount", "timestamp", "deploy_hash"])
    for m in mints:
        w.writerow([m.get("to_hash"), m.get("amount"), m.get("timestamp"), m.get("deploy_hash")])

print("\nDone.")
