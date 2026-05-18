"""
Casper Hackathon 2026 — CTO / Casper-Network org cross-reference.

Targets:
  - github.com/mssteuer (likely Michael Steuer, Casper Association CTO)
  - github.com/casper-network (official Casper org)
  - github.com/casper-ecosystem
  - github.com/cspr-rad (Casper Association R&D)
  - github.com/make-software (CSPR.fans / cspr.live operator)

Cross-references against every contributor we've identified across the
hackathon-project repos:
  1. Does mssteuer follow any of our actors? Do any actors follow mssteuer?
  2. Has mssteuer starred any of our hackathon-project repos?
  3. Are any of our actors public members of casper-network / casperlabs /
     make-software / cspr-rad orgs?
  4. Has any of our actors contributed to the official Casper repos?
  5. Email domain analysis: do any commit emails from hackathon repos match
     domains used by mssteuer / Casper-network commits?
  6. Mutual followers between mssteuer and our actors?
"""

from __future__ import annotations
import json, subprocess
from collections import Counter, defaultdict
from pathlib import Path

OUTDIR = Path("scripts/.casper-forensics-output")
CTO = "mssteuer"
CASPER_ORGS = ["casper-network", "casper-ecosystem", "make-software", "cspr-rad", "casperlabs", "Casper-Association"]


def gh(path: str, paginate: bool = False):
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


# Build the universe of "our actors" — every contributor across every alive repo + every repo owner
with (OUTDIR / "github_forensics.json").open() as f:
    r1 = json.load(f)
with (OUTDIR / "github_forensics_round2.json").open() as f:
    r2 = json.load(f)
ALL_ACTORS: set[str] = set()
ALIVE = []
for r in r1 + r2:
    if r.get("owner"): ALL_ACTORS.add(r["owner"])
    if r.get("repo") and r.get("repo_exists"):
        ALIVE.append((r["owner"], r["repo"]))
    for c in r.get("contributors_logins", []) or []:
        ALL_ACTORS.add(c)
    for a in r.get("commit_distinct_authors", []) or []:
        if a and "@" not in a:  # only logins, not names
            ALL_ACTORS.add(a)
try:
    with (OUTDIR / "github_user_repos.json").open() as f:
        user_repos = json.load(f)
    for u, repos in user_repos.items():
        ALL_ACTORS.add(u)
        for r in repos:
            if r.get("name"):
                ALIVE.append((u, r["name"]))
except FileNotFoundError:
    pass
print(f"Universe size: {len(ALL_ACTORS)} unique actors across {len(ALIVE)} alive repos")


# ============================================================================
# C1: Profile the CTO
# ============================================================================
print(f"\n[C1] profiling {CTO}...")
user = gh(f"/users/{CTO}")
if user:
    print(f"  name: {user.get('name')}")
    print(f"  bio: {user.get('bio')}")
    print(f"  company: {user.get('company')}")
    print(f"  blog: {user.get('blog')}")
    print(f"  twitter: {user.get('twitter_username')}")
    print(f"  location: {user.get('location')}")
    print(f"  email: {user.get('email')}")
    print(f"  created: {user.get('created_at')}")
    print(f"  public repos: {user.get('public_repos')}")
    print(f"  followers: {user.get('followers')}    following: {user.get('following')}")
else:
    print(f"  user not found")

# CTO's orgs
cto_orgs = gh(f"/users/{CTO}/orgs") or []
cto_org_logins = [o.get("login") for o in cto_orgs if isinstance(o, dict)]
print(f"  public orgs: {cto_org_logins}")


# ============================================================================
# C2: Does the CTO follow / get followed by any of our actors?
# ============================================================================
print(f"\n[C2] CTO ↔ hackathon actors follow graph...")
cto_following = gh(f"/users/{CTO}/following?per_page=100", paginate=True) or []
cto_followers = gh(f"/users/{CTO}/followers?per_page=100", paginate=True) or []
cto_following_set = {x.get("login") for x in cto_following if isinstance(x, dict)}
cto_followers_set = {x.get("login") for x in cto_followers if isinstance(x, dict)}
print(f"  CTO follows: {len(cto_following_set)} accounts")
print(f"  CTO followers: {len(cto_followers_set)} accounts")

following_overlap = cto_following_set & ALL_ACTORS
followers_overlap = cto_followers_set & ALL_ACTORS
print(f"\n  CTO follows these hackathon actors:    {sorted(following_overlap)}")
print(f"  These hackathon actors follow CTO:      {sorted(followers_overlap)}")
mutual = following_overlap & followers_overlap
print(f"  MUTUAL follows (CTO ↔ actor):           {sorted(mutual)}")


# ============================================================================
# C3: Does the CTO star any of our hackathon repos?
# ============================================================================
print(f"\n[C3] CTO star check on hackathon repos...")
cto_stars = gh(f"/users/{CTO}/starred?per_page=100", paginate=True) or []
cto_starred_repos = set()
if isinstance(cto_stars, list):
    for r in cto_stars:
        if isinstance(r, dict):
            cto_starred_repos.add(r.get("full_name", ""))
