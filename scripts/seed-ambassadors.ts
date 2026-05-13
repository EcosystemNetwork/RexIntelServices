/**
 * Run with: npx tsx scripts/seed-ambassadors.ts
 *
 * Seeds ambassador / champion / fellow programs run by platforms and
 * protocols — community programs (vs. capital-bearing accelerators) where
 * the value exchange is recognition, credits, early access, and direct
 * lines to the product team in return for organizing, evangelism, and
 * feedback. Surfaced under /accelerators for now (DB type: "accelerator");
 * filed in a separate seed for editability and future split into its own
 * surface if the category grows.
 *
 * Idempotent: name-match upsert.
 */
import "dotenv/config";
import { and, eq, sql } from "drizzle-orm";
import { db, submissions } from "../src/lib/db";
import type { AcceleratorPayload } from "../src/lib/db/schema";

const ambassadors: AcceleratorPayload[] = [
  {
    name: "OpenAI Codex Ambassadors",
    organization: "OpenAI",
    organizationUrl: "https://developers.openai.com/community/codex-ambassadors",
    description:
      "Application-gated community program for builders who run meetups, maintain open-source projects, teach workshops, or help others ship with Codex. Ambassadors organize local hands-on events, build reusable learning kits, test community-growth ideas, and feed real-world usage feedback directly to the Codex team. ~2–4 hours per week. Perks include Codex + API credits, pre-built starter kits, direct access to the Codex team and fellow ambassadors, invitations to exclusive OpenAI events, an honorarium, and branded merch.",
    duration: "Ongoing (~2–4 hrs/week)",
    investment:
      "Non-dilutive — Codex + API credits, starter kits, exclusive event invites, honorarium, and branded merch",
    location: "Global (remote-first; local in-person events)",
    focus: "Developer-community organizers, OSS maintainers, student leaders, and Codex power users",
    applyUrl: "https://developers.openai.com/community/codex-ambassadors",
    rolling: true,
    tags: ["ambassador", "openai", "codex", "developer-community", "ai"],
  },
  {
    name: "Microsoft Learn Student Ambassadors",
    organization: "Microsoft",
    organizationUrl: "https://studentambassadors.com",
    description:
      "Open-door global program for current students — no application required. Build practical skills with Microsoft technology, host events, and grow local communities. \"Rotations\" provide short immersive stints with real Microsoft product teams — deep dives, feedback sessions, and behind-the-scenes exposure that translate into resume- and LinkedIn-grade stories. Adjacent programs: Imagine Cup (student startup competition), Campus Experts, AI Skills Navigator, Microsoft Careers.",
    location: "Global (remote-first)",
    focus: "Current students of any background — career-building + community organizing around Microsoft tech",
    applyUrl: "https://studentambassadors.com",
    rolling: true,
    tags: ["ambassador", "microsoft", "students", "community", "career"],
  },
  {
    name: "GitHub Stars",
    organization: "GitHub",
    organizationUrl: "https://stars.github.com/",
    description:
      "Recognition program for outstanding open-source contributors who inspire and educate their communities. Stars get amplification from GitHub, an opportunity to showcase their work to a wider audience, and a line into shaping the future of the platform. Entry is nomination-based — not direct application. Featured Stars are spotlighted on the program homepage and at GitHub events.",
    location: "Global (remote)",
    focus: "Open-source maintainers, educators, and developer-community leaders",
    applyUrl: "https://stars.github.com/nominate/",
    rolling: true,
    tags: ["ambassador", "github", "open-source", "community", "nomination"],
  },
  {
    name: "Google Developer Experts (GDE)",
    organization: "Google",
    organizationUrl: "https://developers.google.com/community/experts",
    description:
      "Global network of 1,000+ recognized technologists across Android, Google Cloud, Machine Learning, Web, and other Google technology areas. GDEs speak at events, publish content, mentor other developers, and get early access to new Google products plus invitations to Google events. Entry is by referral only — applicants must be nominated by a Google employee or existing GDE. Requires 18+, English fluency, demonstrated community contributions, and deep expertise in a Google technology area.",
    location: "Global (remote)",
    focus: "Senior practitioners with deep Google-tech expertise + significant community contributions",
    applyUrl: "https://developers.google.com/community/experts",
    rolling: true,
    tags: ["ambassador", "google", "experts", "ai", "cloud", "android", "web", "referral"],
  },
  {
    name: "Superteam — Solana",
    organization: "Superteam",
    organizationUrl: "https://superteam.fun/",
    description:
      "Solana-aligned global community connecting crypto talent with bounties, freelance projects, grants, and hackathons. Superteam Earn has paid out millions across 182k+ contributors via short-term bounties from crypto companies — content, design, development, and more. Sponsor / ambassador tiers exist for those running regional chapters (India, SEA, LATAM, MENA, Vietnam, Türkiye, Germany, UAE, and others). Dedicated AI-agent listings. Strong proxy for measuring active builder demand on Solana.",
    location: "Global, with active regional chapters across India, SEA, LATAM, MENA, EU, and the Gulf",
    focus: "Crypto-native designers, developers, writers, founders, marketers, and operators",
    applyUrl: "https://earn.superteam.fun/",
    rolling: true,
    tags: ["ambassador", "solana", "superteam", "bounties", "crypto", "community"],
  },
  {
    name: "MongoDB Champions",
    organization: "MongoDB",
    organizationUrl: "https://www.mongodb.com/community/champions",
    description:
      "Selective recognition for community leaders with advanced MongoDB expertise who teach via talks, blogs, videos, user groups, forum answers, and social. Champions get exclusive access to MongoDB executives and product roadmaps, preview programs, an annual Champions Summit, reserved speaking slots, and coaching in public speaking, writing, and social media. Entry is nomination-only — by MongoDB employees, current Champions, or program alumni. The MongoDB Creators Program is the application-based on-ramp toward eventual Champion consideration.",
    location: "Global (remote)",
    focus: "MongoDB community leaders — speakers, writers, user-group organizers, forum experts",
    applyUrl: "https://www.mongodb.com/community/creators",
    rolling: true,
    tags: ["ambassador", "mongodb", "database", "experts", "nomination"],
  },
  {
    name: "Twilio Champions",
    organization: "Twilio",
    organizationUrl: "https://www.twilio.com/en-us/champions",
    description:
      "Recognition program for developer-community leaders who build with Twilio and inspire others — by speaking, creating technical content, helping in forums, and joining product feedback sessions. Champions get access to exclusive virtual and in-person developer events, dedicated comms channels with Twilio teams, speaking/collaboration/networking opportunities, presentation and demo resources, and branded merch. Waitlist application; requires 18+, English fluency, and demonstrated Twilio expertise plus community contribution.",
    location: "Global (remote)",
    focus: "Developer-community leaders with deep Twilio product expertise",
    applyUrl: "https://www.twilio.com/en-us/champions",
    rolling: true,
    tags: ["ambassador", "twilio", "developer-community", "communications"],
  },
];

