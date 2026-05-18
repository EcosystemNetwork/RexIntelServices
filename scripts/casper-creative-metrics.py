"""
Casper Hackathon 2026 R2 — creative-metrics battery.

Eight on-chain analyses Rex Deus asked for, designed to extract every remaining
truth out of the 1,869-deploy / 749-voter dataset before pivoting to off-chain
evidence (DMs, screenshots, public communications).

K. Vote-timing forensics
   - Per-hour and per-day histograms
   - Day-of-week breakdown
   - Time-of-day distribution (off-peak burst detection)
   - Inter-vote gap distribution for repeat voters

L. Co-temporal wallet clustering (the IP-proxy)
   - Block-level co-occurrence of voters
   - Wallet pairs that repeatedly land in the same block = scripted together
   - Same-block-cluster graph

M. Same-block batch funding analysis
   - Group voters by (funding_sender, funding_block_height)
   - Same-block, same-sender = batched bot spawn

N. Association → bot-funder direct transfer check
   - Did the Casper Association send CSPR to the top 5 bot-funder wallets directly?

O. Project-funder == voter-funder identity test
   - For each top-7 project: who funded its shell wallet's first CSPR?
   - Check if that same wallet is also a voter-funder
   - Project-funder ∩ voter-funder = coordinated rigging

P. Validator-node concentration
   - Which validators produced the blocks containing vote-deploys?
   - Disproportionate share = likely co-located operator infrastructure

Q. Vote-id sequence gap analysis
   - vote_ids are sequential strings — gaps reveal cancelled / expired votes

R. Inter-voter funding graph (voter-to-voter CSPR transfers)
   - Did voters fund each other? Internal plumbing in the bot pool?
"""

from __future__ import annotations
import csv, json, os, time, urllib.error, urllib.request
from collections import Counter, defaultdict
from datetime import datetime
from pathlib import Path

API_BASE = "https://api.cspr.cloud"
ASSOCIATION_HASH = "0bc9335b32b92985dd765680d3e058cf060efc1fba295f1b6342f58ea04f5d65"
ASSOCIATION_PK = "020322ea4248fb7a557dff9e18f3cfd3ccafb2e77cf89a50f01070f33d5618cb4586"
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


def parse_ts(s: str) -> datetime:
    return datetime.fromisoformat(s.replace("Z", "+00:00"))


def voter_hash_of(deploy: dict) -> str:
    """Safe extractor for args.voter.parsed account-hash."""
    args = deploy.get("args") or {}
    voter_field = args.get("voter") or {}
    parsed = voter_field.get("parsed") if isinstance(voter_field, dict) else None
    if not isinstance(parsed, str):
        return ""
    return parsed.replace("account-hash-", "")


def project_hash_of(deploy: dict) -> str:
    args = deploy.get("args") or {}
    proj_field = args.get("project") or {}
    parsed = proj_field.get("parsed") if isinstance(proj_field, dict) else None
    if not isinstance(parsed, str):
        return ""
    return parsed.replace("account-hash-", "")


def vote_id_of(deploy: dict) -> str:
    args = deploy.get("args") or {}
    vid_field = args.get("vote_id") or {}
    parsed = vid_field.get("parsed") if isinstance(vid_field, dict) else None
    return parsed if isinstance(parsed, str) else ""


# ---------- Load prior-pass data ----------
print("Loading...")
with (INDIR / "raw_deploys.json").open() as f:
    deploys = json.load(f)
voter_funder = {}
with (INDIR / "voter_funding.csv").open() as f:
    for row in csv.DictReader(f):
        if row["first_funder_hash"]:
            voter_funder[row["voter_hash"]] = {
                "funder_hash": row["first_funder_hash"],
                "fund_amount_motes": int(row.get("first_fund_amount_motes") or 0),
                "fund_ts": row.get("first_fund_ts", ""),
            }
top_funders = []
with (INDIR / "funder_clusters.csv").open() as f:
    for row in csv.DictReader(f):
        top_funders.append({"hash": row["funder_hash"], "voters_funded": int(row["voters_funded"])})
