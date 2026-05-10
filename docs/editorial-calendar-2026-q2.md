# RexIntel Editorial Calendar — 2026 Q2 Wedge

**Goal:** establish RexIntel as the default intel newsletter for crypto compliance, exchange-risk, investigators, gov/LE, and fund risk. Eight issues over four weeks (two per week — Tue and Fri). Every issue ships ≥1 piece of *original* signal that an analyst would forward to their team. Generic event roundups belong on CryptoNomads; we don't compete there.

**Cadence:** Tue 09:00 ET (compliance/risk reads in-inbox before the day starts) · Fri 13:00 ET (investigations + weekend reading).

**Tagging:** every issue is tagged with one or two `persona` segments (see `src/lib/personas.ts`). Cross-segment issues (kickoff, quarterly recap) target all five.

**Original-signal bar:** if an issue can be summarised by quoting another publication, it doesn't ship. We add data, primary sourcing, or a take that requires our own work.

---

## Issue 01 — Tue 2026-05-12 — *Cross-segment kickoff*

- **Segments:** all five personas
- **Subject:** `RX-01 // The wires we watch — and why`
- **Hook:** RexIntel positioning piece. What we cover, what we won't, the editorial bar, and how to feed us intel.
- **Original signal:** anonymised "first-month traffic" stat — `n` submissions to /submit broken down by category, geographic spread of the audience, and a teaser of three submissions already in the queue for upcoming issues.
- **Lead artifact:** a one-page taxonomy graphic of the five personas with example questions each one answers daily ("does this address touch sanctions?", "is this exchange's travel-rule integration real?").
- **CTA:** drop intel at /submit; reply with one sentence on what's missing from your current intel diet.
- **SEO target:** `crypto intelligence newsletter`, `crypto compliance newsletter`.
- **Notes:** prioritise inbox placement — short, no images-heavy, high text-to-link ratio. This is the issue that defines deliverability for the next 7.

---

## Issue 02 — Fri 2026-05-15 — *Compliance / AML deep dive*

- **Segments:** `compliance`, `exchange-risk`
- **Subject:** `RX-02 // Travel rule, eight months in: who actually shipped`
- **Hook:** the FATF-aligned travel-rule deadlines that bit in late 2025 are now operational. Who actually integrated, and where the cracks are.
- **Original signal:** test-send our own micro-transaction across 6 mid-tier exchanges and document which ones request originator info, which ones break, and which silently let the transfer through. Cluster results into a "compliance posture" matrix.
- **Sourcing notes:** $200 budget for the test sends; reuse internal ops wallets so test addresses don't muddy our own graph. Document method openly so the piece can be cited.
- **Lead artifact:** a 6-row matrix (exchange × travel-rule behaviour). Publish the underlying data as a free JSON snippet so other researchers can cite us.
- **CTA:** tip line for compliance officers — what your team is seeing internally that we should test next.
- **SEO target:** `travel rule crypto compliance 2026`, `[exchange name] travel rule integration`.

---

## Issue 03 — Tue 2026-05-19 — *Investigator postmortem*

- **Segments:** `investigator`, `gov-le`
- **Subject:** `RX-03 // [Recent exploit] — fund flow, hour by hour`
- **Hook:** the most recent ≥$30M DeFi or bridge exploit at time of publication, treated like a news-org timeline.
- **Original signal:** address-level fund-flow graph from the exploiter wallet through the first 4 hops, with timestamps. Identify any mixers, bridges, or off-ramps used. Cross-reference any addresses against our submissions graph (the new `addresses` / `intel_addresses` tables) for prior sightings.
- **Lead artifact:** an inline ASCII flow diagram + a clickable address list (each with explorer link) that mirrors the format of `/intel/[publicId]` so attribution flows to RexIntel pages.
- **Sourcing notes:** all addresses in the piece get added to our /submit pipeline so they're indexed in the graph going forward. This is how we *demonstrate* the wedge while reporting on it.
- **CTA:** investigators get a list of unattributed counterparty addresses ("send us anything you have on these") — turns readers into contributors.
- **SEO target:** `[protocol name] hack timeline`, `[protocol name] exploit fund flow`.

---

## Issue 04 — Fri 2026-05-22 — *Exchange-risk / Trust & Safety*

- **Segments:** `exchange-risk`
- **Subject:** `RX-04 // Seven scam patterns on-ramp teams are missing this quarter`
- **Hook:** the patterns blocking 95% of obvious scams aren't catching the new wave — synthetic identities, peel-chain seasoning, and "warm-up" deposits.
- **Original signal:** seven distinct patterns each illustrated with one anonymised case (real but redacted), with a one-line detection rule analysts can check against their own data. Bonus: which of these was first reported via a /submit submission.
- **Lead artifact:** a short checklist (PDF download, gated by email — captures non-subscribers reading the public version).
- **Sourcing notes:** lean on relationships with fraud teams at 2-3 exchanges (Eric to confirm contacts). Anonymise heavily; clear with each before publishing.
- **CTA:** invite a fraud analyst from your team to subscribe — segment them as `exchange-risk` so they get the next deep-dive.
- **SEO target:** `crypto exchange fraud patterns 2026`, `on-ramp scam detection`.

---

## Issue 05 — Tue 2026-05-26 — *Sanctions / Government*

