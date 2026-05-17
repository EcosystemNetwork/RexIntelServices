/**
 * Run with: npx tsx scripts/seed-fellowships.ts
 *
 * Seeds funded fellowships into /intel?lane=fellowships. Distinct from
 * accelerators (no equity, stipend-funded), grants (structured cohort +
 * mentorship, not just money), and residencies (program for non-founders
 * too — researchers, PhDs, early-career engineers).
 *
 * Mix of crypto-protocol fellowships (EPF, Next Billion, MEV Research,
 * Stellar Community Fellowship), AI / frontier research (Anthropic Fellows,
 * Schmidt AI2050), and the canonical generalist programs (Thiel, Interact,
 * Emergent Ventures).
 *
 * Note: several fellowships already exist in other lanes (accelerators
 * for Orange DAO / Paradigm / Neo; ambassadors for EPF, Next Billion,
 * Hugging Face, OpenZeppelin; capital for SPC Founder Fellowship;
 * residencies for HF0 / Pioneer; jobs for Anthropic Fellows). This seed
 * does NOT touch those — Eric to decide whether to migrate them.
 *
 * Idempotent: name-match upsert.
 */
import "dotenv/config";
import { and, eq, sql } from "drizzle-orm";
import { db, submissions } from "../src/lib/db";
import type { FellowshipPayload } from "../src/lib/db/schema";

