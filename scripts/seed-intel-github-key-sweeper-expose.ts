/**
 * Run with: npx tsx scripts/seed-intel-github-key-sweeper-expose.ts
 *
 * Ships the 2026-05-18 GitHub-leaked-private-key sweeper exposé as the 5th
 * featured /intel piece, alongside casper / despark / oriolo / pink-drainer.
 *
 * Inserted (or updated if already present) as kind=original, status=approved,
 * featured=true, spicy=false (per Rex's 2026-05-18 directive on this piece).
 *
 * Body markdown is read from drafts/github-key-sweeper-expose-v0.md so the
 * article is version-controlled alongside the article copy — re-run after
 * editing the draft to refresh.
 */
import "dotenv/config";
import fs from "fs";
import path from "path";
import { eq, sql } from "drizzle-orm";
import { db, submissions } from "../src/lib/db";
import type { IntelPayload } from "../src/lib/db/schema";

const SPEC = {
  file: "drafts/github-key-sweeper-expose-v0.md",
  headline:
    "A GitHub-leaked private key turned one founder's wallet into a 10-day automated paycheck for a vanity-branded drainer crew — and 195 other victims hit the same operator sink in four days",
  dek: "Inside an actively-operational, Scam-Sniffer-unattributed drainer aggregation wallet with a vanity-mined `aAaAaAaA` suffix — 196 inbound victim flows in four days, 47 ERC-20 tokens currently parked, fanning out at 1.4 transactions per minute as of publish.",
  category: "GitHub-leaked-key sweeper",
  severity: "critical" as const,
  sources: [
    "https://www.trmlabs.com/post/drainware-unfortunately-coming-to-a-cryptocurrency-wallet-near-you",
    "https://ambcrypto.com/new-ethereum-feature-backfires-150k-stolen-in-sweeper-attacks-post-pectra-upgrade/",
    "https://www.bitget.com/news/detail/12560604791489",
    "https://collective.flashbots.net/t/sweeper-drainer-infected-multiple-mm/3361",
    "https://support.metamask.io/privacy-and-security/staying-safe-in-web3/fighting-back-against-sweeper-bots/",
    "https://muellerberndt.medium.com/a-peek-inside-inferno-drainer-0a69647b85ca",
    "https://muellerberndt.medium.com/a-brief-analysis-of-angel-drainer-1660d15c9248",
    "https://blog.sucuri.net/2024/02/web3-crypto-malware-angel-drainer.html",
    "https://phishdestroy.io/",
    "https://github.com/phishdestroy/DestroyScammers",
  ],
  links: [
    "https://etherscan.io/address/0x63825239F09d8EC83bc556EC32B7773A8aAaAaAa",
    "https://etherscan.io/address/0x116C28e6DCABCa363f83217C712d79DCE168d90e",
    "https://etherscan.io/tx/0xefbb2a07e41f0e1ef30ad5610e4e2d7af9156339d4a66aed0e192d3ba3620341",
    "https://etherscan.io/tx/0x9601613e0c2ad425993cd2e8313957935df8e709b21f8d7b7076628caa4cccb5",
  ],
  heroImageUrl: "/intel-heroes/github-key-sweeper.svg",
  heroAlt:
    "Five sweeps in ten days. One leaked private key. A vanity-branded drainer sink at 0x6382…aAaAaAaA aggregated 196 victim flows in four days.",
  heroCaption:
    "Five sweeps in ten days. Vanity operator sink, 196 inbound victims, no public label. Live cash-out at 1.4 tx/min.",
  heroCredit: "Rex Intel Services · Investigations Desk",
} as const;

function loadBody(file: string): string {
  const fullPath = path.join(process.cwd(), file);
  const raw = fs.readFileSync(fullPath, "utf-8");
  // Strip YAML frontmatter (first --- block) and the H1 + dek that follow,
  // since headline and dek are stored as their own fields and re-rendered.
  return raw
    .replace(/^---[\s\S]*?---\n\n?/, "")
    .replace(/^#\s+.*\n\n?\*.*\*\n\n?---\n\n?/, "")
    .trim();
}

async function main() {
  const body = loadBody(SPEC.file);

  const payload: IntelPayload = {
    headline: SPEC.headline,
    dek: SPEC.dek,
    body,
    bodyFormat: "markdown",
    kind: "original",
    category: SPEC.category,
    severity: SPEC.severity,
    sourceGrade: "primary",
    anonymous: true,
    personas: ["founder", "developer", "investor", "investigator", "journalist"],
    sources: [...SPEC.sources],
    links: [...SPEC.links],
    // spicy intentionally omitted — Rex directive 2026-05-18: featured=true, no spicy tag.
    heroImageUrl: SPEC.heroImageUrl,
    heroAlt: SPEC.heroAlt,
    heroCaption: SPEC.heroCaption,
    heroCredit: SPEC.heroCredit,
  };

  const now = new Date();

  const existing = await db
    .select({ id: submissions.id, publicId: submissions.publicId })
    .from(submissions)
    .where(eq(sql`${submissions.payload}->>'headline'`, SPEC.headline))
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
    console.log(`UPDATED  id=${row.id}  publicId=${row.publicId}`);
    console.log(`         /intel/${row.publicId}`);
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
    console.log(`INSERTED id=${inserted.id}  publicId=${inserted.publicId}`);
    console.log(`         /intel/${inserted.publicId}`);
  }
  console.log(`         body=${body.length} chars`);
  console.log(`         featured=true  spicy=(omitted)  kind=original  severity=critical`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
