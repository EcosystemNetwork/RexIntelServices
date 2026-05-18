/**
 * Run with: npx tsx scripts/seed-intel-investigations-2026-05-18.ts
 *
 * Ships the three 2026-05-18 investigative pieces:
 *   1. Despark / Consensys-Mesh drainer expose
 *   2. Oriolo / Orange Pills Telegram VC impersonation
 *   3. Pink Drainer / NiftyDegen #5504 NFT scam (Blur.io vector)
 *
 * Each is inserted (or updated if already present) as kind=original,
 * status=approved, featured=true so they sort to the top of /intel.
 * Body markdown is read from drafts/*.md so the article is version-controlled
 * alongside the article copy — re-run after editing the draft to refresh.
 */
import "dotenv/config";
import fs from "fs";
import path from "path";
import { eq, sql } from "drizzle-orm";
import { db, submissions } from "../src/lib/db";
import type { IntelPayload } from "../src/lib/db/schema";

type ArticleSpec = {
  file: string;
  headline: string;
  dek: string;
  category: string;
  severity: "low" | "medium" | "high" | "critical";
  sources: string[];
  links: string[];
  spicy?: boolean;
};

const ARTICLES: ArticleSpec[] = [
  {
    file: "drafts/despark-drainer-expose-v0.md",
    headline:
      "Consensys-funded research call preceded a fully automated multi-chain drain. The same operator is hitting victims today.",
    dek: "How a $54 user-research interview became the most expensive Zoom call of one crypto founder's life — and exposed an active drainer ring.",
    category: "Drainer-as-a-service",
    severity: "critical",
    spicy: true,
    sources: [
      "https://www.mesh.xyz/post/despark",
      "https://consensysmesh.medium.com/despark-5d769b08b830",
      "https://www.crunchbase.com/organization/despark-3c97",
      "https://pitchbook.com/profiles/company/535467-25",
      "https://www.linkedin.com/company/desparkweb3",
      "https://www.despark.io/products/user-pool",
      "https://attack.mitre.org/campaigns/C0022/",
      "https://blog.sekoia.io/clickfake-interview-campaign-by-lazarus/",
      "https://support.relay.link/en/articles/12213430-malicious-eip-7702-delegations-and-how-to-stay-safe",
    ],
    links: [
      "https://solscan.io/account/HeJkAGASQu8esawJyrEW4WFkdoqTpsZSGatkoFb4XqVa",
      "https://solscan.io/account/GmgHSpuXYejyfZ9E63YPR9XFdfHj4pyuu7cVu8jTrN9f",
      "https://solscan.io/account/9yj3zvLS3fDMqi1F8zhkaWfq8TZpZWHe6cz1Sgt7djXf",
      "https://solscan.io/account/6m2CDdhRgxpH4WjvdzxAYbGxwdGUz5MziiL5jek2kBma",
      "https://solscan.io/account/7MoK8H31L7YBsf5xG8g2bQaasW4HmuWP7XH8yhw8hQy1",
      "https://solscan.io/account/CYt5zhUNZfyXy7j95Sn9rcPUc5FByNj6A4SD8aAmeh71",
      "https://etherscan.io/address/0x118EDd03335D07B498A511213cDb9FDfB448EcA3",
      "https://etherscan.io/address/0x5A77f0DFc729700300c22e7b0111a5cfbC32431B",
      "https://etherscan.io/address/0x63245b9fADc65C3a6d61b1A1a812808ffC91BD29",
    ],
  },
  {
    file: "drafts/oriolo-impersonation-expose-v0.md",
    headline:
      "Fake VC impersonation on Telegram led to a multi-chain founder's Bitcoin wallet being drained 24 hours after the pitch call",
    dek: "How one ETH Denver group lurker pretending to be a real Italian VC drained at least 5 founders' Bitcoin via a single 'open in app' message.",
    category: "Social engineering",
    severity: "critical",
    sources: [
      "https://www.linkedin.com/in/alessio-oriolo/",
      "https://attack.mitre.org/campaigns/C0022/",
      "https://blog.sekoia.io/clickfake-interview-campaign-by-lazarus/",
      "https://thehackernews.com/2025/04/north-korean-hackers-spread-malware-via.html",
      "https://crypto.news/thorchain-co-founder-loses-1-3m-to-north-korean-zoom-scam/",
    ],
    links: [
      "https://mempool.space/address/bc1q704czv9hyce6fg2m9s6c097hg3hue2tzpqwngz",
      "https://mempool.space/address/bc1q234du9sa0ugjkrj4pmhuujzu5cqx9eh7aqf3p9",
    ],
  },
  {
    file: "drafts/pink-drainer-niftydegen-expose-v0.md",
    headline:
      "A vanity-contract NFT drainer stole one founder's 2.4 ETH PFP in 12 seconds via Blur.io — and hit 99 other victims using the same infrastructure",
    dek: "Inside an 18-month-old NiftyDegen PFP, signed away via Blur.io to a Scam Sniffer-flagged phishing address that aggregated drains from at least 99 wallets across late 2023 / early 2024.",
    category: "NFT phishing drainer",
    severity: "high",
    sources: [
      "https://etherscan.io/address/0x0000db5c8b030ae20308ac975898e09741e70000",
      "https://etherscan.io/address/0x29488e5fd6bf9b3cc98a9d06a25204947cccbe4d",
      "https://opensea.io/item/ethereum/0x986aea67c7d6a15036e18678065eb663fc5be883/5504",
      "https://cointelegraph.com/news/cypto-drainers-pink-pussy-venom-and-inferno-steal-millions",
      "https://protos.com/pink-drainer-steps-back-from-the-grind-after-stealing-75m-from-victims/",
      "https://www.cryptotimes.io/2024/07/03/user-loses-240000-in-nfts-to-blur-marketplace-hack/",
      "https://cryptopotato.com/pink-drainer-hackers-drain-4-4-million-in-link/",
    ],
    links: [
      "https://etherscan.io/address/0x557896aa3e0d98268ace847576273d5575c24ee6",
    ],
  },
];

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

async function ship(spec: ArticleSpec) {
  const body = loadBody(spec.file);

  const payload: IntelPayload = {
    headline: spec.headline,
    dek: spec.dek,
    body,
    bodyFormat: "markdown",
    kind: "original",
    category: spec.category,
    severity: spec.severity,
    sourceGrade: "primary",
    anonymous: true,
    personas: ["founder", "developer", "investor", "investigator", "journalist"],
    sources: spec.sources,
    links: spec.links,
    spicy: spec.spicy,
  };

  const now = new Date();

  const existing = await db
    .select({ id: submissions.id, publicId: submissions.publicId })
    .from(submissions)
    .where(eq(sql`${submissions.payload}->>'headline'`, spec.headline))
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
  console.log();
}

async function main() {
  console.log(`Shipping ${ARTICLES.length} investigative pieces — featured + approved at top of /intel...\n`);
  for (const article of ARTICLES) {
    console.log(`=== ${article.headline.slice(0, 80)}... ===`);
    await ship(article);
  }
  console.log(`Done. All three are now featured at the top of /intel.`);
  console.log(`(Casper hackathon exposé already featured from prior seed run.)`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
