"""
Casper Hackathon 2026 — deployer-wallet extraction from project repos.

For each alive repo, clone shallowly, grep for Casper-format addresses:
  - Public keys: 01[64hex] (ed25519) or 02[66hex] (secp256k1)
  - Account hashes: account-hash-[64hex] or bare [64hex] with Casper context
  - Contract package hashes: hash-[64hex]
  - URefs: uref-[64hex]-[3hex]
  - Casper-shaped strings near Casper-context keywords

For each unique address, enrich via cspr.cloud (both mainnet + testnet) and
cross-reference with our voter / funder / project sets.

The key questions:
  Q1. What's the deployer wallet for each project? (= project team's real wallet)
  Q2. Did any deployer wallet vote in the FANR2 contract? (self-voting?)
  Q3. Did any deployer wallet receive post-Feb-5 CSPR from the Association?
      (prize payment that bypassed the project shell)
  Q4. Are deployer wallets connected to bot-funder pool?
"""

from __future__ import annotations
import csv, json, os, re, subprocess, time, urllib.error, urllib.request
from collections import Counter
from pathlib import Path

OUTDIR = Path("scripts/.casper-forensics-output")
CACHE = OUTDIR / ".repo-cache"
CACHE.mkdir(parents=True, exist_ok=True)
API_KEY = None
p = Path(".env.local")
if p.exists():
    for line in p.read_text().splitlines():
        if line.startswith("CSPR_CLOUD_API_KEY"):
            API_KEY = line.split("=",1)[1].strip()

# Load alive repos
with (OUTDIR / "github_forensics.json").open() as f: r1 = json.load(f)
with (OUTDIR / "github_forensics_round2.json").open() as f: r2 = json.load(f)
ALIVE = [(r["owner"], r["repo"]) for r in r1 + r2 if r.get("repo") and r.get("repo_exists")]
try:
    with (OUTDIR / "github_user_repos.json").open() as f:
        ur = json.load(f)
    for u, rs in ur.items():
        for rec in rs:
            if rec.get("name"):
                ALIVE.append((u, rec["name"]))
except FileNotFoundError: pass
ALIVE = list({(o,r) for o,r in ALIVE})
print(f"Alive repos to scan: {len(ALIVE)}")

# Load voter / funder / project sets for cross-reference
voter_set = set()
funder_set = set()
voter_funder_map = {}
with (OUTDIR / "voter_funding.csv").open() as f:
    for row in csv.DictReader(f):
        voter_set.add(row["voter_hash"])
        if row["first_funder_hash"]:
            funder_set.add(row["first_funder_hash"])
            voter_funder_map[row["voter_hash"]] = row["first_funder_hash"]

project_set = set()
with (OUTDIR / "project_identities.csv").open() as f:
    for row in csv.DictReader(f):
        project_set.add(row["project_hash"])
        if row.get("public_key"):
            project_set.add(row["public_key"])

print(f"Cross-ref sets: {len(voter_set)} voters, {len(funder_set)} funders, {len(project_set)} project hashes/keys")


# ============================================================================
# Pass 1: clone each repo shallowly + extract Casper-format addresses
# ============================================================================
print(f"\n[1/3] cloning + grepping {len(ALIVE)} alive repos...")

# Regex patterns
PATTERNS = {
    "pubkey_secp": re.compile(r'\b02[0-9a-fA-F]{66}\b'),
    "pubkey_ed":   re.compile(r'\b01[0-9a-fA-F]{64}\b'),
    "account_hash_pref": re.compile(r'account-hash-[0-9a-fA-F]{64}'),
    "contract_hash_pref": re.compile(r'hash-[0-9a-fA-F]{64}'),
    "uref": re.compile(r'uref-[0-9a-fA-F]{64}-[0-9a-fA-F]{3}'),
    "deploy_hash_pref": re.compile(r'deploy-[0-9a-fA-F]{64}'),
}
# Context window — bare 64-hex strings only count if near Casper keyword (within 200 chars)
CASPER_CONTEXT = re.compile(r'(?i)\b(casper|cspr|deploy|contract|account|uref|wasm|mainnet|testnet|node)\b')
BARE_64HEX = re.compile(r'\b[0-9a-fA-F]{64}\b')

per_repo_addresses: dict[str, dict] = {}

