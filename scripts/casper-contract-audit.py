"""
Casper Hackathon 2026 R2 — Sherlock-level contract audit completion.

Closes the gaps the prior on-chain forensics didn't address. The Sherlock
6-phase audit framework specifies architecture review, static analysis,
manual code review (access control + reentrancy + oracles + precision +
economic), invariant testing, DeFi-economic review, and post-audit
monitoring.

We're auditing post-deployment, without source access, against a Casper-WASM
contract. The applicable gaps to close are:

  AC1. Full entry-point enumeration on the voting contract — what functions
       does it expose, what's privileged vs public?
  AC2. Contract version history — was the contract upgraded mid-hackathon?
       (we saw `version_id: 2` in deploys, so there are at least 2 versions)
  AC3. Casper Association `associated_keys` audit — Casper accounts support
       multi-sig via associated keys. Who else can sign for `0bc9335b…`?
  AC4. Contract source/WASM availability — try to pull the WASM bytecode
       from the chain, look for the source on GitHub.
"""

from __future__ import annotations
import json, os, time, urllib.error, urllib.request
from collections import Counter
from pathlib import Path

API_BASE = "https://api.cspr.cloud"
R2_PACKAGE = "cbf2518437fbf7f8bdc895dad8eb1bcc5ea4fa0b7978b33721ea73366ad42428"
R2_CONTRACT_V2 = "818a6d3628ddf3b9d4dc5073f9765085b799d22c87dc8faaec1cf9cfd22ea32c"  # from a deploy we saw
ASSOCIATION_HASH = "0bc9335b32b92985dd765680d3e058cf060efc1fba295f1b6342f58ea04f5d65"
ASSOCIATION_PK = "020322ea4248fb7a557dff9e18f3cfd3ccafb2e77cf89a50f01070f33d5618cb4586"
OUTDIR = Path("scripts/.casper-forensics-output")

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


# ============================================================================
# AC1 — Entry-point enumeration on the voting contract
# ============================================================================
print("[AC1] enumerating contract entry points...")
# Try a few endpoints to find entry points
candidates = [
    f"/contract-packages/{R2_PACKAGE}/contracts?page_size=100",
    f"/contracts/{R2_CONTRACT_V2}/entry-points",
    f"/contracts/{R2_CONTRACT_V2}",
    f"/contract-packages/{R2_PACKAGE}/versions",
    f"/contracts?contract_package_hash={R2_PACKAGE}",
    f"/entry-points?contract_package_hash={R2_PACKAGE}",
]
for c in candidates:
    body = api(c)
    if body:
        s = json.dumps(body, indent=2)
        print(f"\n  ✓ {c}\n    {s[:1500]}")
    else:
        print(f"  ✗ {c}")

# Also collect distinct entry_point_id values seen in raw_deploys
with (OUTDIR / "raw_deploys.json").open() as f:
    deploys = json.load(f)
ep_seen = Counter()
contract_hash_seen = Counter()
for d in deploys:
    if d.get("entry_point_id"):
        ep_seen[d["entry_point_id"]] += 1
    if d.get("contract_hash"):
        contract_hash_seen[d["contract_hash"]] += 1
print(f"\n  Distinct entry_point_ids observed in voting deploys: {list(ep_seen)}")
print(f"  Distribution: {dict(ep_seen)}")
print(f"  Distinct contract_hash values seen (= versions of the package used in voting):")
for ch, n in contract_hash_seen.most_common():
    print(f"    {ch}  → {n} deploys")


# ============================================================================
# AC2 — Contract version history (was it upgraded mid-hackathon?)
# ============================================================================
print("\n[AC2] contract version history...")
# Each contract_hash is a distinct deployed version. We've seen version_id: 2 in deploys.
# Pull each contract_hash's metadata to get its deployment timestamp.
for ch in contract_hash_seen:
    body = api(f"/contracts/{ch}")
    if body and body.get("data"):
        d = body["data"]
        print(f"\n  contract_hash {ch}:")
        print(f"    contract_package_hash: {d.get('contract_package_hash')}")
        print(f"    version: {d.get('protocol_version') or d.get('version')}")
        print(f"    timestamp: {d.get('timestamp')}")
        # Entry points if available
        for k in d:
            if k.lower().startswith("entry") or "entry" in k.lower():
                print(f"    {k}: {d[k]}")
    else:
        print(f"  contract_hash {ch}: no metadata")

# Also try the contract-packages endpoint with version listing
body = api(f"/contract-packages/{R2_PACKAGE}/versions")
if body and body.get("data"):
    print(f"\n  Contract package versions ({len(body['data'])}):")
    for v in body["data"]:
        print(f"    {json.dumps(v)}")


# ============================================================================
# AC3 — Casper Association multi-sig / associated_keys audit
# ============================================================================
print("\n[AC3] Casper Association associated_keys audit...")
body = api(f"/accounts/{ASSOCIATION_HASH}")
if body and body.get("data"):
    d = body["data"]
    print(f"  account_hash: {d.get('account_hash')}")
    print(f"  main_purse: {d.get('main_purse_uref')}")
    print(f"  deployment_threshold: {d.get('deployment_threshold')}")
    print(f"  key_management_threshold: {d.get('key_management_threshold')}")
    associated = d.get("associated_keys", [])
    print(f"  associated_keys (count: {len(associated)}):")
    for ak in associated:
        print(f"    {json.dumps(ak)}")
    print(f"  named_keys: {len(d.get('named_keys', []))}")
    if d.get("named_keys"):
        for nk in (d.get("named_keys") or [])[:30]:
            print(f"    {json.dumps(nk)[:120]}")


# ============================================================================
# AC4 — Contract source / WASM availability
# ============================================================================
print("\n[AC4] checking for contract WASM / source...")
# Casper RPC node-level: query_global_state can fetch contract bytes. Tatum free RPC.
TATUM = "https://casper-mainnet.gateway.tatum.io"
import urllib.request
def jsonrpc(method, params):
    body = json.dumps({"jsonrpc":"2.0","id":1,"method":method,"params":params}).encode()
    req = urllib.request.Request(TATUM, data=body, headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            return json.loads(r.read())
    except Exception as e:
        return {"error": str(e)}

# Try state_get_dictionary_item or query_global_state on the contract
state_root = jsonrpc("info_get_status", [])
state_root_hash = (state_root.get("result") or {}).get("last_added_block_info", {}).get("state_root_hash") or \
                  (state_root.get("result") or {}).get("our_public_signing_key")
print(f"  state_root_hash query: {(state_root.get('result') or {}).get('last_added_block_info', {}).get('state_root_hash', '(not exposed)')}")

# Try cspr.cloud direct contract endpoint with WASM hint
body = api(f"/contracts/{R2_CONTRACT_V2}")
if body:
    print(f"  /contracts/{R2_CONTRACT_V2[:18]}... full payload:")
    print(json.dumps(body, indent=2)[:2000])


print("\nDone.")