hackathon_repo_ids = {f"{o}/{r}" for o, r in ALIVE}
starred_hackathon = cto_starred_repos & hackathon_repo_ids
print(f"  CTO total stars: {len(cto_starred_repos)}")
print(f"  CTO stars on hackathon repos:           {sorted(starred_hackathon)}")


# ============================================================================
# C4: Casper-org public membership for every actor
# ============================================================================
print(f"\n[C4] Casper-org membership check across {len(ALL_ACTORS)} actors...")
# Pull each Casper org's PUBLIC members
casper_org_members: dict[str, set[str]] = {}
for org in CASPER_ORGS:
    members = gh(f"/orgs/{org}/members?per_page=100", paginate=True) or []
    if isinstance(members, list):
        casper_org_members[org] = {m.get("login") for m in members if isinstance(m, dict)}
        print(f"  org {org}: {len(casper_org_members[org])} public members")

actor_in_casper_org: dict[str, list[str]] = {}
for actor in ALL_ACTORS:
    in_orgs = [o for o, ms in casper_org_members.items() if actor in ms]
    if in_orgs:
        actor_in_casper_org[actor] = in_orgs
        print(f"  ★ {actor} is in Casper orgs: {in_orgs}")


# ============================================================================
# C5: Has any of our actors contributed to OFFICIAL Casper repos?
# ============================================================================
print(f"\n[C5] official Casper repo contributor check...")
# Get top repos from each Casper org
official_repos: list[tuple[str, str]] = []
for org in CASPER_ORGS:
    repos = gh(f"/orgs/{org}/repos?per_page=50&sort=updated") or []
    if isinstance(repos, list):
        for r in repos:
            if isinstance(r, dict) and r.get("name"):
                official_repos.append((org, r["name"]))
print(f"  scanning contributor lists across {len(official_repos)} official Casper repos...")

actor_to_official_contributions: dict[str, list[str]] = defaultdict(list)
for org, repo in official_repos:
    cs = gh(f"/repos/{org}/{repo}/contributors?per_page=100") or []
    if isinstance(cs, list):
        for u in cs:
            if not isinstance(u, dict): continue
            login = u.get("login")
            if login and login in ALL_ACTORS:
                actor_to_official_contributions[login].append(f"{org}/{repo}")

print(f"\n  Hackathon actors with official-Casper contributions:")
for actor, official in sorted(actor_to_official_contributions.items(), key=lambda x: -len(x[1])):
    print(f"    ★ {actor} → {official[:5]}{' +'+str(len(official)-5)+' more' if len(official)>5 else ''}")


# ============================================================================
# C6: Reverse-direction — does the CTO appear in any hackathon-repo contributor list?
# ============================================================================
print(f"\n[C6] does CTO {CTO} appear in any hackathon-repo contributor list?")
cto_on_hackathon_repos = []
for owner, repo in ALIVE:
    cs = gh(f"/repos/{owner}/{repo}/contributors?per_page=100") or []
    if isinstance(cs, list):
        for u in cs:
            if isinstance(u, dict) and u.get("login") == CTO:
                cto_on_hackathon_repos.append(f"{owner}/{repo}")
                break
print(f"  CTO on hackathon repos: {cto_on_hackathon_repos}")


# ============================================================================
# C7: CTO's recent activity around the hackathon window
# ============================================================================
print(f"\n[C7] CTO public events around hackathon window (Nov 14 2025 - Feb 5 2026)...")
events = gh(f"/users/{CTO}/events?per_page=100") or []
window_events = []
if isinstance(events, list):
    for e in events:
        if not isinstance(e, dict): continue
        ts = e.get("created_at", "")
        if "2025-11" <= ts <= "2026-03":
            window_events.append({
                "type": e.get("type"),
                "repo": (e.get("repo") or {}).get("name"),
                "ts": ts,
            })
print(f"  CTO events in hackathon window: {len(window_events)}")
event_types = Counter(e["type"] for e in window_events)
for et, c in event_types.most_common():
    print(f"    {et}: {c}")
event_repos = Counter(e["repo"] for e in window_events)
print(f"  Top repos CTO touched in window:")
for r, c in event_repos.most_common(10):
    flag = " ★ HACKATHON REPO" if r in hackathon_repo_ids else ""
    print(f"    {r:<55} {c}{flag}")


(OUTDIR / "cto_cross_reference.json").write_text(json.dumps({
    "cto_login": CTO,
    "cto_following_actors": sorted(following_overlap),
    "actors_following_cto": sorted(followers_overlap),
    "mutual_follows": sorted(mutual),
    "cto_starred_hackathon_repos": sorted(starred_hackathon),
    "actors_in_casper_orgs": actor_in_casper_org,
    "actors_with_official_contributions": {k: v for k, v in actor_to_official_contributions.items()},
    "cto_on_hackathon_repos": cto_on_hackathon_repos,
    "cto_window_events": window_events,
    "cto_window_repo_distribution": dict(event_repos.most_common(30)),
}, indent=2, default=str))

print("\n\nDone.")