for i, (owner, repo) in enumerate(ALIVE):
    rid = f"{owner}/{repo}"
    target = CACHE / f"{owner}--{repo}"
    if not target.exists():
        try:
            subprocess.run(
                ["git", "clone", "--depth=1", "--quiet",
                 f"https://github.com/{owner}/{repo}.git", str(target)],
                capture_output=True, timeout=180
            )
        except Exception as e:
            print(f"  {i+1}/{len(ALIVE)} {rid}  CLONE FAILED: {e}")
            continue
    if not target.exists():
        print(f"  {i+1}/{len(ALIVE)} {rid}  no clone artifact")
        continue

    # Grep — walk the file tree, skip binary + huge files + git internals + node_modules
    found = {k: Counter() for k in PATTERNS}
    bare_64_with_context = Counter()
    files_scanned = 0
    for root, dirs, files in os.walk(target):
        dirs[:] = [d for d in dirs if d not in (".git", "node_modules", "target", "dist", "build", "out", "vendor")]
        for fn in files:
            fp = Path(root) / fn
            try:
                if fp.stat().st_size > 2_000_000:  # skip files >2MB
                    continue
                # Skip binary by checking extension
                if fp.suffix.lower() in (".png",".jpg",".jpeg",".gif",".pdf",".wasm",".zip",".tar",".gz",".bz2",".woff",".woff2",".ttf",".ico",".webp",".mp4",".mp3"):
                    continue
                text = fp.read_text(encoding="utf-8", errors="ignore")
                files_scanned += 1
                for name, pat in PATTERNS.items():
                    for m in pat.findall(text):
                        # Normalize: strip prefixes for hashes/account-hashes
                        norm = m.replace("account-hash-", "").replace("hash-", "").replace("deploy-", "").lower()
                        found[name][norm] += 1
                # Bare 64-hex — only count if within 200 chars of casper-keyword
                for m in BARE_64HEX.finditer(text):
                    start = max(0, m.start()-200); end = min(len(text), m.end()+200)
                    if CASPER_CONTEXT.search(text[start:end]):
                        bare_64_with_context[m.group().lower()] += 1
            except Exception:
                continue

    per_repo_addresses[rid] = {
        "files_scanned": files_scanned,
        "pubkey_secp": dict(found["pubkey_secp"]),
        "pubkey_ed": dict(found["pubkey_ed"]),
        "account_hash_pref": dict(found["account_hash_pref"]),
        "contract_hash_pref": dict(found["contract_hash_pref"]),
        "uref": dict(found["uref"]),
        "deploy_hash_pref": dict(found["deploy_hash_pref"]),
        "bare_64hex_with_context": dict(bare_64_with_context),
    }
    n_addr = sum(len(v) for v in [found["pubkey_secp"], found["pubkey_ed"], found["account_hash_pref"], found["contract_hash_pref"]])
    print(f"  {i+1}/{len(ALIVE)} {rid}  {files_scanned} files scanned, found pubkeys+hashes={n_addr}")

(OUTDIR / "per_repo_addresses.json").write_text(json.dumps(per_repo_addresses, indent=2, default=str))


# ============================================================================
# Pass 2: enrich every unique address via cspr.cloud (mainnet first)
# ============================================================================
print(f"\n[2/3] enriching unique addresses against cspr.cloud mainnet...")

def cspr_get(path: str, base: str = "https://api.cspr.cloud"):
    if not API_KEY: return None
    try:
        req = urllib.request.Request(f"{base}{path}", headers={"Authorization": API_KEY})
        with urllib.request.urlopen(req, timeout=15) as r:
            return json.loads(r.read())
    except urllib.error.HTTPError as e:
        if 400 <= e.code < 500: return None
        time.sleep(2); return None
    except Exception:
        return None

# Aggregate every unique address across all repos
unique_pubkeys = set()
unique_account_hashes = set()
for rid, data in per_repo_addresses.items():
    for pk in list(data["pubkey_secp"]) + list(data["pubkey_ed"]):
        unique_pubkeys.add(pk)
    for h in list(data["account_hash_pref"]) + list(data["contract_hash_pref"]) + list(data["bare_64hex_with_context"]):
        unique_account_hashes.add(h)

print(f"  Unique pubkeys found across all repos: {len(unique_pubkeys)}")
print(f"  Unique account-hash / contract-hash strings: {len(unique_account_hashes)}")

# Filter out obvious non-Casper hashes (those that match known git/JS hashes etc.)
# For account-hash form: must look like an actual Casper account hash. We'll
# verify by querying. False positives just return 404/null.

enriched: dict[str, dict] = {}
queried = 0