- **Segments:** `gov-le`, `compliance`
- **Subject:** `RX-05 // What's downstream of the latest OFAC additions`
- **Hook:** the SDN list grows monthly; the addresses freshly added rarely make it into commercial screening lists for weeks. Who's exposed in that gap?
- **Original signal:** scrape the OFAC SDN delta for the last 30 days, identify all crypto address additions, and trace one-hop counterparties using only public on-chain data. Aggregate stats: how many counterparty addresses are still active; rough $-volume in the gap window.
- **Lead artifact:** a redacted "exposure heatmap" by chain — bar chart, no individual addresses called out (legal sensitivity).
- **Sourcing notes:** confirm with counsel that aggregate, anonymised reporting is fine; no individual address-naming-and-shaming downstream of an SDN entry.
- **CTA:** for `gov-le` tier — reply for an unredacted version of the dataset.
- **SEO target:** `OFAC crypto sanctions 2026`, `SDN crypto address additions [month]`.

---

## Issue 06 — Fri 2026-05-29 — *Fund / treasury risk*

- **Segments:** `fund-risk`
- **Subject:** `RX-06 // Stablecoin de-peg risk: where the next shock comes from`
- **Hook:** treasuries are still treating USDC and USDT as cash equivalents. We map the actual liquidity stack underneath each.
- **Original signal:** for the top 5 stables by supply, document — issuer, attestation cadence, redemption channel, on-chain liquidity depth on the 3 deepest pools, and the largest single-holder concentration. Score 1-5 on de-peg fragility with method shown.
- **Lead artifact:** a 5×6 risk matrix, embedded free on RexIntel and refreshed each quarter so treasury teams come back for the update.
- **Sourcing notes:** all data is from issuer disclosures + Curve / Uniswap / Bitfinex orderbook snapshots. No insider info. Footnote everything.
- **CTA:** treasury managers — reply with what de-peg playbook your team has rehearsed; we'll publish (anonymous) responses next quarter.
- **SEO target:** `stablecoin de-peg risk 2026`, `[stablecoin] reserve audit`.

---

## Issue 07 — Tue 2026-06-02 — *Adversary profile*

- **Segments:** `investigator`, `gov-le`
- **Subject:** `RX-07 // Profile: [drainer kit operator / Lazarus sub-cluster / serial rug deployer]`
- **Hook:** ZachXBT-style profile of one specific bad actor or cluster. Pick a target where there's enough public reporting to build on but enough whitespace to add original.
- **Original signal:** identify ≥3 previously-unattributed addresses in the cluster using shared-counterparty heuristics, document the heuristic transparently, and link evidence. Add the cluster to our /intel graph so future submissions auto-cross-reference.
- **Lead artifact:** a profile card (alias, MO, est. proceeds, jurisdiction risk) — designed to be screenshot-shareable on X.
- **Sourcing notes:** before publishing, run the addresses past two outside investigators for sanity check. Avoid naming individuals unless you can stand behind the attribution legally.
- **CTA:** free request line — investigators reply for the full machine-readable address list and we'll add them to a `gov-le` / `investigator` watch-list segment that gets alerted when the cluster moves.
- **SEO target:** `[alias] crypto attribution`, `crypto drainer kit operator`.

---

## Issue 08 — Fri 2026-06-05 — *Q2 wrap*

- **Segments:** all five
- **Subject:** `RX-08 // Q2 in review: 5 incidents, what regulators did, what's next`
- **Hook:** retrospective + forward look. Closes the four-week wedge, sets the next quarter's editorial bets.
- **Original signal:** "RexIntel Index Q2 2026" — a single table aggregating: incidents covered, total $ flagged, addresses added to graph, jurisdictions where regulatory action followed our reporting. This is the artifact you reference for fundraising and partnerships.
- **Lead artifact:** the quarterly index, plus a 3-bet forecast for Q3 (what we're watching, who we're talking to, what data we're collecting).
- **CTA:** invite a peer to subscribe — share-link with their persona pre-tagged. Also: open call for the next quarter's research bets — what should we be tracking for you in Q3?
- **SEO target:** `crypto intelligence Q2 2026`, `crypto incidents quarterly review`.

---

## Cross-issue commitments

- **Persona segmentation in every send** — use `targetTagIds` on every campaign. Even cross-segment issues should have *one* persona-specific footer (a tailored CTA per tag). The campaign composer at `/(admin)/campaigns/new` already supports tag-based targeting.
- **Every investigation pushes addresses into the graph.** Issues 03, 05, 07 in particular. By Issue 08, the `/intel` page should be a meaningful corpus — that's the proof the v2 platform thesis is real.
- **Inbound from /submit gets featured in ≤3 issues per quarter.** Reward contributors publicly (with credit emails — already automated). Builds the contributor flywheel without making the newsletter feel crowdsourced.
- **Track per-issue: opens, clicks, /intel referrals from the email, and replies.** Replies are the leading indicator of "this matters to a buyer" — count them per persona segment.
- **One small-room dinner across the four-week window.** Pair it with whichever issue lands the best (likely 03 or 07). Use the issue subscriber list as the invite pool.

## Distribution beyond email

- **Twitter:** repost the lead artifact from issues 03, 05, 07 as standalone threads. No event-roundup tweets — those are CryptoNomads' lane.
- **LinkedIn:** issues 02, 04, 06 (compliance/risk/fund — buyers live there).
- **Reddit:** issue 03 — r/CryptoCurrency timeline post, link back.
- **Cross-link from /intel listings to the relevant newsletter issue once issues are archived publicly.**

## What we don't do this quarter

- No fees of any kind — no paid memberships, paid feeds, paid tiers, or "upgrade for $X" CTAs. Free is the wedge against CryptoNomads' 0.25 ETH wall.
- No "best events of 2026" SEO churn.
- No jobs board.
- No "nomad" / lifestyle / travel content.
- No newsletter without ≥1 piece of original signal. If we don't have one by Mon (Tue issue) or Thu (Fri issue), shift the schedule rather than ship a weak issue.
