"""
Casper Hackathon 2026 — deep actor + social-graph forensics.

Combines commit-email harvesting, contributor graph, social graph (mutual
follows, mutual stars), prior-collaboration detection, and Casper-org
membership lookup into one pass.

Passes:
  T1. Deep-profile mertksk, abdul-kabugu, furkanahmetk + every multi-project
      contributor — full user info, all repos, orgs, social links.
  T2. Commit-email harvest across every alive repo. Cross-reference: which
      emails appear in multiple "competing" projects? Domain distribution.
  T3. Complete contributor graph + connected components.
  T4. Casper-affiliated org membership for every unique contributor.
  T5. Mutual-follow graph: who follows whom among the actors of interest?
  T6. Mutual-star graph: did they star each other's projects? (vote-boost
      pattern)
  T7. Prior-collaboration: any shared repo OUTSIDE this hackathon?
  T8. Prior-hackathon work: do any of these accounts have older repos
      named for prior Casper Hackathons, DoraHacks events, etc.?
"""

from __future__ import annotations
import json, subprocess
from collections import Counter, defaultdict
from pathlib import Path

OUTDIR = Path("scripts/.casper-forensics-output")

# Load alive repos from prior passes
with (OUTDIR / "github_forensics.json").open() as f:
    r1 = json.load(f)
with (OUTDIR / "github_forensics_round2.json").open() as f:
    r2 = json.load(f)
ALIVE: list[tuple[str, str]] = []
for r in r1 + r2:
    if r.get("repo") and r.get("repo_exists"):
        ALIVE.append((r["owner"], r["repo"]))
# Add user-only discovered Casper repos
try:
    with (OUTDIR / "github_user_repos.json").open() as f:
        user_repos = json.load(f)
    for u, repos in user_repos.items():
        for r in repos:
            if r.get("name"):
                ALIVE.append((u, r["name"]))
except FileNotFoundError:
    pass
ALIVE = list({(o, r) for o, r in ALIVE})
print(f"Total alive Casper-related repos: {len(ALIVE)}")

PEOPLE_OF_INTEREST = ["mertksk", "abdul-kabugu", "furkanahmetk"]


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


def gh_silent_status(path: str) -> int | None:
    """Return HTTP status for a request that we expect to 404 sometimes."""
    cmd = ["gh", "api", "-i", path]
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=20)
        # Parse first line "HTTP/2.0 NNN"
        first = result.stdout.splitlines()[0] if result.stdout else ""
        parts = first.split()
        if len(parts) >= 2 and parts[1].isdigit():
            return int(parts[1])
        return None
    except Exception:
        return None


# ============================================================================
# T1: Deep-profile PEOPLE_OF_INTEREST
# ============================================================================
print("\n[T1] deep-profile actors of interest...")
profiles = {}
for u in PEOPLE_OF_INTEREST:
    print(f"\n  --- {u} ---")
    user = gh(f"/users/{u}")
    if not user:
        print("  not found"); continue
    p = {k: user.get(k) for k in [
        "login","name","company","blog","location","email","bio","twitter_username",
        "hireable","created_at","public_repos","followers","following","public_gists"
    ]}
    print(f"  name={p['name']}  company={p['company']}  location={p['location']}")
    print(f"  email={p['email']}  twitter={p['twitter_username']}  blog={p['blog']}")
    print(f"  bio={p['bio']}")
    print(f"  created={p['created_at']}  repos={p['public_repos']}  followers={p['followers']}  following={p['following']}")
    orgs = gh(f"/users/{u}/orgs") or []
    p["orgs"] = [o.get("login") for o in orgs if isinstance(o, dict)]
    print(f"  orgs: {p['orgs']}")
    profiles[u] = p
(OUTDIR / "actor_profiles.json").write_text(json.dumps(profiles, indent=2, default=str))


# ============================================================================
# T2: commit-email harvest
# ============================================================================
print(f"\n\n[T2] commit-email harvest across {len(ALIVE)} alive repos...")
email_to_repos: dict[str, set[str]] = defaultdict(set)
login_to_emails: dict[str, set[str]] = defaultdict(set)
repo_email_count: dict[str, int] = {}
for i, (owner, repo) in enumerate(ALIVE):
    rid = f"{owner}/{repo}"
    commits = gh(f"/repos/{owner}/{repo}/commits?per_page=100", paginate=True) or []
    n = 0
    if isinstance(commits, list):
        for c in commits:
            if not isinstance(c, dict): continue
            author = (c.get("commit") or {}).get("author") or {}
            email = (author.get("email") or "").lower()
            login = (c.get("author") or {}).get("login")
            if email and "noreply" not in email and "[email protected]" not in email:
                email_to_repos[email].add(rid)
                n += 1
                if login:
                    login_to_emails[login].add(email)
    repo_email_count[rid] = n
    if (i+1) % 10 == 0:
        print(f"  {i+1}/{len(ALIVE)}  unique emails so far: {len(email_to_repos)}")