top_5_bot_funders = [f["hash"] for f in top_funders[:5]]  # Top 5 by # of voters funded
print(f"  loaded {len(deploys)} deploys, {len(voter_funder)} funded voters")
print(f"  top-5 funders: {[h[:14] for h in top_5_bot_funders]}")


# ===========================================================================
# Pass K — vote timing forensics
# ===========================================================================
print("\n[K] vote-timing forensics...")
per_hour = Counter()    # YYYY-MM-DDTHH
per_day = Counter()     # YYYY-MM-DD
per_hour_of_day_utc = Counter()  # 0..23
per_dow = Counter()     # 0=Mon..6=Sun
voter_vote_times: dict[str, list[datetime]] = defaultdict(list)
for d in deploys:
    ts = parse_ts(d["timestamp"])
    per_hour[ts.strftime("%Y-%m-%dT%H")] += 1
    per_day[ts.strftime("%Y-%m-%d")] += 1
    per_hour_of_day_utc[ts.hour] += 1
    per_dow[ts.weekday()] += 1
    v = voter_hash_of(d)
    if v:
        voter_vote_times[v].append(ts)

print("\n  Per-day vote counts:")
for day in sorted(per_day):
    print(f"    {day}  {per_day[day]:>4}  {'#' * min(per_day[day] // 5, 60)}")

print("\n  Hour-of-day UTC distribution:")
for h in range(24):
    c = per_hour_of_day_utc[h]
    print(f"    {h:>2}:00 UTC  {c:>4}  {'#' * min(c // 5, 50)}")

print("\n  Day-of-week distribution (0=Mon..6=Sun):")
dow_names = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
for d_, c in per_dow.most_common():
    print(f"    {dow_names[d_]}  {c:>4}")

# Inter-vote gaps for repeat voters
gaps_seconds = []
for v, times in voter_vote_times.items():
    times.sort()
    for a, b in zip(times, times[1:]):
        gaps_seconds.append((b - a).total_seconds())
if gaps_seconds:
    gaps_seconds.sort()
    print("\n  Inter-vote gap distribution (seconds between successive votes by same voter):")
    print(f"    min: {gaps_seconds[0]:.0f}s, median: {gaps_seconds[len(gaps_seconds)//2]:.0f}s, max: {gaps_seconds[-1]:.0f}s")
    under_60s = sum(1 for g in gaps_seconds if g < 60)
    under_5m = sum(1 for g in gaps_seconds if g < 300)
    under_1h = sum(1 for g in gaps_seconds if g < 3600)
    print(f"    <60s gaps:  {under_60s} ({100*under_60s/len(gaps_seconds):.1f}%)")
    print(f"    <5m gaps:   {under_5m} ({100*under_5m/len(gaps_seconds):.1f}%)")
    print(f"    <1h gaps:   {under_1h} ({100*under_1h/len(gaps_seconds):.1f}%)")

(OUTDIR / "timing_analysis.json").write_text(json.dumps({
    "per_day": dict(per_day),
    "per_hour_of_day_utc": dict(per_hour_of_day_utc),
    "per_dow": {dow_names[k]: v for k, v in per_dow.items()},
    "inter_vote_gap_count": len(gaps_seconds),
    "inter_vote_under_60s": sum(1 for g in gaps_seconds if g < 60),
    "inter_vote_under_5m": sum(1 for g in gaps_seconds if g < 300),
    "inter_vote_under_1h": sum(1 for g in gaps_seconds if g < 3600),
}, indent=2))


# ===========================================================================
# Pass L — co-temporal wallet clustering (block-level co-occurrence)
# ===========================================================================
print("\n[L] block-level voter co-occurrence (IP-proxy)...")
voters_per_block: dict[int, set[str]] = defaultdict(set)
for d in deploys:
    bh = d.get("block_height")
    v = voter_hash_of(d)
    if bh and v:
        voters_per_block[bh].add(v)

