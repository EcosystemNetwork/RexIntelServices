"""
Casper Hackathon 2026 Final Round (R2) — voter forensics.

Pulls every deploy that called the CSPR.fans voting contract, builds the
unique-voter universe, and enriches each voter with: creation date (first
on-chain deploy), last activity, post-hackathon activity, funding source,
and total deploys. Output is a JSON blob + CSV for ingestion into the
RexIntel address-attribution graph.

Reads the cspr.cloud API key from $CSPR_CLOUD_API_KEY (load via .env.local).

The forensic angles the output should expose:
  - "Created the day they voted, never touched again" = throwaway/farmed wallet
  - "Funded by the same ancestor wallet as N siblings" = bot cluster
  - "Caller pubkey != args.voter for many deploys" = meta-tx / relayer rigging
"""

from __future__ import annotations

import csv
import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

CONTRACT_PACKAGE_HASH = "cbf2518437fbf7f8bdc895dad8eb1bcc5ea4fa0b7978b33721ea73366ad42428"
API_BASE = "https://api.cspr.cloud"
PAGE_SIZE = 250
OUTDIR = Path("scripts/.casper-forensics-output")
OUTDIR.mkdir(parents=True, exist_ok=True)

# Casper Hackathon 2026 voting window. Final-round (R2) contract was deployed
# 2026-01-15; the recap was Feb 5. Anything after this is "post-hackathon".
HACKATHON_END_ISO = "2026-02-05T00:00:00Z"
HACKATHON_END_TS = datetime.fromisoformat(HACKATHON_END_ISO.replace("Z", "+00:00"))

# Load API key from env (set by .env.local). Don't print it.
def load_env_local():
    p = Path(".env.local")
    if not p.exists():
        return
    for line in p.read_text().splitlines():
        if "=" in line and not line.strip().startswith("#"):
            k, v = line.split("=", 1)
            os.environ.setdefault(k.strip(), v.strip())

load_env_local()
API_KEY = os.environ.get("CSPR_CLOUD_API_KEY")
if not API_KEY:
    sys.exit("Set CSPR_CLOUD_API_KEY in .env.local")


def api(path: str, retries: int = 3) -> dict:
    """GET against api.cspr.cloud with retry/backoff. Returns parsed JSON."""
    url = f"{API_BASE}{path}"
    last_err: Exception | None = None
    for attempt in range(retries):
        try:
            req = urllib.request.Request(url, headers={"Authorization": API_KEY})
            with urllib.request.urlopen(req, timeout=20) as r:
                return json.loads(r.read())
        except urllib.error.HTTPError as e:
            if e.code == 429:
                time.sleep(2 ** attempt)
                continue
            last_err = e
        except Exception as e:
            last_err = e
            time.sleep(1 + attempt)
    raise RuntimeError(f"API failed: {url} :: {last_err}")


def parse_ts(s: str) -> datetime:
    return datetime.fromisoformat(s.replace("Z", "+00:00"))


def fetch_all_voting_deploys() -> list[dict]:
    """Page through every deploy that called the voting contract."""
    print(f"[1/4] pulling all deploys to contract {CONTRACT_PACKAGE_HASH[:12]}...")
    first = api(f"/deploys?contract_package_hash={CONTRACT_PACKAGE_HASH}&page_size=1")
    total = first.get("item_count", 0)
    print(f"      total deploys: {total}")
    deploys: list[dict] = []
    page = 1
    while True:
        body = api(
            f"/deploys?contract_package_hash={CONTRACT_PACKAGE_HASH}"
            f"&page_size={PAGE_SIZE}&page={page}"
        )
        rows = body.get("data", [])
        if not rows:
            break
        deploys.extend(rows)
        print(f"      page {page}: +{len(rows)} (running total {len(deploys)} / {total})")
        if len(deploys) >= total:
            break
        page += 1
        time.sleep(0.1)
    return deploys


