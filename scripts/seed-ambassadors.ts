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
  {
    name: "Polkadot Ambassador Program",
    organization: "Polkadot / Web3 Foundation",
    organizationUrl: "https://polkadot.com/",
    description:
      "Long-running rank-based community program (launched 2019), restructuring into the Polkadot Ambassador Fellowship — an on-chain collective with formal tiers (Head Ambassadors, Senior Ambassadors, Ambassadors) and active regional chapters (LATAM, Hispanic, and others). Ambassadors translate docs, run tutorials and meetups, and steward regional adoption. Compensation flows through treasury proposals; Head Ambassadors receive ongoing stipends. Selection happens via forum proposals and on-chain governance; major 2024 reform efforts ('Project Phoenix') are ongoing.",
    location: "Global with active regional chapters (LATAM, Hispanic, and others)",
    focus: "Web3 community organizers, translators, educators, and regional leads in the Polkadot ecosystem",
    applyUrl: "https://forum.polkadot.network/c/ambassador-programme/30",
    rolling: true,
    tags: ["ambassador", "polkadot", "web3", "on-chain-governance", "treasury"],
  },
  {
    name: "Ethereum Foundation PhD Fellowship",
    organization: "Ethereum Foundation",
    organizationUrl: "https://esp.ethereum.foundation/",
    description:
      "Annual academic fellowship for PhD students pursuing research relevant to Ethereum — economics, political science, business, public policy, computer science, urban planning, sociology. 9–10 fellowships per cohort with a $24,000 USD stipend over one year, supplemental to existing PhD funding. Research output must be open-access under a free, permissive license. 2026 application window ran Feb 2 → Apr 22; next round expected annually. Outside the named window, applicants can pursue the standard ESP applications portal.",
    duration: "1 year (per cohort)",
    investment: "$24,000 USD stipend (supplemental, non-dilutive)",
    location: "Remote — open to PhD students at any university worldwide",
    focus: "Academic researchers across CS, economics, governance, and social sciences working on Ethereum-relevant problems",
    applyUrl: "https://esp.ethereum.foundation/rounds/phdfp26",
    rolling: false,
    tags: ["fellowship", "ethereum", "phd", "academic", "research"],
  },
  {
    name: "Ethereum Next Billion Fellowship",
    organization: "Ethereum Foundation",
    organizationUrl: "https://nxbn.ethereum.foundation/",
    description:
      "6-month fellowship for projects expanding Ethereum's reach to underrepresented populations — apps, research, or organizational initiatives. Bespoke mentorship from domain experts plus stipends to free up time (rarely grants). Explicitly not an incubator or accelerator. Past fellows have come from South Africa, Venezuela, Croatia, Greece, France, Taiwan, and the UK. Preference for projects already underway, not pre-launch concepts.",
    duration: "6 months (per cohort)",
    investment: "Stipend + mentorship; rarely grants. Non-dilutive.",
    location: "Global, with emerging-markets emphasis",
    focus: "Builders driving Ethereum adoption in underrepresented regions and populations",
    applyUrl: "https://nxbn.ethereum.foundation/fellowship",
    rolling: false,
    tags: ["fellowship", "ethereum", "global-south", "emerging-markets", "adoption"],
  },
  {
    name: "Ethereum Protocol Fellowship (EPF)",
    organization: "Ethereum Foundation — Protocol Support Team",
    organizationUrl: "https://epf.wiki/",
    description:
      "5-month paid fellowship for developers contributing to the core Ethereum protocol — explicitly not smart contracts or app development. Fellows work with the Protocol Support Team on a self-chosen project (client implementations, EIPs, research, tooling). Mentorship from core developers via weekly group calls, AMAs, and optional in-person meetups. Individualized stipend per applicant — some funded at start, others extended funding as the program progresses. Selection favors strong open-source contribution history and existing Ethereum ecosystem signals.",
    duration: "5 months (per cohort)",
    investment: "Individualized monthly stipend (varies per fellow)",
    location: "Remote",
    focus: "Self-directed engineers contributing to Ethereum's core protocol — clients, EIPs, research, tooling",
    applyUrl: "https://epf.wiki/",
    rolling: false,
    tags: ["fellowship", "ethereum", "protocol", "core-dev", "open-source"],
  },
  {
    name: "Hugging Face Fellowship",
    organization: "Hugging Face",
    organizationUrl: "https://huggingface.co/blog/fellowship",
    description:
      "Nomination-only network for exceptional contributors to the open-source ML ecosystem. Fellows are nominated by Hugging Face team members or existing Fellows — no direct application. Customized perks include compute resources, merchandise, and official recognition. Volunteer (not employee) role that can lead to employment opportunities. Best path in: contribute models and datasets to the Hub, lead working groups (ML4Audio, Keras, etc.), run language-specific sprints, write tutorials, and engage on the HF Discord. Students should pursue the HF Student Ambassador track instead.",
    location: "Global (remote)",
    focus: "Open-source ML practitioners — model authors, working-group leads, educators, community organizers",
    applyUrl: "https://huggingface.co/blog/fellowship",
    rolling: true,
    tags: ["ambassador", "fellowship", "ai", "ml", "huggingface", "open-source", "nomination"],
  },
  {
    name: "Moonbeam Ambassador Program",
    organization: "Moonbeam Network",
    organizationUrl: "https://moonbeam.network/community/ambassador/",
    description:
      "Community program for advocates of Moonbeam's multi-chain EVM smart-contract platform on Polkadot. Ambassadors create blogs/guides/tutorials, organize meetups and webinars, support the community in forums, and serve as regional representatives. Three-step path: Engage (express passion) → Contribute (demonstrate commitment) → Elevate (ambassador status). Perks are framed as recognition and exclusive access — no fixed compensation disclosed.",
    location: "Global with regional representation",
    focus: "Multi-chain / EVM-on-Polkadot advocates — content creators, meetup hosts, community supporters",
    applyUrl: "https://moonbeam.network/community/ambassador/apply/",
    rolling: true,
    tags: ["ambassador", "moonbeam", "polkadot", "evm", "multi-chain"],
  },
  {
    name: "Solana U",
    organization: "Solana Foundation",
    organizationUrl: "https://solanau.org/",
    description:
      "Solana Foundation program for university students, professors, and academics. Ambassadors get a direct line to Solana Foundation staff and core engineers — they build launch strategies for their school or blockchain club, get educational materials and speakers, and join workshops, hackathons, and project accelerators. Perks include the Breakpoint Global Fellows Program (funded attendance at Solana's annual conference) and access to a 1,000+ student Discord. 300+ students from 5 continents already participating (Michigan, Berkeley, Belgrade, Seoul, London, and others).",
    location: "Global — university-based, with active campuses across 5 continents",
    focus: "University students, professors, and blockchain-club leaders — Rust, Solana dev, on-campus organizing",
    applyUrl: "https://solanafoundation.typeform.com/to/VTeYWYX9",
    rolling: true,
    tags: ["ambassador", "solana", "students", "university", "crypto"],
  },
  {
    name: "Starknet Ambassadors",
    organization: "Starknet Foundation",
    organizationUrl: "https://www.starknet.io/ambassadors-program/",
    description:
      "Educational initiative for Web3 educators who mentor newcomers through hackathons, coding bootcamps, and in-person meetups in the Starknet / STARK-proofs ecosystem. Purely educational — separate from official network governance. New applicants are encouraged to complete Starknet Basecamp first to demonstrate prerequisite knowledge, then surface through an existing ambassador.",
    location: "Global (regional meetups)",
    focus: "Web3 educators and bootcamp / hackathon mentors in the ZK / Starknet ecosystem",
    applyUrl: "https://tinyurl.com/snf-ambassador-program",
    rolling: true,
    tags: ["ambassador", "starknet", "zk", "ethereum-l2", "education"],
  },
  {
    name: "LangChain Ambassadors + Community Champions",
    organization: "LangChain",
    organizationUrl: "https://www.langchain.com/community",
    description:
      "Two complementary programs. Community Champions recognizes top open-source contributors to LangChain's frameworks (3,500+ contributors total) — perks include direct team access, roadmap influence, priority code reviews, and merch. Ambassadors (40+ across six continents) are highly engaged community members who host meetups, lead community groups, and create educational content — perks include early product access, event sponsorship grants, and complimentary LangSmith access. Path into Champions: contribute to LangChain OSS. Path into Ambassadors: surface through community work.",
    location: "Global — 40+ ambassadors across six continents",
    focus: "OSS contributors to LangChain frameworks (Champions) or meetup hosts / educators in agentic AI (Ambassadors)",
    applyUrl: "https://www.langchain.com/community",
    rolling: true,
    tags: ["ambassador", "langchain", "ai", "agents", "open-source"],
  },
  {
    name: "PayPal Developer Community Champions",
    organization: "PayPal",
    organizationUrl: "https://developer.paypal.com/community/champions/",
    description:
      "Global community of technical experts who advocate for PayPal. Champions commit to annual contribution in at least two of: technical content creation (articles, videos, tutorials), social outreach, community support (forums, GitHub), event participation, customer success stories, and product-feedback beta programs / advisory councils. Perks include Champions-gallery profile, networking and PayPal event invites, branded merch, expert collaboration with product/engineering, and early access. Application is by emailing the program team — no public form.",
    location: "Global (remote)",
    focus: "Payments / fintech developers with deep PayPal expertise and a track record of community contribution",
    applyUrl: "https://developer.paypal.com/community/champions/",
    rolling: true,
    tags: ["ambassador", "paypal", "fintech", "payments", "developer-community"],
  },
  {
    name: "Supabase SupaSquad",
    organization: "Supabase",
    organizationUrl: "https://supabase.com/open-source/contributing/supasquad",
    description:
      "Advocate program with four contribution tracks: Contributors (answer questions, improve docs, moderate community), Content Creators (videos, blogs, tutorials), Trusted Hosts (organize local Supabase meetups), Event Speakers (present at conferences). Perks include Discord badges and Reddit flair, early access to new features, direct comms with the Supabase team, exclusive partner discounts, members-only merch, and a documented path from volunteer to paid Supabase role.",
    location: "Global (remote)",
    focus: "Open-source / Postgres / dev-tools community members across content, support, and events",
    applyUrl: "https://supabase.notion.site/2ce5004b775f80a38acdc3ca5df7b9d3",
    rolling: true,
    tags: ["ambassador", "supabase", "postgres", "open-source", "developer-community"],
  },
  {
    name: "Cloudflare Developer Expert Program",
    organization: "Cloudflare",
    organizationUrl: "https://www.cloudflare.com/developer-expert-program/",
    description:
      "Launched November 2021 for power users building on the Cloudflare developer platform — Workers, Pages, and adjacent tools. Experts get early access to private betas and unreleased features, admission to a community of fellow power users, regular calls with PMs and engineers, sponsorships for open-source work, and premium swag. Selection prioritizes developers with production deployment experience plus active feedback and evangelism.",
    location: "Global (remote)",
    focus: "Power users shipping production workloads on Cloudflare Workers, Pages, and the developer platform",
    applyUrl: "https://www.cloudflare.com/developer-expert-program/",
    rolling: true,
    tags: ["ambassador", "cloudflare", "workers", "pages", "developer-platform", "edge"],
  },
  {
    name: "Women Techmakers",
    organization: "Technovation (formerly hosted by Google)",
    organizationUrl: "https://www.technovation.org/women-techmakers/",
    description:
      "Global ecosystem advocating for gender diversity in tech — recently transitioned from Google to Technovation. 160+ countries represented. Ambassadors host regional events, mentor participants, and lead community initiatives. 2026 perks include a free Oxford Saïd Business School AI Leadership Certificate, access to 1,000+ industry partners via the AI Forward Alliance, 12-week AI Accelerator programs, Kaggle competitions, and International Women's Day global events. New ambassador applications open Spring 2026.",
    location: "Global — 160+ countries with regional event leads",
    focus: "Women technologists — mentors, regional event leads, AI / entrepreneurship educators",
    applyUrl: "https://www.technovation.org/women-techmakers/",
    rolling: true,
    tags: ["ambassador", "women-in-tech", "technovation", "ai", "mentorship", "global"],
  },
  {
    name: "Claude Community Ambassadors",
    organization: "Anthropic",
    organizationUrl: "https://claude.com/community/ambassadors",
    description:
      "Anthropic's program for local leaders building Claude communities in their cities. Open to non-developers too — selection criteria are meaningful experience with Claude Code or Claude Cowork, a track record of community involvement, and genuine enthusiasm for Anthropic's mission. Ambassadors host meetups, workshops, hackathons, and demos, and bring community insight back to Anthropic's product teams. Perks: event sponsorship and funding, monthly API credits, pre-release feature access, Builders Council seats, swag, and a private ambassador Slack. Application is online form → screening interview → signed Ambassador Agreement. Rolling intake.",
    location: "Global — multiple ambassadors per city allowed",
    focus: "Local AI community organizers and Claude power users",
    applyUrl: "https://claude.com/community/ambassadors",
    rolling: true,
    tags: ["ambassador", "anthropic", "claude", "ai", "community"],
  },
  {
    name: "Claude Campus Program",
    organization: "Anthropic",
    organizationUrl: "https://claude.com/programs/campus",
    description:
      "Student-driven AI program from Anthropic, including the Claude Builder Club track for student leaders organizing campus AI communities. Members collaborate with Anthropic to set up campus AI orgs, run technical and non-technical workshops with Anthropic speakers, host hackathons and demo nights, and distribute API credits to club members. Perks include direct collaboration with Anthropic's research, product, and education teams, networking with AI-focused student peers, product-roadmap input, and a paid program stipend. Runs in Spring / Fall cohorts; Spring 2026 is in session and applications are closed for that round — next intake expected next cohort.",
    duration: "1 semester (per cohort)",
    investment: "Paid program stipend + API credits for the campus club",
    location: "Global (campus-based)",
    focus: "Student leaders organizing campus AI communities around Claude",
    applyUrl: "https://claude.com/programs/campus",
    rolling: false,
    tags: ["ambassador", "anthropic", "claude", "ai", "students", "campus"],
  },
  {
    name: "OpenZeppelin Blockchain Security Fellowship",
    organization: "OpenZeppelin",
    organizationUrl: "https://learn.openzeppelin.com/openzeppelin-fellowship-program-4",
    description:
      "3-month intensive fellowship training participants as full-time Blockchain Security Researchers. Fellows work alongside OpenZeppelin's research team on real client-facing audit projects, with access to OpenZeppelin's internal learning library and direct mentorship from world-class security experts. Past cohorts have converted into permanent hires. Post-program paths: zero-knowledge research, Ethernaut development, security audit tooling. Applications encouraged from underrepresented communities. Multiple cohorts per year — current iteration is the fourth.",
    duration: "3 months (per cohort)",
    investment: "Hands-on auditing experience + path to full-time hire; specific stipend not disclosed",
    location: "Remote",
    focus: "Aspiring blockchain security researchers — smart-contract audits, ZK research, audit tooling",
    applyUrl: "https://learn.openzeppelin.com/openzeppelin-fellowship-program-4",
    rolling: false,
    tags: ["fellowship", "openzeppelin", "security", "audits", "blockchain", "smart-contracts"],
  },
  {
    name: "Code4rena Wardens",
    organization: "Code4rena",
    organizationUrl: "https://code4rena.com/",
    description:
      "Competitive smart-contract audit platform. Wardens are independent security researchers who compete in time-boxed audits (typically 2–4 weeks) on EVM, Solana, Rust, and Solidity codebases. Prize pools range from $4,000 to $500,000+ in USDC, distributed among wardens based on findings and judging. Open registration — no formal eligibility gate, but the bar to win is technical. Acquired by Zellic in 2024 but operates independently. Strong proxy for active smart-contract security talent.",
    location: "Global, fully remote — runs through Discord and the Code4rena platform",
    focus: "Independent smart-contract auditors / security researchers competing for audit prize pools",
    applyUrl: "https://code4rena.com/register/account",
    rolling: true,
    tags: ["audit-competition", "security", "smart-contracts", "evm", "solana", "wardens"],
  },
  {
    name: "Docker Captains",
    organization: "Docker",
    organizationUrl: "https://www.docker.com/community/captains/",
    description:
      "Recognition program for Docker technical experts and community builders. Three application categories: Docker Advisor (endorsed by Docker engineering or product), Docker Thought Leader (5,000+ monthly views across blogs/social), Docker Community Contributor (5+ years community leadership). 1-year term with annual renewal based on continued contribution. Perks include featured-expert visibility, beta access to Docker products, direct comms with Docker staff, Docker swag + partner discounts, private Captains Slack, annual in-person offsites, and an education budget for Docker-related training. Self-apply or be nominated. Underrepresented-group applicants and regions of strategic interest get special consideration.",
    duration: "1 year (renewable annually)",
    location: "Global (open internationally)",
    focus: "Docker / container technical experts with audience reach or deep community involvement",
    applyUrl: "https://app.advocu.com/dockercaptains/join",
    rolling: true,
    tags: ["ambassador", "docker", "containers", "developer-community", "devops"],
  },
  {
    name: "TON Ambassadors",
    organization: "TON Foundation / TON Society",
    organizationUrl: "https://society.ton.org/",
    description:
      "TON Society's volunteer ambassador program — open to anyone passionate about crypto, regardless of skill level. Ambassadors promote TON adoption, host events, and plug into the broader TON Society ecosystem (TON Breakfasts, chat-activist roles, TON Accelerator mentorship, TON Syndicate). Successful applicants are added to a dedicated Telegram group and unlock exclusive access, opportunities, and benefits within the ecosystem. Companion tracks include the TON Syndicate (global community volunteer program) and TON Champion Grants (ecosystem-growth funding).",
    location: "Global (Telegram-first community)",
    focus: "Crypto-curious community members of any skill level — adoption, regional outreach, content for TON",
    applyUrl: "https://society.ton.org/",
    rolling: true,
    tags: ["ambassador", "ton", "the-open-network", "crypto", "telegram", "adoption"],
  },
  {
    name: "HashiCorp Ambassadors",
    organization: "HashiCorp",
    organizationUrl: "https://www.hashicorp.com/en/ambassador",
    description:
      "Annual recognition program for HashiCorp community members active over the preceding 12 months — emphasis on knowledge sharing, mentorship, and kindness. Activities include blog writing, video content, certification development, conference talks, and roadmap feedback. Perks: thank-you care packages, early product briefings, roadmap reviews + feedback sessions, and growth opportunities via collaboration on HashiCorp content, videos, and speaking engagements. Submissions open annually December 1 → January 5. Public ambassador directory available for regional / tool-specific networking.",
    duration: "1 year (per annual cycle)",
    location: "Global (remote)",
    focus: "Terraform / Vault / Consul / Nomad / Packer practitioners with sustained community contribution",
    applyUrl: "https://www.hashicorp.com/en/ambassador",
    nextDeadline: "2027-01-05T23:59:00Z",
    rolling: false,
    tags: ["ambassador", "hashicorp", "terraform", "vault", "consul", "devops"],
  },
  {
    name: "GitHub Campus Experts",
    organization: "GitHub Education",
    organizationUrl: "https://education.github.com/experts",
    description:
      "GitHub's student-leader program for university students organizing technical communities on their campus. Eligibility: GitHub user for 6+ months, 18+, full-time student at a higher-ed institution with 1+ year remaining, validated through the GitHub Student Developer Pack. Annual application window opens in July for one month. Selection criteria emphasize motivation, growth potential, and intended campus impact — not just technical credentials. After acceptance, Campus Experts go through formal training and onboarding. Distinct from (and complementary to) Microsoft Learn Student Ambassadors — this one is GitHub-centric.",
    duration: "Spans remaining years of study (re-validated through Student Developer Pack)",
    location: "Global (campus-based — must be enrolled full-time)",
    focus: "Current full-time university students leading on-campus technical communities and inclusive learning spaces",
    applyUrl: "https://education.github.com/campus_experts",
    rolling: false,
    tags: ["ambassador", "github", "students", "campus", "education"],
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