# Blocks with multiple distinct voters
multi_voter_blocks = {b: vs for b, vs in voters_per_block.items() if len(vs) > 1}
print(f"  Total blocks with vote-deploys: {len(voters_per_block)}")
print(f"  Blocks with ≥2 distinct voters: {len(multi_voter_blocks)}")
print(f"  Blocks with ≥3 distinct voters: {sum(1 for v in multi_voter_blocks.values() if len(v) >= 3)}")
print(f"  Blocks with ≥5 distinct voters: {sum(1 for v in multi_voter_blocks.values() if len(v) >= 5)}")
print(f"  Largest single-block voter cluster: {max((len(v) for v in voters_per_block.values()), default=0)}")

# Co-occurrence pairs: count, for each pair (A,B), # of blocks they both appear in
pair_counts: Counter = Counter()
for vs in multi_voter_blocks.values():
    vs_sorted = sorted(vs)
    for i in range(len(vs_sorted)):
        for j in range(i + 1, len(vs_sorted)):
            pair_counts[(vs_sorted[i], vs_sorted[j])] += 1

print(f"\n  Top 15 voter PAIRS by # of shared blocks (scripted-together signal):")
for (a, b), c in pair_counts.most_common(15):
    fa = voter_funder.get(a, {}).get("funder_hash", "")[:14]
    fb = voter_funder.get(b, {}).get("funder_hash", "")[:14]
    same_funder = "★SAME FUNDER" if fa and fa == fb else ""
    print(f"    {a[:14]}... & {b[:14]}...  {c:>3} shared blocks  {same_funder}")
print(f"  (★ = both voters funded by the same wallet — strongest co-script signal)")

# Cluster: connected components in the "share ≥3 blocks" graph
from collections import deque
adj = defaultdict(set)
for (a, b), c in pair_counts.items():
    if c >= 3:
        adj[a].add(b); adj[b].add(a)
visited = set()
clusters = []
for v in adj:
    if v in visited: continue
    cluster = set()
    q = deque([v])
    while q:
        x = q.popleft()
        if x in visited: continue
        visited.add(x); cluster.add(x)
        for n in adj[x]:
            if n not in visited: q.append(n)
    if len(cluster) >= 3:
        clusters.append(cluster)
clusters.sort(key=len, reverse=True)
print(f"\n  Connected wallet clusters (≥3 shared blocks per edge, ≥3 nodes per cluster): {len(clusters)}")
for i, c in enumerate(clusters[:5]):
    print(f"    cluster #{i+1}: {len(c)} voters")
    # Show funder concentration in this cluster
    cluster_funders = Counter(voter_funder.get(v, {}).get("funder_hash", "") for v in c if voter_funder.get(v))
    if cluster_funders:
        for f, n in cluster_funders.most_common(3):
            if f: print(f"      → {n} of {len(c)} funded by {f[:14]}...")

(OUTDIR / "block_co_occurrence.json").write_text(json.dumps({
    "total_blocks_with_votes": len(voters_per_block),
    "blocks_multi_voter": len(multi_voter_blocks),
    "blocks_3plus_voters": sum(1 for v in multi_voter_blocks.values() if len(v) >= 3),
    "blocks_5plus_voters": sum(1 for v in multi_voter_blocks.values() if len(v) >= 5),
    "largest_block_cluster_size": max((len(v) for v in voters_per_block.values()), default=0),
    "top_pairs": [{"a": a, "b": b, "shared_blocks": c} for (a, b), c in pair_counts.most_common(50)],
    "clusters_geq3": [sorted(c) for c in clusters[:20]],
}, indent=2))


# ===========================================================================
# Pass M — same-block batch funding analysis
# ===========================================================================
print("\n[M] same-block batch funding (was the voter pool spawned in batches?)...")
# For each voter, we have (funder_hash, fund_ts). Group by (funder_hash, fund_ts) —
# voters funded in the same exact second from the same sender = same-tx batch.
# Stronger: group by funding block_height (need to fetch transfer details).
# Quick test: group by (funder_hash, fund_ts) — if same second + same sender + N>1
# voters, that's a batch.
batches: dict[tuple, list[str]] = defaultdict(list)
for vh, vf in voter_funder.items():
    key = (vf["funder_hash"], vf["fund_ts"])
    batches[key].append(vh)
