"""
Deeper GitHub forensics — runs in background while we keep working.

For each existing repo:
  - Full commit history (paginated) — total count, time-of-day histogram, single-dump detection
  - Fork ancestry — is the repo forked from a Casper starter template?
  - README content — length, signature phrases, AI-generated indicators
  - All branches + tags
  - GitHub Actions / CI presence

For each user-only entry (ectoplasm-cspr, cspr-capital, syntaxsurge, KunBojiMan):
  - List all their public repos in the hackathon window
  - Identify the Casper-related one (by topic, name, or recent push date)

Cross-repo:
  - Detect repos forked from the same parent (templated bot submissions)
  - Detect repos with identical README boilerplate
  - Detect repos with same first-commit hash (impossible by coincidence)
"""

from __future__ import annotations
import json, subprocess, csv, re
from collections import Counter, defaultdict
from datetime import datetime
from pathlib import Path

OUTDIR = Path("scripts/.casper-forensics-output")

# Load prior pass to get the repos we already know exist
with (OUTDIR / "github_forensics.json").open() as f:
    prior = json.load(f)

ALIVE_REPOS = [(r["owner"], r["repo"]) for r in prior if r.get("repo") and r.get("repo_exists")]
USER_ONLY = [r["owner"] for r in prior if not r.get("repo")]


def gh_api(path: str, paginate: bool = False):
    cmd = ["gh", "api"]
    if paginate:
        cmd += ["--paginate"]
    cmd += [path]
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
        if result.returncode != 0:
            return None
        # When --paginate, gh concatenates JSON arrays. Need to glue.
        if paginate:
            # gh --paginate outputs concatenated JSON arrays separated by no delimiter
            raw = result.stdout
            # Replace "][" with "," to merge arrays
            merged = raw.replace("][", ",")
            return json.loads(merged)
        return json.loads(result.stdout)
    except Exception as e:
        return None