def build_voter_table(deploys: list[dict]) -> dict[str, dict]:
    """Aggregate deploys per (voter account-hash). The 'voter' is args.voter,
    which is what the contract treats as the vote-caster — even if a different
    wallet submitted the deploy (relayer pattern)."""
    print("[2/4] aggregating voter universe...")
    by_voter: dict[str, dict] = {}
    relayer_count = 0
    for d in deploys:
        args = d.get("args", {}) or {}
        voter_field = (args.get("voter", {}) or {}).get("parsed", "")
        voter_hash = voter_field.removeprefix("account-hash-") if voter_field else ""
        if not voter_hash:
            continue
        caller_hash = d.get("caller_hash", "")
        caller_pk = d.get("caller_public_key", "")
        ts = parse_ts(d["timestamp"])
        project = (args.get("project", {}) or {}).get("parsed", "").removeprefix("account-hash-")
        amount = int((args.get("token_amount", {}) or {}).get("parsed", "0") or 0)
        vote_id = (args.get("vote_id", {}) or {}).get("parsed", "")

        is_relayed = caller_hash != voter_hash
        if is_relayed:
            relayer_count += 1

        rec = by_voter.setdefault(voter_hash, {
            "voter_hash": voter_hash,
            "votes_cast": 0,
            "total_tokens_voted": 0,
            "projects": set(),
            "first_vote_ts": ts,
            "last_vote_ts": ts,
            "callers": set(),   # unique submitter wallets for this voter
            "caller_pks": set(),
            "vote_ids": [],
            "relayed_votes": 0,
            "self_submitted_votes": 0,
        })
        rec["votes_cast"] += 1
        rec["total_tokens_voted"] += amount
        rec["projects"].add(project)
        rec["first_vote_ts"] = min(rec["first_vote_ts"], ts)
        rec["last_vote_ts"] = max(rec["last_vote_ts"], ts)
        rec["callers"].add(caller_hash)
        if caller_pk:
            rec["caller_pks"].add(caller_pk)
        rec["vote_ids"].append(vote_id)
        if is_relayed:
            rec["relayed_votes"] += 1
        else:
            rec["self_submitted_votes"] += 1

    print(f"      unique voter account-hashes: {len(by_voter)}")
    print(f"      deploys where caller != voter (relayer pattern): {relayer_count} / {len(deploys)}")
    return by_voter


def caller_cluster_stats(deploys: list[dict]) -> dict:
    """How concentrated is the submitter set? If a tiny number of callers
    submit votes for hundreds of distinct voters, that's the relayer signature."""
    print("[3/4] caller concentration analysis...")
    callers: dict[str, set[str]] = defaultdict(set)
    for d in deploys:
        ch = d.get("caller_hash", "")
        voter_field = ((d.get("args", {}) or {}).get("voter", {}) or {}).get("parsed", "")
        vh = voter_field.removeprefix("account-hash-") if voter_field else ""
        if ch and vh:
            callers[ch].add(vh)
    # Sort callers by # of distinct voters they submitted for
    ranked = sorted(
        [(c, len(v), v) for c, v in callers.items()],
        key=lambda x: -x[1],
    )
    print(f"      unique caller wallets: {len(callers)}")
    print(f"      top 5 callers by # of voters represented:")
    for c, n, _ in ranked[:5]:
        print(f"        {c[:16]}... → {n} distinct voters")
    return {
        "unique_callers": len(callers),
        "top_callers": [{"caller_hash": c, "distinct_voters": n} for c, n, _ in ranked[:50]],
    }


def enrich_voter_activity(voters: dict[str, dict]) -> None:
    """For each voter where we have a public_key, fetch first/last all-time
    deploy + post-hackathon deploy count. Skips voters where we only have
    account-hash (i.e. they never self-submitted, so we can't query their
    /accounts/{pubkey})."""
    print(f"[4/4] enriching {len(voters)} voters with all-time activity...")
    enriched = 0
    unenrichable = 0
    for i, (vh, rec) in enumerate(voters.items()):
        pks = list(rec["caller_pks"])
        # caller_public_key only matches voter when self-submitted
        # use a self-submitted deploy's caller_public_key if available
        pk = None
        if rec["self_submitted_votes"] > 0 and pks:
            pk = pks[0]  # any self-submitter pubkey will match this voter hash
        if not pk:
            rec["all_time_deploys"] = None
            rec["first_deploy_ever_ts"] = None
            rec["last_deploy_ever_ts"] = None
            rec["post_hackathon_deploys"] = None
            unenrichable += 1
            continue
        try:
            body = api(f"/accounts/{pk}/deploys?page_size=1&page=1")
            total = body.get("item_count", 0)
            rec["all_time_deploys"] = total
            # last deploy = first page result (default order should be desc by time)
            data = body.get("data", [])
            if data:
                last_ts = parse_ts(data[0]["timestamp"])
                rec["last_deploy_ever_ts"] = last_ts
                rec["still_active_post_hackathon"] = last_ts > HACKATHON_END_TS
            # fetch oldest by paginating to last page
            if total > 0:
                last_page = body.get("page_count", 1)
                if last_page > 1:
                    oldest = api(f"/accounts/{pk}/deploys?page_size=1&page={last_page}")
                    odata = oldest.get("data", [])
                    if odata:
                        rec["first_deploy_ever_ts"] = parse_ts(odata[0]["timestamp"])
                else:
                    rec["first_deploy_ever_ts"] = rec["last_deploy_ever_ts"]
            enriched += 1
        except Exception as e:
            rec["enrich_error"] = str(e)
        if i % 25 == 0:
            print(f"      {i}/{len(voters)} ({enriched} enriched, {unenrichable} skipped)")
        time.sleep(0.05)
    print(f"      done: {enriched} enriched, {unenrichable} skipped (no pubkey)")