big_batches = [(k, v) for k, v in batches.items() if len(v) >= 2]
big_batches.sort(key=lambda x: -len(x[1]))
print(f"  Total funding-second buckets: {len(batches)}")
print(f"  Buckets with ≥2 voters (same sender + same second): {len(big_batches)}")
print(f"  Buckets with ≥5: {sum(1 for _, v in big_batches if len(v) >= 5)}")
print(f"  Buckets with ≥10: {sum(1 for _, v in big_batches if len(v) >= 10)}")
print(f"\n  Top 10 batch-spawn events:")
for (funder, ts), members in big_batches[:10]:
    print(f"    {ts}  funder {funder[:14]}...  → batch-spawned {len(members)} voters in same second")

(OUTDIR / "batch_funding.json").write_text(json.dumps({
    "total_buckets": len(batches),
    "buckets_2plus": len(big_batches),
    "buckets_5plus": sum(1 for _, v in big_batches if len(v) >= 5),
    "buckets_10plus": sum(1 for _, v in big_batches if len(v) >= 10),
    "top_batches": [{"funder_hash": f, "ts": ts, "batch_size": len(m), "voter_hashes": m}
                    for (f, ts), m in big_batches[:30]],
}, indent=2))


# ===========================================================================
# Pass N — Association → top bot-funder direct transfer check
# ===========================================================================
print("\n[N] Casper Association → top bot-funder direct transfers...")
# Pull Association's outgoing transfers and check destinations
all_assoc_transfers = []
page = 1
while True:
    body = api(f"/accounts/{ASSOCIATION_PK}/transfers?page_size=500&page={page}")
    if not body: break
    rows = body.get("data", [])
    if not rows: break
    all_assoc_transfers.extend(rows)
    total = body.get("item_count", 0)
    print(f"  page {page}: +{len(rows)} (total: {len(all_assoc_transfers)} / {total})")
    if len(all_assoc_transfers) >= total: break
    page += 1
    if page > 50: break  # safety; this account has ~75k deploys but transfers may be fewer
    time.sleep(0.04)

# Filter outgoing (from Association to elsewhere)
assoc_outgoing = [t for t in all_assoc_transfers if t.get("initiator_account_hash") == ASSOCIATION_HASH]
print(f"  Association total transfers: {len(all_assoc_transfers)}, outgoing: {len(assoc_outgoing)}")

# Did Association send to any top-funder?
to_top_funders = []
for t in assoc_outgoing:
    to_hash = t.get("to_account_hash") or t.get("to") or ""
    for tf in top_5_bot_funders:
        if to_hash == tf:
            to_top_funders.append({**t, "matched_bot_funder": tf})
print(f"  Direct transfers from Association to top-5 bot-funders: {len(to_top_funders)}")
for t in to_top_funders[:10]:
    print(f"    {t.get('timestamp')}  → {t['matched_bot_funder'][:14]}...  amount {int(t.get('amount',0))/1e9:.2f} CSPR")

(OUTDIR / "association_to_botfunders.json").write_text(json.dumps({
    "association_outgoing_transfers_total": len(assoc_outgoing),
    "direct_transfers_to_top_botfunders": len(to_top_funders),
    "samples": to_top_funders[:20],
}, indent=2, default=str))


# ===========================================================================
# Pass O — Project-funder ∩ voter-funder
# ===========================================================================
print("\n[O] project-funder ∩ voter-funder identity test...")
# Get project funders from project_identities.csv
project_funders: dict[str, str] = {}
with (INDIR / "project_identities.csv").open() as f:
    for row in csv.DictReader(f):
        if row.get("first_funder_hash"):
            project_funders[row["project_hash"]] = row["first_funder_hash"]
# Get top-7 projects
top7_projects = []
with (INDIR / "project_scorecard.csv").open() as f:
    rows = list(csv.DictReader(f))
    top7_projects = sorted(rows, key=lambda r: -int(r["total_fanr2_received"]))[:7]