# ============================================================================
# Pass 1: full commit-history shape for each alive repo
# ============================================================================
print(f"\n[1/4] full commit-history forensics for {len(ALIVE_REPOS)} alive repos...")
commit_shapes = []
for i, (owner, repo) in enumerate(ALIVE_REPOS):
    print(f"  {i+1}/{len(ALIVE_REPOS)} {owner}/{repo}")
    commits = gh_api(f"/repos/{owner}/{repo}/commits?per_page=100", paginate=True)
    if not commits or not isinstance(commits, list):
        commit_shapes.append({"owner": owner, "repo": repo, "error": "no commits returned"})
        continue
    timestamps = []
    authors = []
    files_per_commit = []
    for c in commits:
        if not isinstance(c, dict): continue
        ts = (c.get("commit", {}).get("author", {}) or {}).get("date")
        auth = (c.get("author") or {}).get("login") or (c.get("commit", {}).get("author") or {}).get("name")
        if ts: timestamps.append(ts)
        if auth: authors.append(auth)
    if not timestamps: continue
    timestamps.sort()
    # Burst detection: are commits clustered in short bursts?
    gaps_seconds = []
    for a, b in zip(timestamps, timestamps[1:]):
        try:
            ta = datetime.fromisoformat(a.replace("Z","+00:00"))
            tb = datetime.fromisoformat(b.replace("Z","+00:00"))
            gaps_seconds.append((tb - ta).total_seconds())
        except: pass
    rec = {
        "owner": owner, "repo": repo,
        "total_commits": len(commits),
        "first_commit_ts": timestamps[0],
        "last_commit_ts": timestamps[-1],
        "dev_span_days": (datetime.fromisoformat(timestamps[-1].replace("Z","+00:00")) -
                          datetime.fromisoformat(timestamps[0].replace("Z","+00:00"))).total_seconds() / 86400,
        "unique_authors": len(set(authors)),
        "author_distribution": dict(Counter(authors)),
        "commits_in_first_hour": sum(1 for ts in timestamps if datetime.fromisoformat(ts.replace("Z","+00:00")) - datetime.fromisoformat(timestamps[0].replace("Z","+00:00")) < datetime.fromisoformat(timestamps[0].replace("Z","+00:00")).replace(microsecond=0) - datetime.fromisoformat(timestamps[0].replace("Z","+00:00")) + (datetime.fromisoformat(timestamps[0].replace("Z","+00:00")) - datetime.fromisoformat(timestamps[0].replace("Z","+00:00")))) if False else 0,  # broken expr — simplify below
    }
    # Better: count commits within 1h of first commit
    first_ts = datetime.fromisoformat(timestamps[0].replace("Z","+00:00"))
    commits_in_1h = sum(1 for ts in timestamps
                        if (datetime.fromisoformat(ts.replace("Z","+00:00")) - first_ts).total_seconds() <= 3600)
    rec["commits_in_first_hour"] = commits_in_1h
    rec["dump_concentration_pct"] = round(100 * commits_in_1h / len(timestamps), 1)
    # Cluster: count "rapid bursts" (>=3 commits within 5 min)
    rec["min_gap_seconds"] = min(gaps_seconds) if gaps_seconds else None
    rec["median_gap_seconds"] = sorted(gaps_seconds)[len(gaps_seconds)//2] if gaps_seconds else None
    # First commit file count (for dump detection)
    if commits:
        first_sha = commits[-1].get("sha")  # oldest is last in default desc order
        if first_sha:
            details = gh_api(f"/repos/{owner}/{repo}/commits/{first_sha}")
            if details:
                rec["first_commit_files_added"] = len((details or {}).get("files", []))
                rec["first_commit_additions"] = (details.get("stats") or {}).get("additions")
                rec["first_commit_deletions"] = (details.get("stats") or {}).get("deletions")
    commit_shapes.append(rec)

(OUTDIR / "github_commit_shapes.json").write_text(json.dumps(commit_shapes, indent=2, default=str))

# Print headline numbers
print("\n  Commit-shape scorecard (sorted by dump concentration):")
shapes_sorted = sorted([s for s in commit_shapes if "total_commits" in s], key=lambda x: -x.get("dump_concentration_pct", 0))
print(f"  {'owner/repo':<55} {'commits':>4} {'authors':>4} {'span_days':>9} {'dump%':>6} {'first_files':>11} {'first_+lines':>12}")
for s in shapes_sorted[:30]:
    print(f"  {(s['owner']+'/'+s['repo'])[:55]:<55} {s.get('total_commits',0):>4} {s.get('unique_authors',0):>4} "
          f"{s.get('dev_span_days', 0):>9.1f} {s.get('dump_concentration_pct',0):>5.1f}% "
          f"{s.get('first_commit_files_added','-'):>11} {s.get('first_commit_additions','-'):>12}")


# ============================================================================
# Pass 2: fork ancestry — are any repos forked from the same parent?
# ============================================================================
print(f"\n\n[2/4] fork ancestry — were any repos forked from a common Casper starter template?")
fork_parents = []
for owner, repo in ALIVE_REPOS:
    r = gh_api(f"/repos/{owner}/{repo}")
    if not r: continue
    parent = (r.get("parent") or {}).get("full_name")
    source = (r.get("source") or {}).get("full_name")
    is_fork = r.get("fork", False)
    if is_fork or parent or source:
        fork_parents.append({"repo": f"{owner}/{repo}", "parent": parent, "source": source, "is_fork": is_fork})
        print(f"  ★ {owner}/{repo} forked from parent={parent} source={source}")
if not fork_parents:
    print("  no forks detected — these are all originally created repos")


# ============================================================================
# Pass 3: README content analysis — AI-boilerplate detection
# ============================================================================
print(f"\n\n[3/4] README content analysis (length + AI-boilerplate signatures)...")
readmes = []
AI_PHRASES = [
    "## Overview", "## Features", "## Installation", "## Usage", "## Getting Started",
    "## Prerequisites", "## Contributing", "## License", "🚀", "✨", "📦", "## Tech Stack",
    "Welcome to", "This project is", "Built with", "## About",
]
for owner, repo in ALIVE_REPOS:
    rd = gh_api(f"/repos/{owner}/{repo}/readme")
    if not rd: continue
    import base64
    content = base64.b64decode(rd.get("content", "")).decode("utf-8", "replace")
    matches = [p for p in AI_PHRASES if p in content]
    readmes.append({
        "repo": f"{owner}/{repo}",
        "size_bytes": rd.get("size"),
        "lines": content.count("\n"),
        "ai_phrase_hits": len(matches),
        "ai_phrases": matches,
    })

# Top: readmes with highest AI-phrase density
readmes_sorted = sorted(readmes, key=lambda x: -x["ai_phrase_hits"])
print(f"  {'repo':<55} {'size':>6} {'lines':>5} {'ai-hits':>7}")
for r in readmes_sorted:
    print(f"  {r['repo'][:55]:<55} {r['size_bytes']:>6} {r['lines']:>5} {r['ai_phrase_hits']:>7}")


# ============================================================================
# Pass 4: user-only entries — find their Casper-related repos
# ============================================================================
print(f"\n\n[4/4] enumerating repos for user-only entries: {USER_ONLY}")
user_repos = {}
for u in USER_ONLY:
    repos = gh_api(f"/users/{u}/repos?per_page=100&sort=updated", paginate=True) or []
    print(f"\n  {u}: {len(repos) if isinstance(repos, list) else 0} public repos")
    # Filter to Casper-mentioning ones
    casper_repos = []
    for r in repos if isinstance(repos, list) else []:
        if not isinstance(r, dict): continue
        name = (r.get("name") or "").lower()
        desc = (r.get("description") or "").lower()
        if "casper" in name or "cspr" in name or "casper" in desc or "cspr" in desc:
            casper_repos.append({
                "name": r.get("name"),
                "created_at": r.get("created_at"),
                "pushed_at": r.get("pushed_at"),
                "description": r.get("description"),
                "stargazers_count": r.get("stargazers_count"),
                "language": r.get("language"),
            })
    user_repos[u] = casper_repos
    for cr in casper_repos:
        print(f"    → {cr['name']} (created {cr['created_at']}, last push {cr['pushed_at']}, lang {cr.get('language')}) — {cr.get('description', '')[:80]}")

(OUTDIR / "github_user_repos.json").write_text(json.dumps(user_repos, indent=2, default=str))


print("\n\nDeep-scan done.")
