"""
Casper Hackathon 2026 R2 — stablecoin payout + project identity, final on-chain pass.

Pass H1: Stablecoin payouts. Pass H checked native CSPR only. This pulls the
full ft-token-actions log for each top-7 project wallet, filtered to events
after the Feb 5 2026 recap. If USDC/USDT or any other stablecoin landed in
these wallets post-hackathon, this surfaces it.

Pass I: Project identity attempts. Tries three on-chain routes to derive a
human-readable name or attribution for each top-7 project wallet:
  (a) outgoing transfers (often go to the project lead's personal wallet)
  (b) deploys SIGNED by the project account (if the project was actually
      a contract deployment, this reveals what dApp it was)
  (c) named keys on the account state

Also probes for the R1 (Qualification) voting contract by searching for
Hackathon-2026-R1 by name via contract listings.
"""

from __future__ import annotations
import csv, json, os, time, urllib.error, urllib.request
from collections import Counter
from pathlib import Path

API_BASE = "https://api.cspr.cloud"
ASSOCIATION_HASH = "0bc9335b32b92985dd765680d3e058cf060efc1fba295f1b6342f58ea04f5d65"
POST_HACKATHON_START = "2026-02-05T00:00:00Z"
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


# Load top-7 project hashes from the scorecard
with (INDIR / "project_scorecard.csv").open() as f:
    rows = list(csv.DictReader(f))
top7 = sorted(rows, key=lambda r: -int(r["total_fanr2_received"]))[:7]


# ---------- Pass H1: stablecoin / CEP-18 payouts ----------
print("[H1] CEP-18 token payouts to top-7 project wallets after Feb 5...")
stablecoin_findings: list[dict] = []
known_stables = {
    # Known Casper stablecoin contract package hashes (will fill in as we find them)
}
for r in top7:
    ph = r["project_hash"]
    pk = r["project_public_key"]
    if not pk:
        stablecoin_findings.append({"project_hash": ph, "status": "no pubkey"}); continue
    actions = []
    page = 1
    while True:
        body = api(f"/accounts/{pk}/ft-token-actions?page_size=250&page={page}")
        if not body: break
        rows_ = body.get("data", [])
        if not rows_: break
        actions.extend(rows_)
        total = body.get("item_count", 0)
        if page * 250 >= total: break
        page += 1
        if page > 30: break
        time.sleep(0.04)

    post_inflow = [a for a in actions if a.get("to_hash") == ph and a.get("timestamp", "") >= POST_HACKATHON_START and a.get("from_hash")]
    post_outflow = [a for a in actions if a.get("from_hash") == ph and a.get("timestamp", "") >= POST_HACKATHON_START]
    # Group inflow by contract_package_hash (which token)
    by_token_in = {}
    for a in post_inflow:
        cph = a.get("contract_package_hash", "")
        by_token_in.setdefault(cph, []).append(a)
    # Aggregate
    inflow_summary = []
    for cph, evs in by_token_in.items():
        total_amt = sum(int(e.get("amount", 0)) for e in evs)
        from_assoc = sum(1 for e in evs if e.get("from_hash") == ASSOCIATION_HASH)
        # fetch the contract metadata for symbol/name
        meta = api(f"/contract-packages/{cph}") if cph else None
        token_name = ((meta or {}).get("data", {}).get("name", "") if meta else "") or cph[:16]
        token_symbol = (((meta or {}).get("data", {}).get("metadata") or {}).get("symbol", "") if meta else "")
        inflow_summary.append({
            "token_contract": cph,
            "token_name": token_name,
            "token_symbol": token_symbol,
            "n_inflow_events": len(evs),
            "n_from_association": from_assoc,
            "total_units_received": total_amt,
            "earliest_inflow_ts": min(e["timestamp"] for e in evs),
            "latest_inflow_ts": max(e["timestamp"] for e in evs),
        })

    stablecoin_findings.append({
        "project_hash": ph,
        "project_pubkey": pk,
        "fanr2_received": r["total_fanr2_received"],
        "total_ft_actions_alltime": len(actions),
        "post_feb5_inflow_events": len(post_inflow),
        "post_feb5_outflow_events": len(post_outflow),
        "post_feb5_inflow_by_token": inflow_summary,
    })
    print(f"  proj #{ph[:18]}...  all-time FT actions: {len(actions):>4}  post-Feb5 inflow events: {len(post_inflow):>3}  outflow events: {len(post_outflow):>3}")
    if inflow_summary:
        for s in inflow_summary:
            print(f"    ← {s['n_inflow_events']:>3} events of {s['token_symbol'] or s['token_name'][:18]}, total {s['total_units_received']:,} ({s['n_from_association']} from Association)")
    time.sleep(0.05)