multi_project_emails = {e: sorted(r) for e, r in email_to_repos.items() if len(r) >= 2}
print(f"\n  unique commit emails: {len(email_to_repos)}")
print(f"  emails on 2+ repos: {len(multi_project_emails)}")
for e, repos in sorted(multi_project_emails.items(), key=lambda x: -len(x[1]))[:25]:
    print(f"    ★ {e}  → {len(repos)} repos: {repos[:5]}{'...' if len(repos)>5 else ''}")

# Domain distribution
domains: Counter = Counter()
for e in email_to_repos:
    if "@" in e:
        domains[e.split("@",1)[1]] += 1
print(f"\n  Top 20 email domains:")
for d, c in domains.most_common(20):
    print(f"    {d:<35} {c}")
casper_affil = [d for d in domains if any(k in d for k in ["casper","cspr","make.services","casperlabs"])]
print(f"  Potentially Casper-affiliated domains: {casper_affil}")


# ============================================================================
# T3: complete contributor graph
# ============================================================================
print(f"\n\n[T3] complete contributor graph...")
contributor_to_repos: dict[str, set[str]] = defaultdict(set)
for owner, repo in ALIVE:
    rid = f"{owner}/{repo}"
    cs = gh(f"/repos/{owner}/{repo}/contributors?per_page=100", paginate=True) or []
    if isinstance(cs, list):
        for u in cs:
            if not isinstance(u, dict): continue
            login = u.get("login")
            if login: contributor_to_repos[login].add(rid)
print(f"  unique contributors: {len(contributor_to_repos)}")
multi_proj_contribs = {k: sorted(v) for k, v in contributor_to_repos.items() if len(v) >= 2}
print(f"  on 2+ projects: {len(multi_proj_contribs)}")
for login, repos in sorted(multi_proj_contribs.items(), key=lambda x: -len(x[1])):
    print(f"    ★ {login}: {repos}")


# ============================================================================
# T4: Casper-org membership
# ============================================================================
print(f"\n\n[T4] Casper-orbit org membership for every contributor...")
casper_members = {}
checked = 0
for login in contributor_to_repos:
    orgs = gh(f"/users/{login}/orgs") or []
    if isinstance(orgs, list):
        org_logins = [o.get("login") for o in orgs if isinstance(o, dict)]
        matched = [o for o in org_logins if any(k in o.lower() for k in ["casper","cspr","make-software","casperlabs","dora"])]
        if matched:
            casper_members[login] = matched
            print(f"  ★ {login} → {matched}")
    checked += 1
    if checked % 25 == 0:
        print(f"    checked {checked}/{len(contributor_to_repos)}...")


# ============================================================================
# T5: mutual-follow graph among actors of interest + multi-project contribs + repo owners
# ============================================================================
print(f"\n\n[T5] mutual-follow graph...")
SOCIAL_SET = set(PEOPLE_OF_INTEREST) | set(multi_proj_contribs.keys()) | {o for o, _ in ALIVE}
print(f"  graph nodes: {len(SOCIAL_SET)}")
# For each user, pull who they follow (limit to first 200 to bound cost)
follow_graph: dict[str, set[str]] = {}
for u in sorted(SOCIAL_SET):
    following = gh(f"/users/{u}/following?per_page=100", paginate=True) or []
    if isinstance(following, list):
        f_set = {x.get("login") for x in following if isinstance(x, dict) and x.get("login")}
        # Restrict edges to within our set
        edges = f_set & SOCIAL_SET
        follow_graph[u] = edges
        if edges:
            print(f"  {u} follows: {sorted(edges)}")
# Mutual pairs
mutual_pairs = []
for a, follows_a in follow_graph.items():
    for b in follows_a:
        if a < b and b in follow_graph and a in follow_graph[b]:
            mutual_pairs.append((a, b))
print(f"\n  mutual-follow pairs within hackathon-actor set: {len(mutual_pairs)}")
for a, b in mutual_pairs:
    print(f"    ★ {a} ↔ {b}")


