"""
Casper Hackathon 2026 — Round 2 GitHub forensics on the additional 12 entries.

Same battery as round 1 + deep-scan:
  - Repo existence (deleted?)
  - Owner creation date
  - Commit-shape (single-dump detection)
  - README AI-boilerplate scoring
  - User-only entries: enumerate Casper repos

Particular focus on the two announced winners now in scope:
  - furkanahmetk/shroud-protocol (Shroud Protocol, 2nd place, $7K)
  - BridgeX-dapp/bridgeX (BridgeX, Interop winner, $2.5K)
"""

from __future__ import annotations
import json, subprocess, base64, csv
from collections import Counter, defaultdict
from datetime import datetime
from pathlib import Path

# 12 NEW entries (dedup'd from Rex Deus's second paste)
NEW = [
    ("fullendmaestro", "anchore"),
    ("HoomanBuilds", "agentis"),
    ("zzzbedream", "CasperFidelity"),
    ("hoangducbach", "stayer-protocol"),
    ("UnrealNFT", "ScreenerLand"),
    ("dellwatson", "moga-mogate"),       # branch casper-network
    ("luxipha", "CasperID"),
    ("furkanahmetk", "shroud-protocol"), # ANNOUNCED #2 WINNER
    ("anchor-protoco", "protocol"),       # likely typo for anchor-protocol
    ("BridgeX-dapp", "bridgeX"),          # ANNOUNCED INTEROP WINNER
    ("mja2001", "SolCipher-Casper"),
    ("le-stagiaire-ag2r", "Casper-projet"),
]
ANNOUNCED_WINNERS = {
    ("furkanahmetk", "shroud-protocol"): "Shroud Protocol — 2nd place, $7,000",
    ("BridgeX-dapp", "bridgeX"): "BridgeX — Interoperability winner, $2,500",
}
OUTDIR = Path("scripts/.casper-forensics-output")


def gh_api(path: str, paginate: bool = False):
    cmd = ["gh", "api"]
    if paginate: cmd += ["--paginate"]
    cmd += [path]
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
        if result.returncode != 0:
            return None
        if paginate:
            return json.loads(result.stdout.replace("][", ","))
        return json.loads(result.stdout)
    except Exception:
        return None


report = []
for i, (owner, repo) in enumerate(NEW):
    print(f"\n[{i+1}/{len(NEW)}] {owner}/{repo}")
    rec = {"owner": owner, "repo": repo}
    if (owner, repo) in ANNOUNCED_WINNERS:
        rec["announced_winner"] = ANNOUNCED_WINNERS[(owner, repo)]
        print(f"  ⚡ ANNOUNCED WINNER: {rec['announced_winner']}")

    # Owner info
    user = gh_api(f"/users/{owner}")
    if user:
        rec["owner_exists"] = True
        rec["owner_type"] = user.get("type")
        rec["owner_created_at"] = user.get("created_at")
        rec["owner_public_repos"] = user.get("public_repos")
        rec["owner_followers"] = user.get("followers")
    else:
        rec["owner_exists"] = False
        print(f"  ✗ owner not found")

    # Repo
    r = gh_api(f"/repos/{owner}/{repo}")
    if r is None:
        rec["repo_exists"] = False
        print(f"  🚨 REPO DELETED / NOT FOUND")
        report.append(rec); continue
    rec["repo_exists"] = True
    rec["repo_created_at"] = r.get("created_at")
    rec["repo_pushed_at"] = r.get("pushed_at")
    rec["repo_description"] = r.get("description")
    rec["repo_language"] = r.get("language")
    rec["repo_size_kb"] = r.get("size")
    rec["repo_stargazers_count"] = r.get("stargazers_count")
    rec["repo_forks_count"] = r.get("forks_count")
    rec["repo_fork"] = r.get("fork")
    parent = (r.get("parent") or {}).get("full_name")
    if parent: rec["fork_parent"] = parent

    # Commits — paginated
    commits = gh_api(f"/repos/{owner}/{repo}/commits?per_page=100", paginate=True) or []
    if isinstance(commits, list) and commits:
        rec["total_commits"] = len(commits)
        timestamps = sorted([(c.get("commit",{}).get("author",{}) or {}).get("date") for c in commits if isinstance(c, dict) and c.get("commit")])
        timestamps = [t for t in timestamps if t]
        authors = list({(c.get("author") or {}).get("login") or (c.get("commit",{}).get("author") or {}).get("name") for c in commits if isinstance(c, dict)} - {None})
        rec["unique_authors"] = len(authors)
        rec["author_logins"] = authors
        if timestamps:
            rec["first_commit_ts"] = timestamps[0]
            rec["last_commit_ts"] = timestamps[-1]
            try:
                first_ts = datetime.fromisoformat(timestamps[0].replace("Z","+00:00"))
                last_ts = datetime.fromisoformat(timestamps[-1].replace("Z","+00:00"))
                rec["dev_span_days"] = round((last_ts - first_ts).total_seconds() / 86400, 1)
                commits_in_1h = sum(1 for t in timestamps if (datetime.fromisoformat(t.replace("Z","+00:00")) - first_ts).total_seconds() <= 3600)
                rec["dump_concentration_pct"] = round(100 * commits_in_1h / len(timestamps), 1)
            except: pass
        # First commit detail (= dump size)
        if commits:
            first_sha = commits[-1].get("sha")
            if first_sha:
                d = gh_api(f"/repos/{owner}/{repo}/commits/{first_sha}")
                if d:
                    rec["first_commit_files"] = len(d.get("files", []))
                    rec["first_commit_additions"] = (d.get("stats") or {}).get("additions")

    # Contributors
    contribs = gh_api(f"/repos/{owner}/{repo}/contributors?per_page=100") or []
    if isinstance(contribs, list):
        rec["contributors_count"] = len(contribs)
        rec["contributors_logins"] = [c.get("login") for c in contribs if isinstance(c, dict)]

    # README — get size + AI-phrase fingerprint
    rd = gh_api(f"/repos/{owner}/{repo}/readme")
    if rd:
        rec["readme_size"] = rd.get("size")
        content = base64.b64decode(rd.get("content","") or "").decode("utf-8", "replace")
        AI_PHRASES = ["## Overview", "## Features", "## Installation", "## Usage", "## Getting Started",
                      "## Prerequisites", "## Contributing", "## License", "🚀", "✨", "📦", "## Tech Stack",
                      "Welcome to", "This project is", "Built with", "## About"]
        rec["readme_ai_hits"] = sum(1 for p in AI_PHRASES if p in content)

    print(f"  created {rec.get('repo_created_at')}  pushed {rec.get('repo_pushed_at')}  commits {rec.get('total_commits',0)}  authors {rec.get('unique_authors',0)}  first_commit +{rec.get('first_commit_additions','-')} lines")
    report.append(rec)