print(f"\n  For each top-7 project: who funded its shell wallet, and did they also fund voters?")
all_voter_funders = {vf["funder_hash"] for vf in voter_funder.values()}
findings = []
for p in top7_projects:
    ph = p["project_hash"]
    pf = project_funders.get(ph, "")
    n_voters_for_this_proj = sum(1 for d in deploys if project_hash_of(d) == ph)
    funded_voters_for_this_proj = 0
    if pf:
        proj_voters = set()
        for d in deploys:
            if project_hash_of(d) == ph:
                vh = voter_hash_of(d)
                if vh:
                    proj_voters.add(vh)
        for v in proj_voters:
            if voter_funder.get(v, {}).get("funder_hash") == pf:
                funded_voters_for_this_proj += 1

    findings.append({
        "project_hash": ph[:18] + "...",
        "fanr2_received": int(p["total_fanr2_received"]),
        "n_unique_voters": int(p["n_unique_voters"]),
        "project_first_funder": pf[:18] + "..." if pf else None,
        "project_funder_also_funded_voters": (pf in all_voter_funders),
        "voters_for_this_project_funded_by_same_wallet": funded_voters_for_this_proj,
    })
    flag = "★ SAME WALLET" if pf in all_voter_funders else ""
    print(f"  {ph[:14]}...  funder {pf[:14] if pf else 'NONE'}...  ↔ funded {funded_voters_for_this_proj} of {p['n_unique_voters']} voters who voted for it  {flag}")

(OUTDIR / "project_voter_funder_overlap.json").write_text(json.dumps(findings, indent=2))


# ===========================================================================
# Pass P — Validator-node concentration
# ===========================================================================
print("\n[P] validator concentration (which blocks/nodes processed votes)...")
block_hashes = Counter(d.get("block_hash") for d in deploys if d.get("block_hash"))
print(f"  Distinct blocks containing votes: {len(block_hashes)}")
print(f"  Mean votes per block: {sum(block_hashes.values())/len(block_hashes):.2f}")
print(f"  Max votes in one block: {max(block_hashes.values())}")
print(f"  Top 10 blocks by vote density:")
for bh, c in block_hashes.most_common(10):
    # Identify the timestamp of this block
    ts = next((d["timestamp"] for d in deploys if d.get("block_hash") == bh), "")
    print(f"    block {bh[:14]}...  {c} votes  @ {ts}")


# ===========================================================================
# Pass Q — vote_id sequence gap analysis
# ===========================================================================
print("\n[Q] vote_id sequence gap analysis...")
vote_ids = []
for d in deploys:
    vid = vote_id_of(d)
    if vid and vid.isdigit():
        vote_ids.append(int(vid))
vote_ids.sort()
if vote_ids:
    print(f"  vote_id range: {vote_ids[0]} to {vote_ids[-1]}  (span: {vote_ids[-1] - vote_ids[0]})")
    print(f"  total successful votes on-chain: {len(vote_ids)}")
    # Gaps
    expected = set(range(vote_ids[0], vote_ids[-1] + 1))
    actual = set(vote_ids)
    missing = expected - actual
    print(f"  vote_ids issued off-chain but never landed on-chain: {len(missing)}")
    print(f"  rate of dropped/expired votes: {100*len(missing)/(vote_ids[-1] - vote_ids[0] + 1):.1f}%")
    # Duplicates?
    dup = len(vote_ids) - len(actual)
    print(f"  duplicate vote_ids on-chain: {dup}")


# ===========================================================================
# Pass R — voter-to-voter funding (internal pool plumbing)
# ===========================================================================
print("\n[R] voter-to-voter funding (did voters fund each other?)...")
all_voters = set(voter_funder.keys())
v_to_v = 0
v_to_v_pairs = []
for vh, vf in voter_funder.items():
    funder = vf["funder_hash"]
    if funder in all_voters and funder != vh:
        v_to_v += 1
        v_to_v_pairs.append((funder, vh))
print(f"  Voters whose funder is ALSO a voter: {v_to_v}")
print(f"  Top 5 'voter-funders' (voters who funded other voters):")
voter_funder_counter = Counter(f for f, _ in v_to_v_pairs)
for f, c in voter_funder_counter.most_common(5):
    print(f"    {f[:14]}...  funded {c} other voters")


print("\n\nDone. All artifacts in scripts/.casper-forensics-output/")