for pk in sorted(unique_pubkeys):
    info = cspr_get(f"/accounts/{pk}")
    queried += 1
    if info and info.get("data"):
        d = info["data"]
        enriched[pk] = {
            "type": "account_pubkey",
            "account_hash": d.get("account_hash"),
            "balance_motes": d.get("balance"),
            "in_voter_set": d.get("account_hash") in voter_set if d.get("account_hash") else False,
            "in_funder_set": d.get("account_hash") in funder_set if d.get("account_hash") else False,
            "in_project_set": (d.get("account_hash") in project_set or pk in project_set) if d.get("account_hash") else False,
        }
    if queried % 20 == 0:
        print(f"    queried {queried}/{len(unique_pubkeys)+len(unique_account_hashes)} addresses")
    time.sleep(0.05)

for ah in sorted(unique_account_hashes):
    if len(ah) != 64: continue
    # First try as account hash
    info = cspr_get(f"/accounts/{ah}")
    queried += 1
    if info and info.get("data"):
        d = info["data"]
        enriched[ah] = {
            "type": "account_hash",
            "public_key": d.get("public_key"),
            "balance_motes": d.get("balance"),
            "in_voter_set": ah in voter_set,
            "in_funder_set": ah in funder_set,
            "in_project_set": ah in project_set,
        }
        continue
    # Then try as contract package
    info2 = cspr_get(f"/contract-packages/{ah}")
    if info2 and info2.get("data"):
        d = info2["data"]
        enriched[ah] = {
            "type": "contract_package",
            "name": d.get("name"),
            "description": d.get("description"),
            "owner_public_key": d.get("owner_public_key"),
            "owner_hash": d.get("owner_hash"),
            "timestamp": d.get("timestamp"),
        }
    if queried % 20 == 0:
        print(f"    queried {queried} addresses, enriched {len(enriched)}")
    time.sleep(0.05)

print(f"\n  Total enriched (recognized by cspr.cloud mainnet): {len(enriched)}")
print(f"  Account pubkeys recognized: {sum(1 for v in enriched.values() if v.get('type')=='account_pubkey')}")
print(f"  Account hashes recognized: {sum(1 for v in enriched.values() if v.get('type')=='account_hash')}")
print(f"  Contract packages recognized: {sum(1 for v in enriched.values() if v.get('type')=='contract_package')}")

# ============================================================================
# Pass 3: per-repo summary — which repo found which addresses + cross-refs
# ============================================================================
print(f"\n[3/3] per-repo deployer summary...")
repo_summary = []
for rid, data in per_repo_addresses.items():
    all_addrs = set()
    for k in ("pubkey_secp","pubkey_ed","account_hash_pref","contract_hash_pref","bare_64hex_with_context"):
        for a in data[k]:
            all_addrs.add(a.replace("account-hash-","").replace("hash-",""))
    recognized = [a for a in all_addrs if a in enriched]
    rec = {
        "repo": rid,
        "files_scanned": data["files_scanned"],
        "total_unique_addrs": len(all_addrs),
        "recognized_by_cspr_cloud": len(recognized),
        "addresses": [],
    }
    for a in recognized:
        e = enriched[a]
        rec["addresses"].append({
            "address": a,
            **e,
        })
    repo_summary.append(rec)

# Sort: most recognized addresses first
repo_summary.sort(key=lambda x: -x["recognized_by_cspr_cloud"])

print(f"\n  {'repo':<55} {'files':>5} {'addrs':>5} {'recog':>5}")
for r in repo_summary:
    print(f"  {r['repo'][:55]:<55} {r['files_scanned']:>5} {r['total_unique_addrs']:>5} {r['recognized_by_cspr_cloud']:>5}")
    for a in r["addresses"][:5]:
        flag = ""
        if a.get("in_voter_set"): flag += " ★VOTER"
        if a.get("in_funder_set"): flag += " ★FUNDER"
        if a.get("in_project_set"): flag += " ★PROJECT"
        bal_raw = a.get('balance_motes')
        try:
            bal_disp = f"{int(bal_raw)/1e9:,.1f}" if bal_raw else '-'
        except (TypeError, ValueError):
            bal_disp = str(bal_raw) if bal_raw else '-'
        print(f"      {a['type']}: {a['address'][:30]}...  bal={bal_disp} CSPR{flag}")
        if a.get("name"):
            print(f"        name={a.get('name')}  ts={a.get('timestamp')}")

(OUTDIR / "deployer_trace.json").write_text(json.dumps({
    "per_repo": repo_summary,
    "enriched_addresses": enriched,
}, indent=2, default=str))
print("\nDone.")
