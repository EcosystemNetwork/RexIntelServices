"""
Casper Hackathon 2026 R2 — deep vote-botting pattern analysis.

Beyond the standard "fresh wallets / dormant / templated" battery, this looks
for the next-layer patterns:

  V1. Funding-to-voting latency per voter — scripted-through-them behavior
      shows up as votes cast within minutes of wallet funding.
  V2. Coordinated voter blocs — voters who pile into the same N projects.
  V3. Vote_id vs timestamp scatter — pre-batched authorizations show up as
      gaps between off-chain ID issuance and on-chain landing.
  V4. Per-project vote burst patterns over time.
  V5. Per-project funding-source mix — what % of each project's voters came
      from each top funder cluster.
  V6. Vote signature uniqueness — count distinct signing keys across all
      1869 vote authorizations.
  V7. Tail-project voter quality contrast — the bottom 30 projects might
      reveal organic voting.
  V8. Per-project first-vote time + final-vote time.

Uses only data already in raw_deploys.json + voter_funding.csv.
"""

from __future__ import annotations
import csv, json
from collections import Counter, defaultdict
from datetime import datetime
from pathlib import Path

INDIR = Path("scripts/.casper-forensics-output")
OUTDIR = INDIR

# Load
with (INDIR / "raw_deploys.json").open() as f:
    deploys = json.load(f)
voter_funder: dict[str, dict] = {}
with (INDIR / "voter_funding.csv").open() as f:
    for row in csv.DictReader(f):
        voter_funder[row["voter_hash"]] = {
            "funder": row["first_funder_hash"],
            "fund_ts": row["first_fund_ts"],
            "fund_amount_motes": int(row.get("first_fund_amount_motes") or 0),
        }
print(f"Loaded {len(deploys)} deploys, {len(voter_funder)} funded voters")


def voter_of(d):
    a = d.get("args") or {}
    v = a.get("voter") or {}
    p = v.get("parsed") if isinstance(v, dict) else None
    return p.replace("account-hash-", "") if isinstance(p, str) else ""

def project_of(d):
    a = d.get("args") or {}
    v = a.get("project") or {}
    p = v.get("parsed") if isinstance(v, dict) else None
    return p.replace("account-hash-", "") if isinstance(p, str) else ""

def amount_of(d):
    a = d.get("args") or {}
    v = a.get("token_amount") or {}
    p = v.get("parsed") if isinstance(v, dict) else None
    return int(p) if p else 0

def vote_id_of(d):
    a = d.get("args") or {}
    v = a.get("vote_id") or {}
    p = v.get("parsed") if isinstance(v, dict) else None
    return int(p) if p and str(p).isdigit() else None

def signature_of(d):
    """Return the signature as a tuple (so we can hash/compare)."""
    a = d.get("args") or {}
    s = a.get("signature") or {}
    p = s.get("parsed") if isinstance(s, dict) else None
    return tuple(p) if isinstance(p, list) else None

def parse_ts(s):
    return datetime.fromisoformat(s.replace("Z","+00:00"))


# ============================================================================
# V1: funding-to-voting latency per voter
# ============================================================================
print("\n[V1] funding-to-voting latency...")
voter_first_vote: dict[str, datetime] = {}
for d in deploys:
    v = voter_of(d)
    if not v: continue
    ts = parse_ts(d["timestamp"])
    if v not in voter_first_vote or ts < voter_first_vote[v]:
        voter_first_vote[v] = ts

latencies = []  # in seconds
fast_voters = []  # voters who voted within 1 hour of funding
for v, fv_ts in voter_first_vote.items():
    f = voter_funder.get(v)
    if not f or not f.get("fund_ts"): continue
    try:
        fund_ts = parse_ts(f["fund_ts"])
    except: continue
    latency = (fv_ts - fund_ts).total_seconds()
    if latency > 0:  # vote came AFTER funding
        latencies.append(latency)
        if latency < 3600:  # within 1 hour
            fast_voters.append((v, latency, f["funder"][:14]))

latencies.sort()
n = len(latencies)
if n:
    print(f"  Voters with positive funding→vote latency: {n}")
    print(f"  Median latency: {latencies[n//2]/60:.1f} minutes")
    print(f"  10th percentile: {latencies[n//10]/60:.1f} min")
    print(f"  25th percentile: {latencies[n//4]/60:.1f} min")
    print(f"  75th percentile: {latencies[3*n//4]/3600:.1f} hours")
    bands = [(60,"<1m"), (300,"<5m"), (1800,"<30m"), (3600,"<1h"), (86400,"<24h")]
    for thresh, label in bands:
        c = sum(1 for l in latencies if l < thresh)
        print(f"  voters who voted {label} after funding: {c} ({100*c/n:.1f}%)")

print(f"\n  Top 15 fastest fund→vote voters (script-fired-through-them signal):")
for v, lat, funder in sorted(fast_voters, key=lambda x: x[1])[:15]:
    print(f"    {v[:14]}...  voted {lat:.0f}s after funding (funder {funder}...)")


