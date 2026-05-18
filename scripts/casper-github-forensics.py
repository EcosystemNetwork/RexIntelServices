"""
Casper Hackathon 2026 — GitHub repo forensics.

For each project's GitHub URL Rex Deus pasted, pull:
  - Repo existence (deleted = giant tell)
  - Creation date, last-push date, default branch, language breakdown
  - Total commits, total contributors, commit-velocity shape
  - Single-big-commit detection (vibe-coded / AI-dump pattern)
  - README presence + length + quality signals
  - Stars / forks / issues / open-PR counts
  - Contributor cross-project overlap (one operator across multiple "winners"?)
  - Account creation date for each owner (fresh accounts during hackathon = sus)
  - Wayback Machine snapshot for missing repos

Uses gh CLI for authenticated GitHub API access.
"""

from __future__ import annotations
import json, subprocess, urllib.request, gzip, csv, re, sys
from collections import Counter, defaultdict
from pathlib import Path

# Submitted-as-pasted URLs, normalized
RAW = """
github.com/ectoplasm-cspr
github.com/Shreshtthh/CasperFlow
github.com/osas2211/sampled-casper
github.com/Eras256/FlowFi
github.com/mertksk/accelerate
github.com/cspr-capital
github.com/syntaxsurge
github.com/Xayaan/Casper-FOMO
github.com/IHB1-Foundation/magni-cspr
github.com/StudioLIQ/gaspar-finance
github.com/ritigya03/CasperCredIQ
github.com/anbusan19/CasperIDE
github.com/telixgoldens/casper-dao
github.com/SAHU-01/CasperStake
github.com/YashIIT0909/guardian-recovery-protocol
github.com/chandan989/Fulcrum
github.com/PatrickOjiambo/metaPOCF
github.com/Blockchain-Oracle/cspr-ai
github.com/x5engine/CasperGhost-The-Autonomous-DeFi-Agent
github.com/Shubhojit-17/CEWCE-Casper-Enterprise-Workflow-Compliance-Engine
github.com/KunBojiMan
github.com/dmrdvn/caspay
github.com/casperlens/casperlens
github.com/sumithprabhu/KnotX
github.com/SohamJuneja/CasperLink
"""
OUTDIR = Path("scripts/.casper-forensics-output")
OUTDIR.mkdir(parents=True, exist_ok=True)

# Parse into (owner, repo_or_none)
entries = []
for line in RAW.strip().splitlines():
    s = line.strip().replace("https://", "").replace("http://", "").replace("github.com/", "")
    s = s.rstrip("/")
    if not s: continue
    parts = s.split("/")
    if len(parts) == 1:
        entries.append((parts[0], None))
    else:
        entries.append((parts[0], parts[1]))
print(f"Parsed {len(entries)} entries")


def gh_api(path: str) -> dict | None:
    """Run gh api PATH and return parsed JSON or None on failure."""
    try:
        result = subprocess.run(["gh", "api", path], capture_output=True, text=True, timeout=30)
        if result.returncode != 0:
            return None
        return json.loads(result.stdout)
    except Exception:
        return None


def wayback_check(url: str) -> dict | None:
    """Ask Wayback Machine if it has snapshots for a URL."""
    try:
        req = urllib.request.Request(
            f"https://archive.org/wayback/available?url={urllib.parse.quote(url)}",
            headers={"User-Agent": "Mozilla/5.0"},
        )
        with urllib.request.urlopen(req, timeout=15) as r:
            return json.loads(r.read())
    except Exception:
        return None


import urllib.parse  # used by wayback_check