async function upsert(payload: AcceleratorPayload) {
  const existing = await db
    .select({ id: submissions.id, publicId: submissions.publicId })
    .from(submissions)
    .where(
      and(
        eq(submissions.type, "accelerator"),
        sql`${submissions.payload}->>'name' = ${payload.name}`,
      ),
    )
    .limit(1);

  if (existing.length > 0) {
    const [row] = await db
      .update(submissions)
      .set({
        payload,
        status: "approved",
        publishedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(submissions.id, existing[0].id))
      .returning({ publicId: submissions.publicId });
    return { action: "updated" as const, publicId: row.publicId };
  }
  const [row] = await db
    .insert(submissions)
    .values({
      type: "accelerator",
      status: "approved",
      payload,
      publishedAt: new Date(),
    })
    .returning({ publicId: submissions.publicId });
  return { action: "inserted" as const, publicId: row.publicId };
}

async function main() {
  let inserted = 0;
  let updated = 0;
  for (const a of ambassadors) {
    const r = await upsert(a);
    if (r.action === "inserted") inserted++;
    else updated++;
    console.log(`  ${r.action.padEnd(8)} /accelerators/${r.publicId}  ${a.name}`);
  }
  console.log(
    `\n✓ ${ambassadors.length} ambassadors processed (${inserted} new, ${updated} updated).`,
  );
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