(OUTDIR / "stablecoin_payouts.json").write_text(json.dumps(stablecoin_findings, indent=2, default=str))


# ---------- Pass I: project identity attempts ----------
print("\n[I] project-identity attempts (outgoing transfers + named keys + signed deploys)...")
project_identity: list[dict] = []
for r in top7:
    ph = r["project_hash"]
    pk = r["project_public_key"]
    if not pk:
        project_identity.append({"project_hash": ph, "status": "no pubkey"}); continue
    # (a) full account info including named_keys
    acct = api(f"/accounts/{pk}")
    named_keys = ((acct or {}).get("data", {}) or {}).get("named_keys", []) or []
    # (b) outgoing transfers — where did the project SEND funds (if anywhere)?
    outgoing = api(f"/accounts/{pk}/transfers?page_size=50&page=1")
    out_data = (outgoing or {}).get("data", [])
    # Filter for outgoing only (from == project) — but the endpoint returns both. Filter:
    out_only = [t for t in out_data if (t.get("initiator_account_hash") == ph) or (t.get("from_purse", "").startswith("uref-"))]
    # (c) deploys signed by the project (i.e. deploys WHERE the project IS THE CALLER)
    signed = api(f"/accounts/{pk}/deploys?page_size=20&page=1")
    signed_data = (signed or {}).get("data", [])
    # Look for contract deployments — those reveal what dApp the project built
    contract_deploys = [d for d in signed_data if d.get("execution_type_id") in (1, 2, 3) or (d.get("args") or {}).get("contract_name")]
    pi = {
        "project_hash": ph,
        "project_pubkey": pk,
        "fanr2_received": r["total_fanr2_received"],
        "named_keys_count": len(named_keys),
        "named_keys_sample": named_keys[:5],
        "outgoing_transfers_sample_count": len(out_only),
        "outgoing_transfers_sample": [{"to": t.get("initiator_account_hash"), "amount": t.get("amount"), "ts": t.get("timestamp")} for t in out_only[:5]],
        "signed_deploys_count": len(signed_data),
        "signed_deploys_sample": [{
            "deploy_hash": d.get("deploy_hash"),
            "contract_package_hash": d.get("contract_package_hash"),
            "entry_point_id": d.get("entry_point_id"),
            "ts": d.get("timestamp"),
            "args_keys": list((d.get("args") or {}).keys())[:5],
        } for d in signed_data[:5]],
    }
    project_identity.append(pi)
    print(f"  proj #{ph[:18]}...  named_keys: {len(named_keys)}, signed deploys: {len(signed_data)}, outgoing xfers: {len(out_only)}")
    if named_keys:
        print(f"    named_keys sample: {[k.get('name') if isinstance(k, dict) else str(k)[:40] for k in named_keys[:3]]}")
    time.sleep(0.05)

(OUTDIR / "project_identity_probe.json").write_text(json.dumps(project_identity, indent=2, default=str))


# ---------- Pass J: R1 contract search ----------
print("\n[J] R1 (Qualification) contract search by name...")
for q in ["Hackathon 2026 R1", "Hackathon 2026 R1 - Qualification", "Hackathon R1", "FANR1"]:
    # cspr.cloud may support search via /contract-packages?search= or similar
    for endpoint in [f"/contract-packages?search={q.replace(' ', '%20')}&page_size=5",
                     f"/contract-packages?name={q.replace(' ', '%20')}&page_size=5",
                     f"/search?q={q.replace(' ', '%20')}"]:
        body = api(endpoint)
        if body and body.get("data"):
            print(f"  found via {endpoint}: {body}")
            break
    else:
        continue
    break
else:
    print("  no R1 contract found via name search; would need to manually enumerate Casper Association contract deployments")

print("\nDone.")