# ============================================================================
# Pass 1: per-entry probe
# ============================================================================
report = []
for i, (owner, repo) in enumerate(entries):
    print(f"\n[{i+1}/{len(entries)}] owner={owner}  repo={repo}")
    rec: dict = {"owner": owner, "repo": repo}

    # User/org metadata
    user = gh_api(f"/users/{owner}")
    rec["owner_exists"] = user is not None
    if user:
        rec["owner_type"] = user.get("type")
        rec["owner_created_at"] = user.get("created_at")
        rec["owner_public_repos"] = user.get("public_repos")
        rec["owner_followers"] = user.get("followers")
        rec["owner_following"] = user.get("following")
        rec["owner_bio"] = user.get("bio")
        rec["owner_blog"] = user.get("blog")
        rec["owner_location"] = user.get("location")
    else:
        rec["owner_type"] = None

    # Repo metadata (only if specific repo given)
    if repo:
        r = gh_api(f"/repos/{owner}/{repo}")
        if r is None:
            # Try Wayback to confirm it existed
            wb = wayback_check(f"https://github.com/{owner}/{repo}")
            rec["repo_exists"] = False
            rec["repo_wayback_snapshot"] = (
                (wb or {}).get("archived_snapshots", {}).get("closest", {}).get("url")
            )
        else:
            rec["repo_exists"] = True
            rec["repo_created_at"] = r.get("created_at")
            rec["repo_updated_at"] = r.get("updated_at")
            rec["repo_pushed_at"] = r.get("pushed_at")
            rec["repo_description"] = r.get("description")
            rec["repo_language"] = r.get("language")
            rec["repo_stargazers_count"] = r.get("stargazers_count")
            rec["repo_forks_count"] = r.get("forks_count")
            rec["repo_open_issues_count"] = r.get("open_issues_count")
            rec["repo_size_kb"] = r.get("size")
            rec["repo_fork"] = r.get("fork")
            rec["repo_archived"] = r.get("archived")
            rec["repo_disabled"] = r.get("disabled")
            rec["repo_default_branch"] = r.get("default_branch")
            rec["repo_topics"] = r.get("topics")
            rec["repo_license"] = (r.get("license") or {}).get("spdx_id")

            # Commits — first 100 (one page)
            commits = gh_api(f"/repos/{owner}/{repo}/commits?per_page=100") or []
            rec["commit_count_page1"] = len(commits)
            if commits and isinstance(commits, list):
                # Distinct authors
                authors = []
                for c in commits:
                    if not isinstance(c, dict): continue
                    auth = (c.get("author") or {}).get("login") or \
                           (c.get("commit", {}).get("author") or {}).get("name") or \
                           (c.get("commit", {}).get("author") or {}).get("email")
                    if auth: authors.append(auth)
                rec["commit_distinct_authors"] = list(set(authors))
                rec["commit_authors_count"] = len(set(authors))
                # Oldest and newest commit timestamps
                commit_ts = [(c.get("commit", {}).get("author", {}) or {}).get("date") for c in commits if isinstance(c, dict)]
                commit_ts = [t for t in commit_ts if t]
                if commit_ts:
                    rec["commit_oldest_ts"] = min(commit_ts)
                    rec["commit_newest_ts"] = max(commit_ts)

            # Contributors (separate endpoint, may catch non-commit-author contributors)
            contribs = gh_api(f"/repos/{owner}/{repo}/contributors?per_page=100") or []
            if isinstance(contribs, list):
                rec["contributors_count"] = len(contribs)
                rec["contributors_logins"] = [c.get("login") for c in contribs if isinstance(c, dict)]
            else:
                rec["contributors_count"] = 0
                rec["contributors_logins"] = []

            # README presence + size
            rd = gh_api(f"/repos/{owner}/{repo}/readme")
            if rd:
                rec["readme_present"] = True
                rec["readme_size_bytes"] = rd.get("size")

            # Single-commit detection (if commits count is exactly 1, vibe-coded dump)
            if rec.get("commit_count_page1") == 1:
                rec["VIBE_CODED_FLAG"] = "single commit only (potential AI-dump)"
            # Recent activity: was the repo abandoned right after the hackathon?
            if rec.get("repo_pushed_at"):
                rec["abandoned_post_hackathon"] = rec["repo_pushed_at"] < "2026-02-15"
    report.append(rec)

