/**
 * Run with: npx tsx scripts/seed-intel-casper-deployer-cluster.ts
 *
 * Companion to the Casper Hackathon 2026 main exposé. Different angle on
 * the same incident: from-inside-the-code-itself receipts of operator
 * clustering — wallets that appear hardcoded in multiple competing
 * project repositories. Featured as a second incident-class intel row.
 *
 * Anonymous source by design (RexIntel publishes anonymously). Idempotent
 * by headline match.
 */
import "dotenv/config";
import { eq, sql } from "drizzle-orm";
import { db, submissions } from "../src/lib/db";
import type { IntelPayload } from "../src/lib/db/schema";

const HEADLINE =
  "Casper Hackathon 2026: one wallet, three 'teams' — operator-cluster receipts from the codebase";

const body = [
  // First paragraph = the public teaser (first ~280 chars when gated).
  "Three different Casper Hackathon 2026 finalist projects hardcoded the same on-chain wallet — 5,036 CSPR balance — in their code. Separately, one operator submitted three competing entries via shared wallets and won an Interoperability prize. From inside the projects' own codebases, the contest's 'team' boundaries weren't what they looked like.",
  "",
  "## The methodology",
  "",
  "After the on-chain voter-pool forensics on Casper Hackathon 2026 ([primary exposé here](/intel/8a751869eb304381)) showed the bot operators were among the winners at the voter level, we asked a separate question of the same dataset: what wallets do the project teams themselves reference in their own code?",
  "",
  "We cloned every alive hackathon-finalist GitHub repository (29 of them; eight more were deleted between the contest and this writing). We grepped each tree for Casper-format addresses — secp256k1 public keys (`02[66hex]`), ed25519 public keys (`01[64hex]`), account hashes (`account-hash-[64hex]`), contract package hashes (`hash-[64hex]`), URefs, and bare 64-hex strings that sit near Casper-context keywords (deploy, contract, account, wasm, mainnet, testnet, etc.). We deduplicated, then enriched every candidate against the `cspr.cloud` mainnet API. Of 532 candidate addresses, 39 resolved to real on-chain accounts.",
  "",
  "Of those 39, the cross-repo overlap pattern is the story.",
  "",
  "## Shared wallet #1 — `017d96b9a6…` (5,036 CSPR balance) appears in three different 'teams'",
  "",
  "The wallet `017d96b9a63abcb61c870a4f55187a…` appears hardcoded in the codebases of three different Casper Hackathon 2026 finalist entries:",
  "",
  "- `le-stagiaire-ag2r/Casper-projet` — a 685-commit, two-author, three-month real-shape development project from a French intern team",
  "- `SAHU-01/CasperStake` — a staking dApp entry from a different developer (account age 2020, prior multi-hackathon history)",
  "- `IHB1-Foundation/magni-cspr` — an IHB1 Foundation project (the same `IHB1-Foundation` GitHub org dating to August 2025)",
  "",
  "Three different team owners. Three different project entries. Three different repositories. One wallet, with 5,036 CSPR (~$0.10/CSPR class — not a dust value), hardcoded in all three.",
  "",
  "5,036 CSPR is not a tutorial address. The Casper docs and the Odra framework's example code use either zero-balance placeholders or the all-zeros account-hash. A 5,036-CSPR wallet appearing in three different teams' code is, at minimum, infrastructure shared across those teams. The three plausible readings:",
  "",
  "1. **Shared deployment service or faucet.** Some Casper-ecosystem service runs at this account and three projects integrated with it independently. We checked the wallet's transaction history; it does not match the dispersal pattern of a public faucet (a faucet's outgoing transfers would be a steady stream of small equal amounts to many different recipients — this wallet's history is not that shape).",
  "2. **Shared deployment infrastructure** — for example, a hackathon-mentor or accelerator's deploy bot that several teams routed through. Plausible but not previously disclosed by Casper or these teams.",
  "3. **Operator-cluster coordination** — three nominally-independent \"teams\" with overlapping operator backing. Strongest signal in our broader dataset, weakest direct proof at the wallet level for this particular wallet.",
  "",
  "We do not assert which of the three. We note that the wallet sits in three teams' source repositories with the same hash, that none of the three teams discloses a relationship with the other two, and that no public Casper-Association documentation explains why this would be a normal pattern.",
  "",
  "## Shared wallet #2 — the abdul-kabugu cluster (the Interop winner submitted twice more)",
  "",
  "Three competing hackathon entries share four on-chain wallets in their code:",
  "",
  "- `BridgeX-dapp/bridgeX` — the announced Interoperability winner ($2,500 prize)",
  "- `anchor-protoco/protocol` — a six-commit AI-codebase dump (53,474 lines added in the first commit; the GitHub org `anchor-protoco` was created 2026-01-03, one day before the contest's original submission deadline)",
  "- `Xayaan/Casper-FOMO` — two commits made ten seconds apart on 2026-01-11, never touched again",
  "",
  "The shared wallets:",
  "",
  "- `BridgeX` ↔ `anchor-protoco`: three shared wallets — pubkey `02039daee95ef2cd54a23bd201febc…` (zero balance), pubkey `0202f5a92ab6da536e7b1a351406f3…` (4 CSPR balance), account-hash `4e37642c85513d3eef943d4f8250de…` (23 CSPR balance).",
  "- `anchor-protoco` ↔ `Casper-FOMO`: one shared wallet — pubkey `02036d9b880e44254afaf34330e577…` (471 CSPR balance).",
  "",
  "Independently of the on-chain match, the same commit-author email — `kabuguabdul2@gmail.com` — appears in the git logs of both `BridgeX-dapp/bridgeX` and `anchor-protoco/protocol`. The git history identifies the same hand on both keyboards. The on-chain wallet sharing extends that to a third entry, `Casper-FOMO`, owned on GitHub by a different account (`Xayaan`, a 12-year-old GitHub account) but referencing the same wallet infrastructure as the other two repos.",
  "",
  "Three competing entries, four shared wallets, one commit-author email confirmed across two of the three, one announced prize won out of the cluster. That's the operator-cluster receipt.",
  "",
  "## Shared wallet #3 — KunBojiMan's hackathon entry inherits Make Software / Casper Foundation commit history from 2021",
  "",
  "The entry at `KunBojiMan/casper-php-sdk` was submitted as a hackathon project in late 2025. Its git history identifies a different origin:",
  "",
  "- **Initial commit by `mssteuer` (Michael Steuer, Casper Network CTO and Make Software co-founder)** on 2021-09-15. Two commits total from this account, both in 2021.",
  "- **`RomanovSci` (Roman Bylbas, Make Software employee, email `roman@make.services`)** — 19 commits between 2021 and January 2025.",
  "- **`mrkara` (Muhammet Kara, Make Software, email `muhammet@make.services`)** — 7 commits between 2021 and February 2022.",
  "- **`ihor`** (Make Software contributor) — 6 commits in late 2021.",
  "",
  "The repository's substantive Casper code dates from 2021 and was authored by Make Software / Casper Foundation employees. The GitHub user `KunBojiMan` (account created June 2022, well after the repository was first committed) republished this historical codebase under their own organization in late 2025 and submitted it as their hackathon entry. The CTO's commits travel forward in the cloned git history but represent no involvement during the hackathon window itself.",
  "",
  "We make no claim that `KunBojiMan` broke a contest rule (open-source forks are permitted under the original license) or that the CTO endorsed the resubmission. We note the structural fact: the entry submitted under this team name in Casper Hackathon 2026 is, by its commit history, a years-old Casper Foundation library with new wrapping, not an original hackathon project. Of all 29 alive hackathon repositories we scanned, this is the only one with that lineage.",
  "",
  "## Shared wallet #4 — Shroud Protocol ↔ Casper-projet (lighter tie)",
  "",
  "Two repositories — `furkanahmetk/shroud-protocol` (announced 2nd-place winner, $7,000) and `le-stagiaire-ag2r/Casper-projet` (the French intern project) — both reference the same wallet `0143345f0d7c6e8d1a8e70eecdc3b4…` (balance 30 CSPR).",
  "",
  "30 CSPR is small enough that this might be a shared faucet, a tutorial wallet, or a deployment-service account that several builders happened to route through. The cross-reference is real (both repos contain the same hash), but the balance is light enough that we don't assert an operator link at this single-wallet level. We log it as a tie of unknown nature.",
  "",
  "## The on-chain self-incrimination already established",
  "",
  "The main exposé documents a fourth, much stronger deployer-cluster finding: the team behind announced 3rd-place winner CasperLink (GitHub `SohamJuneja/CasperLink`) names their project owner wallet in their own `phase1.md` documentation as `account-hash-74ab92cebdb16189b8a1d3ed5a87d6fff8df694e9ede46393b5e11bb441be597` / pubkey `02031ed02f6abebdec47e03f18bc1ee37fcae4d999e82a4f49512c8d25489dfd5302` — the same wallet that, on Casper mainnet, directly funded **106 voters** in the FANR2 voting contract. The 3rd-place team named the apex bot-funder of the contest as its own project owner.",
  "",
  "We separate that out as the headline finding of the main piece. We flag it here because it's the same kind of evidence — wallet identified by the team itself, on-chain behavior recorded by the contract — surfacing in a different angle of the same dataset. Where CasperLink hardcoded the bot-funder wallet as its identity, the BridgeX cluster hardcoded shared wallets across competing entries. The mechanism (project repos as the source of truth for who owned what) is the same; the projects' use of that mechanism is what varies.",
  "",
  "## Anti-detection signals in the operator behavior",
  "",
  "The shared-wallet pattern survives because of, not despite, sophistication elsewhere in the operator toolkit. Two patterns we observed across the dataset matter for anyone running a similar audit on a future contest:",
  "",
  "- **No same-block voter clustering.** Across 1,825 distinct blocks containing FANR2 vote-deploys, zero blocks contain ≥3 distinct voters; 29 blocks contain ≥2. Operators deliberately paced vote submissions so the mempool-clustering analysis returns nothing.",
  "- **No same-second batch funding.** Across all 749 traced voters, zero buckets exist of (funder, timestamp-to-the-second) containing 2+ voters funded together. Each voter was funded via a separate transaction. Cascading peer-to-peer funding (64% of voters were funded by another voter who is themselves a voter) was used to avoid the obvious \"one funder → many voters\" smoking gun.",
  "",
  "The deployer-cluster receipts in this piece survive these anti-detection patterns because they're recorded by the project teams themselves in their own source code. The operators paid for block-level scattering and same-second avoidance with their voter-pool plumbing, but the project-level wallet references in their own GitHub repositories were the audit channel they didn't think to scrub. Casper-FOMO's 10-second submission abandon and anchor-protoco's 53,000-line first-commit AI dump aren't sloppy by accident; they are operator behavior optimized for spawn-and-disappear rather than scrub-on-detection.",
  "",
  "## What deployer-cluster analysis proves on its own",
  "",
  "Even setting aside everything else known about Casper Hackathon 2026 — without the voter pool's 67% fresh / 93% dormant / 91% templated patterns, without the Casper Association funding 34 voters and 4 of 7 winning shells with identical 2.5 CSPR seeds, without the private recorded Zoom evaluations Casper kept the recordings of — the deployer-cluster receipts alone establish:",
  "",
  "1. **Operator-level entry overlap was real.** One operator submitted three competing entries (BridgeX, anchor-protoco, Casper-FOMO). The Interop track was won by that cluster.",
  "2. **Shared infrastructure across nominally-independent teams.** A 5,036-CSPR wallet hardcoded in three different teams' code is not, on its face, three independent teams.",
  "3. **The 'team' boundary the contest's prize structure presumed didn't hold.** Prize money was awarded by track to discrete teams. The on-chain record shows the teams weren't discrete.",
  "",
  "## What this doesn't say",
  "",
  "We don't say the `017d96b9…` wallet's three-team appearance is necessarily coordinated rigging. It could be a shared deployment service we haven't identified, or three builders cargo-culting the same copy-pasted address from a shared workshop. Either innocent explanation should be disclosed by Casper or the teams if it's the real one. Neither has been.",
  "",
  "We don't say the `Shroud Protocol` ↔ `Casper-projet` 30-CSPR wallet tie is operator-cluster evidence on its own. Small balance, plausible shared-faucet explanation. We log it as an open question.",
  "",
  "We do say the BridgeX / anchor-protoco / Casper-FOMO three-entry-one-prize finding holds. Same commit-author email in two of the three repos. Four shared on-chain wallets across all three. Three repos with distinct sub-shapes — Interop-winner, AI-codebase dump, 10-second submission abandon — all linked at the on-chain wallet level. One prize awarded out of the cluster.",
  "",
  "## Evidence index",
  "",
  "Every wallet hash is verifiable via `cspr.live` (replace `{hash}` in `https://cspr.live/account/{hash}`). Every GitHub repository is reachable at `github.com/{owner}/{repo}` unless flagged deleted.",
  "",
  "**Shared wallet #1 (5,036 CSPR)**",
  "- `017d96b9a63abcb61c870a4f55187a…` referenced in: `le-stagiaire-ag2r/Casper-projet`, `SAHU-01/CasperStake`, `IHB1-Foundation/magni-cspr`",
  "",
  "**abdul-kabugu cluster**",
  "- Pubkey `02039daee95ef2cd54a23bd201febc…` — in `BridgeX-dapp/bridgeX` and `anchor-protoco/protocol`",
  "- Pubkey `0202f5a92ab6da536e7b1a351406f3…` — in `BridgeX-dapp/bridgeX` and `anchor-protoco/protocol`",
  "- Account-hash `4e37642c85513d3eef943d4f8250de…` — in `BridgeX-dapp/bridgeX` and `anchor-protoco/protocol`",
  "- Pubkey `02036d9b880e44254afaf34330e577…` (471 CSPR) — in `anchor-protoco/protocol` and `Xayaan/Casper-FOMO`",
  "- Commit-author email `kabuguabdul2@gmail.com` — appears in git logs of `BridgeX-dapp/bridgeX` and `anchor-protoco/protocol`",
  "",
  "**Lighter tie**",
  "- Pubkey `0143345f0d7c6e8d1a8e70eecdc3b4…` (30 CSPR) — in `furkanahmetk/shroud-protocol` and `le-stagiaire-ag2r/Casper-projet`",
  "",
  "**Cross-reference to main piece**",
  "- The CasperLink team's documented owner wallet — pubkey `02031ed02f6abebdec47e03f18bc1ee37fcae4d999e82a4f49512c8d25489dfd5302`, account-hash `74ab92cebdb16189b8a1d3ed5a87d6fff8df694e9ede46393b5e11bb441be597` — is, on Casper mainnet, the wallet that funded 106 voters in the FANR2 voting contract. Documented in `SohamJuneja/CasperLink/phase1.md` as \"Account Hash (Owner).\"",
  "",
  "**Deleted repositories** (no longer accessible for review; Wayback Machine has no snapshot)",
  "- `dmrdvn/caspay` — announced 1st-place winner",
  "- `osas2211/sampled-casper`",
  "- `StudioLIQ/gaspar-finance`",
  "- `x5engine/CasperGhost-The-Autonomous-DeFi-Agent`",
  "- `fullendmaestro/anchore`",
  "- `HoomanBuilds/agentis`",
  "- `luxipha/CasperID`",
  "- `mja2001/SolCipher-Casper`",
  "",
  "All cross-repo wallet matches were detected by automated grep of cloned repositories against the same regex set; all matches were then enriched against the cspr.cloud REST API to confirm the wallet exists on mainnet and to retrieve current balances. Investigation by RexIntel.",
].join("\n");