# Print scorecard
print("\n\n=== Round 2 Scorecard ===")
print(f"  {'owner/repo':<50} {'created':<22} {'commits':>4} {'authors':>4} {'1st-add':>8} {'dump%':>6} {'WINNER':<20}")
for rec in report:
    if not rec.get("repo_exists"):
        print(f"  {(rec['owner']+'/'+rec['repo'])[:50]:<50} {'DELETED':<22}")
        continue
    print(f"  {(rec['owner']+'/'+rec['repo'])[:50]:<50} "
          f"{(rec.get('repo_created_at') or '')[:19]:<22} "
          f"{rec.get('total_commits', 0):>4} "
          f"{rec.get('unique_authors', 0):>4} "
          f"{rec.get('first_commit_additions','-'):>8} "
          f"{rec.get('dump_concentration_pct','-'):>5}% "
          f"{rec.get('announced_winner','')}")

# Account-creation timing
print("\n=== Owner account creation dates ===")
for rec in report:
    ts = rec.get("owner_created_at", "")
    if not ts: continue
    fresh = "★ HACKATHON-ERA" if "2025-10" <= ts <= "2026-02" else ""
    print(f"  {rec['owner']:<25} created {ts}  pub_repos={rec.get('owner_public_repos','?')}  followers={rec.get('owner_followers','?')} {fresh}")

# Save
(OUTDIR / "github_forensics_round2.json").write_text(json.dumps(report, indent=2, default=str))

# Cross-reference: build the master contributor index (round 1 + round 2)
print("\n=== Cross-project contributor overlap (round 1 + round 2 combined) ===")
with (OUTDIR / "github_forensics.json").open() as f:
    r1 = json.load(f)
all_recs = r1 + report
contributor_to_projects = defaultdict(list)
for rec in all_recs:
    pid = f"{rec['owner']}/{rec.get('repo') or '(user-only)'}"
    for login in rec.get("contributors_logins", []) or []:
        contributor_to_projects[login].append(pid)
multi = {k: v for k, v in contributor_to_projects.items() if len(v) >= 2}
if multi:
    print(f"  Contributors appearing in 2+ projects: {len(multi)}")
    for login, projs in sorted(multi.items(), key=lambda x: -len(x[1])):
        print(f"    ★ {login}: {projs}")
else:
    print("  no contributors found in multiple projects")

# Save combined
with (OUTDIR / "github_combined_contributors.json").open("w") as f:
    json.dump({"multi_project_contributors": dict(multi)}, f, indent=2)

print("\nDone.")