# ============================================================================
# V2: coordinated voter blocs — voters with shared project portfolios
# ============================================================================
print("\n[V2] coordinated voter blocs...")
voter_projects: dict[str, set[str]] = defaultdict(set)
for d in deploys:
    v = voter_of(d); p = project_of(d)
    if v and p: voter_projects[v].add(p)

# Find voters with 4+ distinct project votes — they're "active multi-voters"
multi_voters = {v: ps for v, ps in voter_projects.items() if len(ps) >= 4}
print(f"  Voters with 4+ distinct project votes (multi-voters): {len(multi_voters)}")
# For each pair of multi-voters, compute Jaccard similarity of their portfolios
# Look for cliques of voters with identical or near-identical portfolios
from itertools import combinations
mv_list = list(multi_voters.items())
high_sim_pairs = []
for i, (a, sa) in enumerate(mv_list):
    for b, sb in mv_list[i+1:]:
        if len(sa & sb) >= 4 and len(sa | sb) <= 6:  # >=4 shared, max 6 total = highly overlapping
            jac = len(sa & sb) / len(sa | sb)
            high_sim_pairs.append((a, b, jac, sa & sb))
high_sim_pairs.sort(key=lambda x: -x[2])
print(f"  Voter pairs with highly-overlapping project portfolios (≥4 shared, Jaccard≥0.67): {len(high_sim_pairs)}")
for a, b, jac, shared in high_sim_pairs[:20]:
    print(f"    {a[:14]}... ↔ {b[:14]}...  Jaccard={jac:.2f}  shared={[p[:8] for p in list(shared)[:5]]}")


# ============================================================================
# V3: vote_id vs timestamp scatter — pre-batched authorization detection
# ============================================================================
print("\n[V3] vote_id ↔ timestamp scatter...")
vid_ts_pairs = []
for d in deploys:
    vid = vote_id_of(d)
    if vid is not None:
        vid_ts_pairs.append((vid, parse_ts(d["timestamp"])))
vid_ts_pairs.sort()
# Compute correlation: in a "live" system, vote_id ~= rank order of timestamps
# In a "pre-batched" system, you'd see vote_ids issued early submitted late, or vice versa
out_of_order = 0
for i in range(1, len(vid_ts_pairs)):
    if vid_ts_pairs[i][1] < vid_ts_pairs[i-1][1]:
        out_of_order += 1
print(f"  vote_ids out-of-order (issued later but landed earlier than predecessor): {out_of_order}/{len(vid_ts_pairs)} ({100*out_of_order/len(vid_ts_pairs):.1f}%)")

# Compute issuance-to-landing gap (assuming vote_id correlates with off-chain issuance time)
# We don't know exact off-chain issuance times, but we can measure how much vote_id rank diverges from timestamp rank
ranks_by_vid = sorted(range(len(vid_ts_pairs)), key=lambda i: vid_ts_pairs[i][0])
ranks_by_ts = sorted(range(len(vid_ts_pairs)), key=lambda i: vid_ts_pairs[i][1])
rank_diff = sum(abs(ranks_by_vid.index(i) - ranks_by_ts.index(i)) for i in range(len(vid_ts_pairs))) / len(vid_ts_pairs)
print(f"  Mean rank divergence vote_id vs timestamp: {rank_diff:.1f} positions")


# ============================================================================
# V4: per-project vote burst patterns
# ============================================================================
print("\n[V4] per-project vote bursts (top-10 projects)...")
project_votes_ts: dict[str, list[datetime]] = defaultdict(list)
for d in deploys:
    p = project_of(d)
    if p: project_votes_ts[p].append(parse_ts(d["timestamp"]))

# Sort by total votes received
project_totals = {p: len(ts) for p, ts in project_votes_ts.items()}
top10 = sorted(project_totals.items(), key=lambda x: -x[1])[:10]
print(f"  {'project':<18} {'votes':>5} {'first_vote':<22} {'last_vote':<22} {'span_days':>9} {'max_per_hour':>12}")
for p, n in top10:
    times = sorted(project_votes_ts[p])
    span = (times[-1] - times[0]).total_seconds() / 86400
    # Max votes in any 1-hour window
    max_burst = 0
    for i, t in enumerate(times):
        end = t.timestamp() + 3600
        burst = sum(1 for tt in times[i:] if tt.timestamp() <= end)
        max_burst = max(max_burst, burst)
    print(f"  {p[:18]:<18} {n:>5} {str(times[0])[:19]:<22} {str(times[-1])[:19]:<22} {span:>9.1f} {max_burst:>12}")


# ============================================================================
# V5: per-project funding-source mix (top 5 + bottom 5 contrast)
# ============================================================================
print("\n[V5] per-project funding-source mix (top vs bottom)...")
# For each project, group its voters by their first-funder
project_funder_mix: dict[str, Counter] = defaultdict(Counter)
for d in deploys:
    v = voter_of(d); p = project_of(d)
    if not v or not p: continue
    f = voter_funder.get(v, {}).get("funder", "unknown")
    project_funder_mix[p][f] += 1