# ============================================================================
# Pass 2: cross-project contributor overlap
# ============================================================================
print("\n\n=== Cross-project contributor overlap ===")
contributor_to_projects: dict[str, list[str]] = defaultdict(list)
for rec in report:
    project_id = f"{rec['owner']}/{rec.get('repo') or '(no repo)'}"
    for login in rec.get("contributors_logins", []) or []:
        contributor_to_projects[login].append(project_id)

multi_project_contribs = {k: v for k, v in contributor_to_projects.items() if len(v) >= 2}
print(f"Contributors appearing in 2+ projects: {len(multi_project_contribs)}")
for login, projs in sorted(multi_project_contribs.items(), key=lambda x: -len(x[1])):
    print(f"  {login}: {projs}")

# ============================================================================
# Pass 3: account-creation timing analysis
# ============================================================================
print("\n\n=== Owner-account creation date distribution ===")
fresh_accounts = []
HACKATHON_RANGE = ("2025-10-01", "2026-02-15")  # 6 weeks before kickoff to recap
for rec in report:
    ts = rec.get("owner_created_at", "")
    if not ts: continue
    if HACKATHON_RANGE[0] <= ts <= HACKATHON_RANGE[1]:
        fresh_accounts.append((rec["owner"], ts, rec.get("owner_public_repos"), rec.get("owner_followers")))
        flag = "★ HACKATHON-ERA ACCOUNT"
    else:
        flag = ""
    print(f"  {rec['owner']:<35} created {ts}  pub_repos={rec.get('owner_public_repos')}  followers={rec.get('owner_followers')} {flag}")
print(f"\n  Accounts created during/just-before hackathon window: {len(fresh_accounts)}")

# ============================================================================
# Pass 4: vibe-coded signal
# ============================================================================
print("\n\n=== Vibe-coded / single-commit dumps ===")
for rec in report:
    if rec.get("VIBE_CODED_FLAG"):
        print(f"  {rec['owner']}/{rec.get('repo')}: {rec['VIBE_CODED_FLAG']}  (commits={rec.get('commit_count_page1')}, authors={rec.get('commit_authors_count')})")

# ============================================================================
# Pass 5: deleted / missing repos
# ============================================================================
print("\n\n=== Repos that no longer exist ===")
for rec in report:
    if rec.get("repo") and rec.get("repo_exists") is False:
        print(f"  ★ {rec['owner']}/{rec['repo']} — DELETED / NOT FOUND")
        if rec.get("repo_wayback_snapshot"):
            print(f"      Wayback: {rec['repo_wayback_snapshot']}")
        else:
            print("      (no Wayback Machine snapshot)")

# ============================================================================
# Pass 6: repos that exist but show suspicious abandonment / size
# ============================================================================
print("\n\n=== Activity / size / abandonment scorecard ===")
print(f"  {'owner/repo':<55} {'created':<22} {'last push':<22} {'commits':>4} {'authors':>4} {'size_kb':>6} {'stars':>5}")
for rec in report:
    if not rec.get("repo"): continue
    if not rec.get("repo_exists"): continue
    print(f"  {(rec['owner']+'/'+(rec.get('repo') or ''))[:55]:<55} "
          f"{(rec.get('repo_created_at') or '')[:19]:<22} "
          f"{(rec.get('repo_pushed_at') or '')[:19]:<22} "
          f"{rec.get('commit_count_page1', 0):>4} "
          f"{rec.get('commit_authors_count', 0):>4} "
          f"{rec.get('repo_size_kb', 0):>6} "
          f"{rec.get('repo_stargazers_count', 0):>5}")


# ============================================================================
# Save report
# ============================================================================
(OUTDIR / "github_forensics.json").write_text(json.dumps(report, indent=2, default=str))
with (OUTDIR / "github_forensics.csv").open("w") as f:
    keys = sorted({k for rec in report for k in rec.keys()})
    w = csv.writer(f); w.writerow(keys)
    for rec in report:
        w.writerow([rec.get(k, "") for k in keys])

# Also dump multi-project contributors
with (OUTDIR / "github_multi_project_contributors.json").open("w") as f:
    json.dump({"multi_project": multi_project_contribs}, f, indent=2)

print(f"\nArtifacts written to {OUTDIR}/")