const payload: IntelPayload = {
  headline: HEADLINE,
  body,
  kind: "incident",
  category: "Hackathon fraud",
  severity: "critical",
  sourceGrade: "primary",
  anonymous: true,
  personas: ["founder", "developer", "investor", "investigator", "journalist", "fund-risk"],
  sources: [
    "https://cspr.live/account/02031ed02f6abebdec47e03f18bc1ee37fcae4d999e82a4f49512c8d25489dfd5302",
    "https://github.com/SohamJuneja/CasperLink",
    "https://github.com/BridgeX-dapp/bridgeX",
    "https://github.com/anchor-protoco/protocol",
    "https://github.com/Xayaan/Casper-FOMO",
    "https://github.com/le-stagiaire-ag2r/Casper-projet",
    "https://github.com/SAHU-01/CasperStake",
    "https://github.com/IHB1-Foundation/magni-cspr",
    "https://github.com/furkanahmetk/shroud-protocol",
  ],
  links: [
    "/intel/8a751869eb304381",
  ],
};

async function main() {
  const now = new Date();

  const existing = await db
    .select({ id: submissions.id, publicId: submissions.publicId })
    .from(submissions)
    .where(eq(sql`${submissions.payload}->>'headline'`, HEADLINE))
    .limit(1);

  if (existing.length) {
    const row = existing[0];
    await db
      .update(submissions)
      .set({
        payload,
        status: "approved",
        featured: true,
        publishedAt: now,
        updatedAt: now,
        submitterHandle: "RexIntel",
      })
      .where(eq(submissions.id, row.id));
    console.log(`Updated existing companion piece (id=${row.id}, publicId=${row.publicId})`);
    console.log(`  /intel/${row.publicId}`);
  } else {
    const [inserted] = await db
      .insert(submissions)
      .values({
        type: "intel",
        status: "approved",
        payload,
        submitterHandle: "RexIntel",
        publishedAt: now,
        featured: true,
      })
      .returning({ id: submissions.id, publicId: submissions.publicId });
    console.log(`Inserted companion piece (id=${inserted.id}, publicId=${inserted.publicId})`);
    console.log(`  /intel/${inserted.publicId}`);
  }

  console.log(`\nFeatured at the top of /intel signals lane (alongside main exposé).`);
  console.log(`Body length: ${body.length} chars`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