# ============================================================================
# T6: mutual-star graph (did they star each other's projects?)
# ============================================================================
print(f"\n\n[T6] mutual-star graph — did actors star each other's hackathon repos?")
# Aggregate: for each repo, get stargazers; check if any are other actors
stargazer_map: dict[str, set[str]] = {}
for owner, repo in ALIVE:
    rid = f"{owner}/{repo}"
    stars = gh(f"/repos/{owner}/{repo}/stargazers?per_page=100") or []
    if isinstance(stars, list):
        sgs = {s.get("login") for s in stars if isinstance(s, dict)}
        in_set = sgs & SOCIAL_SET
        if in_set - {owner}:
            stargazer_map[rid] = in_set
            print(f"  {rid} starred by: {sorted(in_set - {owner})}")


# ============================================================================
# T7: prior-collaboration — shared repos OUTSIDE this hackathon
# ============================================================================
print(f"\n\n[T7] prior-collaboration search for actors of interest + multi-proj contribs...")
# For each pair of actors that we know co-occur on hackathon repos, check
# if they ALSO co-collaborated on something else.
prior_collabs: dict[str, list[str]] = {}
for login in (set(PEOPLE_OF_INTEREST) | set(multi_proj_contribs.keys())):
    # Get their last 200 repos and look for OTHER hackathon-actor contributors
    repos = gh(f"/users/{login}/repos?per_page=100&sort=created", paginate=True) or []
    if not isinstance(repos, list): continue
    interesting_collabs = []
    for r in repos[:100]:  # cap
        if not isinstance(r, dict): continue
        rname = r.get("name")
        if not rname: continue
        # Skip the hackathon repo itself
        if (login, rname) in set(ALIVE): continue
        cs = gh(f"/repos/{login}/{rname}/contributors?per_page=30") or []
        if isinstance(cs, list):
            for c in cs:
                if not isinstance(c, dict): continue
                cl = c.get("login")
                if cl and cl in SOCIAL_SET and cl != login:
                    interesting_collabs.append({"repo": f"{login}/{rname}", "with": cl,
                                                 "created": r.get("created_at")})
    if interesting_collabs:
        prior_collabs[login] = interesting_collabs
        print(f"  ★ {login} has prior collabs with hackathon actors:")
        for ic in interesting_collabs[:8]:
            print(f"     {ic['repo']} (created {ic['created']}) — with {ic['with']}")
        if len(interesting_collabs) > 8:
            print(f"     ...{len(interesting_collabs)-8} more")


# ============================================================================
# T8: prior-hackathon work (any older repos named for prior hackathons?)
# ============================================================================
print(f"\n\n[T8] prior-hackathon work for actors of interest...")
HACKATHON_KEYWORDS = ["hackathon", "dorahacks", "ethglobal", "ethindia", "hack", "buidl",
                     "casper-2024", "casper-2025", "casper-hackathon", "cspr-hackathon"]
prior_hack_work: dict[str, list[dict]] = {}
for login in (set(PEOPLE_OF_INTEREST) | set(multi_proj_contribs.keys()) | {o for o, _ in ALIVE}):
    repos = gh(f"/users/{login}/repos?per_page=100&sort=created", paginate=True) or []
    if not isinstance(repos, list): continue
    hits = []
    for r in repos:
        if not isinstance(r, dict): continue
        nm = (r.get("name") or "").lower()
        desc = (r.get("description") or "").lower()
        text = nm + " " + desc
        # Exclude current hackathon repos
        if (login, r.get("name")) in set(ALIVE): continue
        if any(k in text for k in HACKATHON_KEYWORDS):
            hits.append({
                "name": r.get("name"), "created": r.get("created_at"),
                "description": r.get("description"), "language": r.get("language"),
            })
    if hits:
        prior_hack_work[login] = hits
        print(f"  ★ {login} prior hackathon-related repos:")
        for h in hits[:5]:
            desc = h.get('description') or ''
            print(f"     {h['name']} (created {h['created']}) — {desc[:80]}")


# ============================================================================
# Persist everything
# ============================================================================
(OUTDIR / "actor_deep_dive.json").write_text(json.dumps({
    "people_of_interest": list(PEOPLE_OF_INTEREST),
    "social_set": sorted(SOCIAL_SET),
    "multi_project_contributors": multi_proj_contribs,
    "casper_org_members": casper_members,
    "mutual_follow_pairs": [list(p) for p in mutual_pairs],
    "follow_graph_within_set": {k: sorted(v) for k, v in follow_graph.items() if v},
    "mutual_stars": {k: sorted(v) for k, v in stargazer_map.items()},
    "prior_collaborations": prior_collabs,
    "prior_hackathon_work": prior_hack_work,
    "multi_project_emails": multi_project_emails,
    "email_domain_distribution": dict(domains.most_common(50)),
    "casper_affiliated_email_domains": casper_affil,
}, indent=2, default=str))

print("\n\nAll passes done.")