print(f"\n  TOP 5 projects — funding-source diversity:")
for p, _ in top10[:5]:
    mix = project_funder_mix[p]
    total = sum(mix.values())
    top_funders = mix.most_common(3)
    diversity = len(mix)
    print(f"  {p[:18]:<18} {total:>4} votes from {diversity} distinct funders; top-3:")
    for f, c in top_funders:
        print(f"    {f[:14]}... → {c} votes ({100*c/total:.1f}%)")

# Bottom: projects with fewest votes (10+)
bottom = sorted(project_totals.items(), key=lambda x: x[1])[:5]
print(f"\n  BOTTOM 5 projects (fewest votes):")
for p, n in bottom:
    mix = project_funder_mix[p]
    diversity = len(mix)
    print(f"  {p[:18]:<18} {n:>3} votes from {diversity} distinct funders")


# ============================================================================
# V6: vote signature uniqueness — how many distinct Association signing keys?
# ============================================================================
print("\n[V6] vote signature uniqueness...")
sig_prefixes = Counter()  # group by first byte (signing scheme indicator)
sig_first_4_bytes = Counter()  # group by first 4 bytes
sigs_total = 0
for d in deploys:
    s = signature_of(d)
    if s and len(s) >= 4:
        sig_prefixes[s[0]] += 1
        sig_first_4_bytes[s[:4]] += 1
        sigs_total += 1
print(f"  Signatures examined: {sigs_total}")
print(f"  Distinct first-byte values: {len(sig_prefixes)}")
print(f"  First-byte distribution: {dict(sig_prefixes.most_common())}")
print(f"  Distinct first-4-byte prefixes: {len(sig_first_4_bytes)}")
print(f"  Top 5 first-4-byte prefixes (high values = single signing key):")
for prefix, c in sig_first_4_bytes.most_common(5):
    print(f"    {list(prefix)} → {c} signatures ({100*c/sigs_total:.1f}%)")


# ============================================================================
# V7: tail-project voter quality contrast
# ============================================================================
print("\n[V7] tail-project voter quality (bottom 20 projects with ≥3 votes)...")
# Load voter classifications from prior pass
voter_class = {}
with (INDIR / "voters.csv").open() as f:
    for row in csv.DictReader(f):
        voter_class[row["voter_account_hash"]] = row

# bot-funder set (≥10 voters fed)
funder_counts = Counter(voter_funder.get(v, {}).get("funder", "") for v in voter_funder)
bot_funders = {f for f, c in funder_counts.items() if c >= 10 and f}

# For projects with 3-30 votes, compute the same scorecard
tail = [(p, n) for p, n in sorted(project_totals.items(), key=lambda x: x[1]) if 3 <= n <= 30]
print(f"\n  {'project':<18} {'votes':>4} {'fresh%':>6} {'dormant%':>8} {'bot-funded%':>11}")
for p, n in tail[:25]:
    voters_for_p = {voter_of(d) for d in deploys if project_of(d) == p}
    voters_for_p.discard("")
    if not voters_for_p: continue
    fresh = sum(1 for v in voters_for_p if v in voter_class
                and voter_class[v].get("first_deploy_ever_ts") and voter_class[v].get("first_vote_ts")
                and (parse_ts(voter_class[v]["first_vote_ts"]) -
                     parse_ts(voter_class[v]["first_deploy_ever_ts"])).total_seconds() < 86400)
    dormant = sum(1 for v in voters_for_p
                  if v in voter_class and str(voter_class[v].get("still_active_post_hackathon","")).lower() == "false")
    bot_f = sum(1 for v in voters_for_p if voter_funder.get(v, {}).get("funder", "") in bot_funders)
    np_ = len(voters_for_p)
    print(f"  {p[:18]:<18} {n:>4} {100*fresh/np_:>5.1f}% {100*dormant/np_:>7.1f}% {100*bot_f/np_:>10.1f}%")


print("\nDone.")

# Save
(OUTDIR / "vote_botting_analysis.json").write_text(json.dumps({
    "fund_to_vote_latency_percentiles": {
        "<1m": sum(1 for l in latencies if l < 60),
        "<5m": sum(1 for l in latencies if l < 300),
        "<30m": sum(1 for l in latencies if l < 1800),
        "<1h": sum(1 for l in latencies if l < 3600),
        "<24h": sum(1 for l in latencies if l < 86400),
        "total": n,
    },
    "fastest_fund_to_vote_top15": [{"voter": v, "latency_seconds": l, "funder": f} for v, l, f in sorted(fast_voters, key=lambda x:x[1])[:15]],
    "voter_pairs_with_shared_portfolio": [{"a": a, "b": b, "jaccard": j, "shared": list(s)} for a,b,j,s in high_sim_pairs[:30]],
    "vote_id_out_of_order_count": out_of_order,
    "vote_id_rank_divergence_mean": rank_diff,
    "signature_first_byte_distribution": dict(sig_prefixes),
    "signature_first_4_byte_top": [{"prefix": list(p), "count": c} for p, c in sig_first_4_bytes.most_common(10)],
}, indent=2, default=str))