const fellowships: FellowshipPayload[] = [
  {
    name: "Thiel Fellowship",
    organization: "Thiel Foundation",
    organizationUrl: "https://thielfellowship.org/",
    description:
      "Two-year fellowship for builders under 23 who want to skip or leave college to start companies or pursue independent projects. $200,000 stipend, no equity. Founded 2011 by Peter Thiel; alumni include Vitalik Buterin, Austin Russell, Laura Deming, and Ritesh Agarwal.",
    stipend: "$200,000 over 2 years (no equity)",
    duration: "2 years",
    eligibility: "Under 23 years old. Open globally. Must be willing to leave or postpone college during the fellowship.",
    location: "San Francisco preferred (community + events)",
    focus: "Generalist — founders + independent researchers",
    applyUrl: "https://thielfellowship.org/apply",
    rolling: false,
    cadence: "Annual (one cohort per year)",
    tags: ["thiel", "under-23", "drop-out", "generalist", "founders"],
  },
  {
    name: "Anthropic Fellows",
    organization: "Anthropic",
    organizationUrl: "https://www.anthropic.com/fellows-program",
    description:
      "4-month full-time research fellowship with mentorship from senior Anthropic researchers. Five workstreams: AI Safety, AI Security, ML Systems & Performance, Reinforcement Learning, and Economics & Policy. Expected output is a public research artifact (typically a paper). Python fluency + strong CS/math/physics background; no prior research experience required.",
    stipend: "Competitive (covers full-time work)",
    duration: "4 months full-time",
    eligibility: "Python fluency + strong CS/math/physics/econ background. No prior research experience required. Open globally.",
    location: "Remote + Bay Area visits",
    focus: "AI safety, AI security, ML systems, RL, economics + policy",
    applyUrl: "https://www.anthropic.com/fellows-program",
    rolling: false,
    cadence: "Multiple cohorts per year",
    tags: ["ai-safety", "anthropic", "research", "ml", "rl"],
  },
  {
    name: "Schmidt Sciences AI2050 Fellows",
    organization: "Schmidt Sciences",
    organizationUrl: "https://ai2050.schmidtsciences.org/",
    description:
      "AI2050 funds researchers tackling the hardest problems in AI to ensure a beneficial-to-humanity AI future by 2050. Two tracks: Senior Fellows (mid-to-late-career, larger awards over 3 years) and Early Career Fellows (within first 9 years post-PhD, 2-year awards). Funded by Eric & Wendy Schmidt.",
    stipend: "Senior: up to $300k/year × 3 yrs; Early Career: $300k total over 2 yrs",
    duration: "Senior: 3 years; Early Career: 2 years",
    eligibility: "Senior Fellows: mid-to-late-career faculty / researchers. Early Career: within 9 years of PhD. Affiliation with research institution required.",
    location: "Worldwide (researcher's home institution)",
    focus: "AI safety, beneficial AI, hard problems in AI",
    applyUrl: "https://ai2050.schmidtsciences.org/",
    rolling: false,
    cadence: "Annual",
    tags: ["ai-safety", "schmidt", "research", "academia", "phd"],
  },
  {
    name: "Interact Fellowship",
    organization: "Interact",
    organizationUrl: "https://interact.org/",
    description:
      "Community of mission-driven technologists in the Bay Area. Annual fellowship cohort of ~25 selected from thousands of applicants — engineers, founders, researchers, designers united by intellectual curiosity and ambition. Year-long programming: dinners, retreats, mentorship. Alumni network spans top startups, frontier labs, and research orgs.",
    duration: "1-year fellowship + lifelong community",
    eligibility: "Mission-driven technologists, broadly defined. Bay Area preferred but not strictly required. Open to engineers, founders, researchers, designers, policy thinkers.",
    location: "San Francisco Bay Area",
    focus: "Generalist — frontier technologists",
    applyUrl: "https://interact.org/apply",
    rolling: false,
    cadence: "Annual",
    tags: ["interact", "bay-area", "community", "generalist"],
  },
  {
    name: "Emergent Ventures Fellowship",
    organization: "Mercatus Center / Tyler Cowen",
    organizationUrl: "https://www.mercatus.org/emergent-ventures",
    description:
      "Fellowships and grants for entrepreneurs, scholars, and creators pursuing transformative projects. Run by Tyler Cowen at the Mercatus Center, George Mason University. Bias toward unusual, high-variance bets often passed over by conventional funders. Rolling application — short form, fast turnaround.",
    stipend: "Grants typically $10k–$100k; some larger fellowships",
    eligibility: "Open globally. Strong preference for projects with unusual upside that conventional funders would skip. No academic affiliation required.",
    location: "Worldwide",
    focus: "Generalist — transformative ideas across science, tech, policy, the arts",
    applyUrl: "https://www.mercatus.org/emergent-ventures/apply",
    rolling: true,
    cadence: "Rolling (continuous)",
    tags: ["emergent-ventures", "tyler-cowen", "high-variance", "generalist", "global"],
  },
  {
    name: "MEV Research Fellowship",
    organization: "Flashbots",
    organizationUrl: "https://www.flashbots.net/",
    description:
      "Research fellowship for engineers and researchers working on MEV (maximal extractable value), block-building, sequencing markets, and adjacent topics. Hosted by Flashbots — the leading MEV research org. Fellows produce open-source artifacts: papers, simulations, tooling. Strong fit for grad students and applied researchers already publishing in the space.",
    stipend: "Competitive research stipend",
    duration: "Typically 3–6 months",
    eligibility: "Demonstrated interest + output in MEV / mechanism design / market microstructure. Open globally. Grad students and post-grads especially welcome.",
    location: "Remote",
    focus: "MEV, block-building, sequencing, mechanism design",
    applyUrl: "https://collective.flashbots.net/c/research",
    rolling: true,
    cadence: "Rolling",
    tags: ["mev", "flashbots", "research", "ethereum", "mechanism-design"],
  },
  {
    name: "Stellar Community Fellowship",
    organization: "Stellar Development Foundation",
    organizationUrl: "https://communityfund.stellar.org/",
    description:
      "Stellar's funded program for community leaders, developers, and organizers building on Stellar and Soroban. Funds open-source projects, regional meetups, educational content, and ecosystem tooling. Distinct from the SDF grants program — Community Fellows commit to ongoing ecosystem leadership rather than one-off deliverables.",
    stipend: "Variable per project",
    eligibility: "Active Stellar / Soroban builders and community organizers. Open globally.",
    location: "Worldwide",
    focus: "Stellar + Soroban ecosystem development",
    applyUrl: "https://communityfund.stellar.org/",
    rolling: true,
    cadence: "Rolling",
    tags: ["stellar", "soroban", "community", "ecosystem"],
  },
  {
    name: "Filecoin Green Fellowship",
    organization: "Filecoin Foundation",
    organizationUrl: "https://green.filecoin.io/",
    description:
      "Research fellowship for engineers and scientists working on Filecoin's environmental footprint — energy use measurement, renewable-powered storage, carbon accounting protocols. Output: open-source tooling and public research. Funded by the Filecoin Foundation as part of the Green Filecoin initiative.",
    eligibility: "Background in environmental science, energy systems, distributed systems, or carbon accounting. Filecoin domain knowledge a plus but not required.",
    location: "Remote",
    focus: "Sustainability, energy measurement, carbon accounting on Filecoin",
    applyUrl: "https://green.filecoin.io/",
    rolling: true,
    cadence: "Rolling",
    tags: ["filecoin", "sustainability", "energy", "carbon", "research"],
  },
  {
    name: "Recurse Center",
    organization: "Recurse Center",
    organizationUrl: "https://www.recurse.com/",
    description:
      "Self-directed, project-based educational retreat for programmers in NYC. Not called a fellowship, but functions as one: 6 or 12 weeks of free, mentor-light, peer-driven time to become a better programmer. Free to attend; financial-need grants available for living costs. Famous for the 'no feigning surprise' social rules and emphasis on intrinsic motivation.",
    stipend: "Free attendance + need-based grants for living costs",
    duration: "6 or 12 weeks",
    eligibility: "Programmers at any level who want to get dramatically better. No degree, age, or background requirements. Application + interview process.",
    location: "Brooklyn, NY (in-person) + remote option",
    focus: "Self-directed programming education",
    applyUrl: "https://www.recurse.com/apply",
    rolling: true,
    cadence: "Rolling (continuous batches)",
    tags: ["recurse-center", "programming", "self-directed", "nyc", "remote"],
  },
  {
    name: "a16z Crypto Research Fellowship",
    organization: "a16z crypto",
    organizationUrl: "https://a16zcrypto.com/research/",
    description:
      "Funded research fellowship for academics and graduate students working on crypto / web3 topics — cryptography, distributed systems, mechanism design, economics. Output: open publications. Mentorship from a16z crypto's research team (Tim Roughgarden, Ali Yahya, Joachim Neu, and others). Distinct from the CSX accelerator (which is for founders).",
    stipend: "Competitive academic stipend",
    eligibility: "Graduate students and academic researchers. Strong publication record in adjacent fields preferred.",
    location: "Remote + travel for events",
    focus: "Crypto research — cryptography, distributed systems, mechanism design",
    applyUrl: "https://a16zcrypto.com/research/",
    rolling: false,
    cadence: "Annual",
    tags: ["a16z", "crypto", "research", "academic", "phd"],
  },
];

async function upsert(payload: FellowshipPayload) {
  const existing = await db
    .select({ id: submissions.id, publicId: submissions.publicId })
    .from(submissions)
    .where(
      and(
        eq(submissions.type, "fellowship"),
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
      type: "fellowship",
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
  for (const f of fellowships) {
    const r = await upsert(f);
    if (r.action === "inserted") inserted++;
    else updated++;
    console.log(`  ${r.action.padEnd(8)} /fellowships/${r.publicId}  ${f.name}`);
  }
  console.log(
    `\n✓ ${fellowships.length} fellowships processed (${inserted} new, ${updated} updated).`,
  );
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