def summarize(voters: dict[str, dict], caller_stats: dict, total_deploys: int) -> dict:
    voters_list = list(voters.values())
    same_day_as_first_vote = 0
    dead_after_hackathon = 0
    active_post_hackathon = 0
    single_vote = 0
    for v in voters_list:
        if v.get("votes_cast", 0) == 1:
            single_vote += 1
        first_ev = v.get("first_deploy_ever_ts")
        last_ev = v.get("last_deploy_ever_ts")
        first_vote = v["first_vote_ts"]
        if first_ev and first_vote and (first_vote - first_ev).total_seconds() < 86400:
            # account's first ever deploy was within 24h of their first vote = fresh-baked wallet
            same_day_as_first_vote += 1
        if last_ev and v.get("still_active_post_hackathon") is True:
            active_post_hackathon += 1
        elif last_ev and last_ev <= HACKATHON_END_TS:
            dead_after_hackathon += 1
    return {
        "contract_package_hash": CONTRACT_PACKAGE_HASH,
        "contract_name": "Hackathon 2026 R2",
        "vote_token_symbol": "FANR2",
        "total_voting_deploys": total_deploys,
        "unique_voters": len(voters_list),
        "unique_callers": caller_stats["unique_callers"],
        "voters_with_single_vote": single_vote,
        "voters_created_within_24h_of_first_vote": same_day_as_first_vote,
        "voters_active_post_hackathon": active_post_hackathon,
        "voters_dormant_post_hackathon": dead_after_hackathon,
        "top_callers_by_voter_count": caller_stats["top_callers"][:20],
    }


def to_jsonable(obj):
    if isinstance(obj, datetime):
        return obj.isoformat()
    if isinstance(obj, set):
        return sorted(obj)
    raise TypeError(repr(obj))


def main():
    deploys = fetch_all_voting_deploys()
    (OUTDIR / "raw_deploys.json").write_text(
        json.dumps(deploys, default=to_jsonable, indent=0)
    )
    voters = build_voter_table(deploys)
    caller_stats = caller_cluster_stats(deploys)
    enrich_voter_activity(voters)
    summary = summarize(voters, caller_stats, len(deploys))

    (OUTDIR / "summary.json").write_text(json.dumps(summary, indent=2, default=to_jsonable))
    (OUTDIR / "voters.json").write_text(
        json.dumps(list(voters.values()), default=to_jsonable, indent=0)
    )

    # CSV for address-graph ingestion
    with (OUTDIR / "voters.csv").open("w") as f:
        w = csv.writer(f)
        w.writerow([
            "voter_account_hash", "votes_cast", "total_tokens_voted",
            "projects_voted_for", "first_vote_ts", "last_vote_ts",
            "self_submitted_votes", "relayed_votes",
            "all_time_deploys", "first_deploy_ever_ts", "last_deploy_ever_ts",
            "still_active_post_hackathon",
        ])
        for v in voters.values():
            w.writerow([
                v["voter_hash"], v["votes_cast"], v["total_tokens_voted"],
                len(v["projects"]),
                v["first_vote_ts"].isoformat() if v.get("first_vote_ts") else "",
                v["last_vote_ts"].isoformat() if v.get("last_vote_ts") else "",
                v["self_submitted_votes"], v["relayed_votes"],
                v.get("all_time_deploys", ""),
                v["first_deploy_ever_ts"].isoformat() if v.get("first_deploy_ever_ts") else "",
                v["last_deploy_ever_ts"].isoformat() if v.get("last_deploy_ever_ts") else "",
                v.get("still_active_post_hackathon", ""),
            ])

    print()
    print("=== SUMMARY ===")
    print(json.dumps(summary, indent=2, default=to_jsonable))
    print()
    print(f"Outputs written to {OUTDIR}/")


if __name__ == "__main__":
    main()
