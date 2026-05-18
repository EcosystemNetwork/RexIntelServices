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
    stipendUsd: 200000,
    duration: "2 years",
    eligibility: "Under 23 years old. Open globally. Must be willing to leave or postpone college during the fellowship.",
    location: "Open globally (San Francisco preferred for in-person community + events)",
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
    location: "Remote (worldwide) + Bay Area visits",
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
    stipendUsd: 300000,
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
    location: "San Francisco Bay Area (in-person, Bay Area preferred but open to applicants worldwide)",
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
    stipendUsd: 10000,
    eligibility: "Open globally. Strong preference for projects with unusual upside that conventional funders would skip. No academic affiliation required.",
    location: "Remote (worldwide; no in-person component)",
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
    location: "Remote (worldwide)",
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
    location: "Remote (worldwide; ecosystem work from anywhere)",
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
    location: "Remote (worldwide)",
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
    name: "VNTR Unicorns Growth Syndicate & IR Fellowship",
    organization: "VNTR Capital",
    organizationUrl: "https://vntrcapital.notion.site/vntrifellowshipfeb2026",
    description:
      "Capital commitment required: $50,000+ LP check per Fellow into a Delaware-based, multi-asset SPV — fellows invest their own capital rather than receive a stipend. 3-month practitioner-led program for investors and IR professionals focused on late-stage private unicorns through secondary transactions. Curated cohort of 10–20. Hands-on participation in deal evaluation, portfolio construction, weekly Investment Committees, and LP-facing reporting. Designed for accredited investors, exited founders moving into late-stage investing, and IR professionals at funds / family offices.",
    stipend: "$50,000+ LP commitment required (no stipend — fellows invest capital)",
    duration: "3 months",
    eligibility: "Accredited investors with $50K+ to commit. Open to investors targeting unicorn / pre-IPO companies, secondary-market investors, exited founders moving into late-stage private investing, and IR professionals at funds or family offices. 20+ hours per week.",
    location: "Remote (weekly live sessions + Investment Committees)",
    focus: "Late-stage VC secondaries, unicorn investing, investor relations, SPV mechanics",
    applyUrl: "https://vntrcapital.notion.site/vntrifellowshipfeb2026",
    nextDeadline: "2026-02-17T00:00:00.000Z",
    rolling: false,
    cadence: "Cohort-based (Feb 2026 cohort)",
    tags: ["vntr", "secondaries", "unicorns", "late-stage", "ir", "lp", "capital-commitment-required"],
  },
  {
    name: "a16z Crypto Research Fellowship",
    organization: "a16z crypto",
    organizationUrl: "https://a16zcrypto.com/research/",
    description:
      "Funded research fellowship for academics and graduate students working on crypto / web3 topics — cryptography, distributed systems, mechanism design, economics. Output: open publications. Mentorship from a16z crypto's research team (Tim Roughgarden, Ali Yahya, Joachim Neu, and others). Distinct from the CSX accelerator (which is for founders).",
    stipend: "Competitive academic stipend",
    eligibility: "Graduate students and academic researchers. Strong publication record in adjacent fields preferred.",
    location: "Remote (worldwide) + travel for events",
    focus: "Crypto research — cryptography, distributed systems, mechanism design",
    applyUrl: "https://a16zcrypto.com/research/",
    rolling: false,
    cadence: "Annual",
    tags: ["a16z", "crypto", "research", "academic", "phd"],
  },

  // === AI safety + alignment fellowships (added 2026-05-17) ===
  {
    name: "MATS — Autumn 2026",
    organization: "ML Alignment & Theory Scholars",
    organizationUrl: "https://www.matsprogram.org/",
    description:
      "Top AI-safety research fellowship — 10 weeks in-person in Berkeley + London, paired with senior mentors from Anthropic, OpenAI, DeepMind, Redwood, ARC. Seven tracks: Empirical, Theory, Strategy & Forecasting, Policy & Governance, Systems Security, Founding & Field-Building, Biosecurity. Travel + housing + meals covered on top of stipend.",
    stipend: "$1,250 / week ($12,500 total) + travel + housing + meals",
    stipendUsd: 12500,
    duration: "10 weeks (Sep 28 – Dec 4, 2026)",
    eligibility:
      "Empirical or theoretical AI safety researchers + field-builders; open globally",
    location: "Berkeley, CA + London, UK (in-person, open to applicants worldwide)",
    focus: "AI safety / alignment research",
    applyUrl: "https://www.matsprogram.org/apply",
    nextDeadline: "2026-06-07T23:59:00Z",
    rolling: false,
    cadence: "Twice yearly (Summer + Autumn)",
    tags: ["mats", "ai-safety", "alignment", "berkeley", "london"],
  },
  {
    name: "Constellation Visiting Researcher Program",
    organization: "Constellation",
    organizationUrl: "https://www.constellation.org/",
    description:
      "Berkeley-based AI safety research community offering visiting researcher slots. Office space, peer community, programming, and stipends for full-time AI safety researchers between roles or building new research agendas.",
    stipend: "Negotiated",
    eligibility: "AI safety researchers — empirical or theoretical",
    location: "Berkeley, CA (in-person, open to applicants worldwide)",
    focus: "AI safety, alignment, model evaluation",
    applyUrl: "https://www.constellation.org/",
    rolling: true,
    tags: ["constellation", "ai-safety", "berkeley", "research"],
  },
  {
    name: "Vitalik Buterin Postdoctoral Fellowship in AI Existential Safety",
    organization: "Future of Life Institute",
    organizationUrl:
      "https://futureoflife.org/grant-program/vitalik-buterin-postdoctoral-fellowship/",
    description:
      "FLI's named fellowship for postdocs researching AI existential safety. $80k/year stipend over 3 years, with research budget. Applications evaluated annually.",
    stipend: "$80k / year + $10k research budget",
    stipendUsd: 240000,
    duration: "Up to 3 years",
    eligibility: "Postdoctoral researchers in AI existential safety",
    location: "Worldwide (host institution)",
    focus: "AI existential safety, alignment research",
    applyUrl:
      "https://futureoflife.org/grant-program/vitalik-buterin-postdoctoral-fellowship/",
    cadence: "Annual",
    tags: ["fli", "ai-safety", "x-risk", "postdoc"],
  },
  {
    name: "AI Safety Camp",
    organization: "AI Safety Camp",
    organizationUrl: "https://www.aisafety.camp/",
    description:
      "Volunteer-led cohort program for new and aspiring AI safety researchers. Multiple tracks (technical alignment, governance, field-building) over 3–6 months, paired with experienced research leads. Free, no equity — pure research apprenticeship.",
    stipend: "Travel grants available",
    duration: "3–6 months",
    eligibility: "Aspiring AI safety researchers — open globally",
    location: "Remote (worldwide) + in-person retreats",
    focus: "Technical AI safety, governance, field-building",
    applyUrl: "https://www.aisafety.camp/",
    cadence: "Annual",
    tags: ["aisc", "ai-safety", "field-building", "remote"],
  },

  // === Crypto research fellowships (added 2026-05-17) ===
  {
    name: "Ethereum Foundation PSE Fellowship",
    organization: "Ethereum Foundation — Privacy & Scaling Explorations",
    organizationUrl: "https://pse.dev/",
    description:
      "EF's Privacy & Scaling Explorations group offers research fellowships on ZK, MPC, FHE, anti-collusion, identity, programmable cryptography. Mentorship from PSE researchers + funding to ship a piece of work over 3–6 months.",
    stipend: "Negotiated per project",
    duration: "3–6 months",
    eligibility:
      "Researchers / engineers with strong ZK or applied-cryptography background",
    location: "Remote (worldwide)",
    focus: "ZK proofs, privacy, identity, cryptography",
    applyUrl: "https://pse.dev/programs",
    rolling: true,
    tags: ["ethereum", "pse", "zk", "privacy", "cryptography"],
  },
  {
    name: "0xPARC ZK Apprenticeship",
    organization: "0xPARC",
    organizationUrl: "https://0xparc.org/",
    description:
      "0xPARC's apprenticeship for engineers ramping into ZK + applied cryptography. Pairs apprentices with researchers shipping at the frontier (PSE, Aztec, RISC Zero alumni). Stipend + research output expected within the cycle.",
    stipend: "Negotiated",
    duration: "3–6 months",
    eligibility: "Engineers transitioning into ZK / cryptography",
    location: "Remote (worldwide)",
    focus: "ZK proofs, programmable cryptography",
    applyUrl: "https://0xparc.org/",
    rolling: true,
    tags: ["0xparc", "zk", "apprenticeship", "cryptography"],
  },
  {
    name: "Polkadot Technical Fellowship",
    organization: "Polkadot / Web3 Foundation",
    organizationUrl: "https://polkadot-fellows.github.io/dashboard/",
    description:
      "On-chain technical fellowship governing Polkadot's runtime — a rank-based, self-electing body of protocol contributors. Members earn ranks (I–VI) through demonstrated technical contributions and receive monthly DOT stipends tied to rank. Approves runtime upgrades, fast-tracks referenda, and serves as the protocol's technical conscience. Novel governance experiment — unlike traditional fellowships, membership is permanent and earned through public work, not selected by a committee.",
    stipend: "Monthly DOT stipend tied to rank (I–VI); higher ranks ~$10k/mo equivalent",
    eligibility: "Demonstrated public technical contributions to Polkadot / Substrate. Promotion requires peer review by existing fellows.",
    location: "Worldwide (on-chain)",
    focus: "Polkadot runtime, Substrate, protocol governance",
    applyUrl: "https://polkadot-fellows.github.io/dashboard/",
    rolling: true,
    cadence: "Continuous (apply for induction anytime; promotions via peer review)",
    tags: ["polkadot", "web3-foundation", "on-chain-governance", "substrate", "protocol"],
  },

  // === Generalist + AI safety frontier (added 2026-05-17) ===
  {
    name: "ARENA — Alignment Research Engineer Accelerator",
    organization: "ARENA",
    organizationUrl: "https://www.arena.education/",
    description:
      "5-week in-person AI safety engineering accelerator in London — distinct from MATS (research-focused) by being engineering-focused. Curriculum covers interpretability, RL from human feedback, evals, agent foundations. Graduates pipeline into Anthropic, DeepMind, Apollo Research, METR, and other frontier safety teams. Free to attend with stipend.",
    stipend: "Covered cost of living + travel",
    duration: "5 weeks in-person",
    eligibility: "Strong Python + ML engineering background; interest in AI safety. No prior alignment experience required.",
    location: "London, UK (in-person, open to applicants worldwide)",
    focus: "AI safety engineering — interpretability, evals, RLHF, agent foundations",
    applyUrl: "https://www.arena.education/",
    rolling: false,
    cadence: "Multiple cohorts per year",
    tags: ["arena", "ai-safety", "engineering", "london", "interpretability"],
  },
  {
    name: "Open Philanthropy Century Fellowship",
    organization: "Open Philanthropy",
    organizationUrl: "https://www.openphilanthropy.org/grants/century-fellowship/",
    description:
      "Open Phil's flagship fellowship for early-career people working on the most important problems of the next century — AI safety, biosecurity, global priorities research, animal welfare. $100k/year stipend over 2 years + funding for projects, travel, and learning. Highly selective; about a dozen fellows per cohort.",
    stipend: "$100,000 / year over 2 years + project funding",
    stipendUsd: 200000,
    duration: "2 years",
    eligibility: "Early-career (typically within 5 years of finishing undergrad). Demonstrated commitment to long-term global priorities — AI safety, biosecurity, x-risk reduction.",
    location: "Worldwide (some Bay Area / DC presence encouraged)",
    focus: "AI safety, biosecurity, global priorities, x-risk",
    applyUrl: "https://www.openphilanthropy.org/grants/century-fellowship/",
    rolling: false,
    cadence: "Annual",
    tags: ["open-philanthropy", "ai-safety", "biosecurity", "x-risk", "longtermism"],
  },
  {
    name: "Hertz Foundation Fellowship",
    organization: "Fannie and John Hertz Foundation",
    organizationUrl: "https://www.hertzfoundation.org/the-fellowship/",
    description:
      "Most prestigious PhD fellowship in the applied physical, biological, and engineering sciences — including AI, robotics, autonomous systems, and quantum. 5 years of full funding ($46k stipend + tuition + research equipment) with zero strings beyond the moral commitment to use one's skills for the national interest in time of need. Alumni: dozens of Nobel laureates, MacArthur fellows, and frontier-AI researchers.",
    stipend: "$46,000 / year stipend + full tuition (5 years total)",
    stipendUsd: 230000,
    duration: "Up to 5 years (PhD-length)",
    eligibility: "US citizens / permanent residents starting or in early years of PhD in applied physical, biological, or engineering sciences. Includes AI / ML / robotics.",
    location: "US only — recipient's choice of US PhD program",
    focus: "Applied sciences PhDs — AI, robotics, autonomy, quantum, bio-engineering",
    applyUrl: "https://www.hertzfoundation.org/the-fellowship/",
    rolling: false,
    cadence: "Annual (deadline ~Oct/Nov for following academic year)",
    tags: ["hertz", "phd", "applied-sciences", "ai", "robotics", "us-only"],
  },
  {
    name: "1517 Fund Medici Project",
    organization: "1517 Fund",
    organizationUrl: "https://www.1517fund.com/medici-project",
    description:
      "Grants and microgrants for young people (often under 22) doing independent technical projects — robotics, AI, hardware, software, science. $1k–$5k grants with near-instant turnaround, designed to give credentialless builders their first 'someone believes in this' moment. Run by 1517 Fund (founded by ex-Thiel Foundation team). Pipeline into 1517's pre-seed checks.",
    stipend: "$1,000–$5,000 microgrants; some larger awards",
    stipendUsd: 1000,
    eligibility: "Builders without traditional credentials — often under 22, often skipping college. Open globally. Bias toward independent technical projects.",
    location: "Remote (worldwide)",
    focus: "Generalist — hardware, AI, robotics, software, science",
    applyUrl: "https://www.1517fund.com/medici-project",
    rolling: true,
    cadence: "Rolling",
    tags: ["1517", "medici", "under-22", "microgrant", "credentialless", "hardware"],
  },
  {
    name: "Z Fellows",
    organization: "Z Fellows",
    organizationUrl: "https://www.zfellows.com/",
    description:
      "1-week intensive founder fellowship — $10k grant + curated mentor + investor network for 3 days of office hours and dinners in SF. Designed for ambitious 18–24-year-olds considering or already building startups. Weekly cohorts year-round, ~1,000+ alumni including founders backed by YC, a16z, Founders Fund. AI / web3 / hard-tech heavy in practice.",
    stipend: "$10,000 grant (no equity)",
    stipendUsd: 10000,
    duration: "1 week in SF",
    eligibility: "Ambitious 18–24 year olds, typically pre-founder or early-founder. Open globally.",
    location: "San Francisco (1-week in-person, open to applicants worldwide)",
    focus: "Generalist founders — AI, web3, hard-tech leaning",
    applyUrl: "https://www.zfellows.com/",
    rolling: true,
    cadence: "Weekly cohorts",
    tags: ["z-fellows", "founders", "under-24", "sf", "no-equity"],
  },

  // === Robotics + embodied-AI PhD fellowships (added 2026-05-17) ===
  {
    name: "NVIDIA Graduate Fellowship",
    organization: "NVIDIA Research",
    organizationUrl: "https://research.nvidia.com/graduate-fellowships",
    description:
      "Top-tier industry PhD fellowship for graduate students doing research in GPU computing, AI/ML, robotics, autonomous vehicles, graphics, and HPC. Up to ten fellows per year; each receives funding, a paid summer internship at NVIDIA Research, GPU hardware donation, and a senior NVIDIA mentor. Strongly weighted toward applied frontier research with industry impact.",
    stipend: "$60,000 stipend + summer internship + GPU hardware grant",
    stipendUsd: 60000,
    duration: "1 year (renewable; awarded annually)",
    eligibility: "PhD students (2nd year or beyond) at any university worldwide. Research focus in AI/ML, robotics, autonomous systems, graphics, HPC, or GPU computing.",
    location: "Worldwide (student's home institution)",
    focus: "AI/ML, robotics, autonomous vehicles, GPU systems",
    applyUrl: "https://research.nvidia.com/graduate-fellowships",
    rolling: false,
    cadence: "Annual (deadline ~September)",
    tags: ["nvidia", "phd", "ai", "robotics", "autonomy", "industry-fellowship"],
  },
  {
    name: "Google PhD Fellowship Program",
    organization: "Google Research",
    organizationUrl: "https://research.google/programs-and-events/phd-fellowship/",
    description:
      "Long-running Google PhD Fellowship — funds graduate students across ML, robotics & autonomous systems, NLP, systems & networking, HCI, privacy/security, quantum, health research, and more. Each fellow gets a Google research mentor in addition to their academic advisor. Highly selective; nomination-based via the student's university.",
    stipend: "Up to 2 years tuition + ~$10k/year personal stipend (region-dependent)",
    stipendUsd: 20000,
    duration: "Up to 2 years",
    eligibility: "Nominated by the student's university (each university has a quota). Students must be enrolled in a PhD program at a participating university.",
    location: "Worldwide (regional cohorts: US/Canada, EMEA, India, East Asia, etc.)",
    focus: "ML, robotics, NLP, systems, HCI, privacy, quantum, health",
    applyUrl: "https://research.google/programs-and-events/phd-fellowship/",
    rolling: false,
    cadence: "Annual (deadlines vary by region)",
    tags: ["google", "phd", "ml", "robotics", "industry-fellowship"],
  },
  {
    name: "Apple Scholars in AI/ML",
    organization: "Apple",
    organizationUrl: "https://machinelearning.apple.com/updates/apple-scholars-aiml-2024",
    description:
      "Apple's PhD fellowship for graduate students researching ML, computer vision, robotics, NLP, and HCI. Two years of funding (tuition + stipend), Apple research mentor, and travel funding for conferences. Smaller cohort than Google / NVIDIA — typically ~20 scholars worldwide per year.",
    stipend: "Tuition + ~$30k/year stipend + research support + travel",
    stipendUsd: 60000,
    duration: "2 years",
    eligibility: "PhD students at universities in North America, Europe, or Asia. Research in AI/ML, computer vision, robotics, NLP, HCI, or related.",
    location: "Worldwide (student's home institution)",
    focus: "ML, computer vision, robotics, NLP, HCI",
    applyUrl: "https://machinelearning.apple.com/updates/apple-scholars-aiml-2024",
    rolling: false,
    cadence: "Annual",
    tags: ["apple", "phd", "ml", "computer-vision", "robotics", "industry-fellowship"],
  },
  {
    name: "Meta PhD Fellowship",
    organization: "Meta",
    organizationUrl: "https://research.facebook.com/fellowship/",
    description:
      "Meta's PhD fellowship across ~16 research areas including embodied AI, robotics, AR/VR systems, computational social science, security, and ML. Each fellow gets 2 years of tuition + stipend + a Meta research mentor. Open to PhD students globally.",
    stipend: "Tuition + $42,000/year stipend + travel + research funds",
    stipendUsd: 84000,
    duration: "2 years",
    eligibility: "PhD students enrolled (or starting fall of award year) at an accredited university. Research areas: embodied AI, robotics, AR/VR, ML, systems, security, social science.",
    location: "Worldwide (student's home institution)",
    focus: "Embodied AI, robotics, AR/VR, ML systems",
    applyUrl: "https://research.facebook.com/fellowship/",
    rolling: false,
    cadence: "Annual (deadline ~September)",
    tags: ["meta", "phd", "embodied-ai", "robotics", "ar-vr", "industry-fellowship"],
  },
  {
    name: "CMU Robotics Institute Summer Scholars (RISS)",
    organization: "Carnegie Mellon Robotics Institute",
    organizationUrl: "https://riss.ri.cmu.edu/",
    description:
      "11-week paid summer research program at CMU's Robotics Institute for undergraduates worldwide. Scholars are paired with a faculty mentor and PhD student, work on an active robotics research project, and publish a working paper at the end. Pipeline into top robotics PhD programs — alumni populate research labs at CMU, MIT, Stanford, Berkeley, Google Brain Robotics, Toyota Research, and Boston Dynamics AI Institute.",
    stipend: "$5,000+ stipend + housing + travel covered",
    stipendUsd: 5000,
    duration: "11 weeks (summer)",
    eligibility: "Undergraduate students worldwide with strong CS / ECE / math / mechanical-engineering background. Underrepresented minorities, women, first-gen students explicitly encouraged.",
    location: "Pittsburgh, PA (in-person at CMU, open to undergrads worldwide)",
    focus: "Robotics research — perception, planning, control, learning, HRI",
    applyUrl: "https://riss.ri.cmu.edu/how-to-apply/",
    rolling: false,
    cadence: "Annual (deadline ~January for summer)",
    tags: ["cmu", "riss", "robotics", "undergraduate", "summer", "pipeline"],
  },

  // === AI governance + policy (added 2026-05-17) ===
  {
    name: "GovAI Fellowship",
    organization: "Centre for the Governance of AI (GovAI)",
    organizationUrl: "https://www.governance.ai/",
    description:
      "Oxford-based research fellowship on AI governance — policy, strategy, geopolitics of advanced AI. Two tracks: Summer Fellowship (3 months, early-career researchers) and Visiting Research Fellowship (longer, senior). Alumni populate AI policy roles at OpenAI, Anthropic, DeepMind, UK AISI, US AISI, RAND, and Carnegie Endowment.",
    stipend: "Competitive stipend + housing for in-person fellows",
    duration: "Summer: 3 months; Visiting: 6–12 months",
    eligibility: "Early- to mid-career researchers in AI policy, international relations, law, philosophy, economics, or technical AI. Strong writing required.",
    location: "Oxford, UK (in-person) + remote (worldwide)",
    focus: "AI governance, policy, geopolitics, alignment-adjacent strategy",
    applyUrl: "https://www.governance.ai/",
    rolling: false,
    cadence: "Annual (Summer cohort + rolling Visiting)",
    tags: ["govai", "ai-policy", "governance", "oxford", "geopolitics"],
  },
  {
    name: "BlueDot Impact — AI Safety Fundamentals",
    organization: "BlueDot Impact",
    organizationUrl: "https://bluedot.org/",
    description:
      "8–12 week structured courses on AI Safety (Alignment, Governance, Pandemics) — free, cohort-based, with weekly facilitated discussions. Largest pipeline into AI safety: 5,000+ graduates feed into MATS, ARENA, Constellation, GovAI, Anthropic Fellows. Graduates often go on to BlueDot Pro Fellowships and project funding.",
    stipend: "Free to attend; project funding available for top graduates",
    duration: "8–12 weeks per course",
    eligibility: "No prior experience required for Intro courses. Pro fellowships require completion + project proposal.",
    location: "Online (global, English-language)",
    focus: "AI safety, AI governance, biosecurity, pandemic preparedness",
    applyUrl: "https://aisafetyfundamentals.com/",
    rolling: true,
    cadence: "Multiple cohorts per year (rolling)",
    tags: ["bluedot", "ai-safety", "course", "pipeline", "free"],
  },
  {
    name: "METR Research Fellowship",
    organization: "METR (Model Evaluation & Threat Research)",
    organizationUrl: "https://metr.org/",
    description:
      "Research fellowship at METR — the org running frontier AI capability evaluations for Anthropic, OpenAI, DeepMind, and government AISIs. Fellows ship eval suites, autonomy benchmarks, and threat models. Pipeline into full-time research engineer / scientist roles at METR and frontier labs.",
    stipend: "Competitive (covers full-time work)",
    duration: "3–6 months",
    eligibility: "Strong engineering or research background. Interest in evals, capability elicitation, agent autonomy, or threat modeling.",
    location: "Berkeley, CA (in-person) + remote (open to applicants worldwide)",
    focus: "AI evals, capability elicitation, autonomous agents, threat modeling",
    applyUrl: "https://metr.org/",
    rolling: true,
    cadence: "Rolling",
    tags: ["metr", "ai-safety", "evals", "autonomy", "berkeley"],
  },
  {
    name: "Apart Research Fellowship",
    organization: "Apart Research",
    organizationUrl: "https://www.apartresearch.com/",
    description:
      "Research sprint program for AI safety — short, intense hackathon-style fellowships producing concrete research artifacts (papers, evals, tooling). Lower commitment than MATS; ideal for engineers and researchers wanting a structured first AI-safety publication. Outputs regularly published on arXiv and the Alignment Forum.",
    stipend: "Travel grants + prize pool for top projects",
    duration: "2 weeks – 3 months (program dependent)",
    eligibility: "Open globally. Background in ML, math, philosophy, or policy. No prior AI safety publications required.",
    location: "Remote (worldwide) + occasional in-person sprints",
    focus: "AI safety research sprints — alignment, interpretability, governance",
    applyUrl: "https://www.apartresearch.com/",
    rolling: true,
    cadence: "Multiple sprints per year",
    tags: ["apart", "ai-safety", "research-sprint", "hackathon", "remote"],
  },
  {
    name: "PIBBSS Fellowship",
    organization: "Principles of Intelligent Behavior in Biological and Social Systems",
    organizationUrl: "https://pibbss.ai/",
    description:
      "Interdisciplinary AI safety fellowship — pairs researchers from biology, neuroscience, complex systems, philosophy, and the social sciences with technical AI safety researchers. 3-month summer program in Berkeley. Aims to import frameworks from natural sciences to the alignment problem.",
    stipend: "$10,000 + travel + housing",
    stipendUsd: 10000,
    duration: "3 months (summer)",
    eligibility: "PhD students, postdocs, and researchers from biology, neuroscience, complex systems, philosophy, economics, or sociology. Technical AI background NOT required.",
    location: "Berkeley, CA (in-person, open to applicants worldwide)",
    focus: "Interdisciplinary AI safety — biology, complex systems, cognitive science",
    applyUrl: "https://pibbss.ai/fellowship/",
    rolling: false,
    cadence: "Annual (summer)",
    tags: ["pibbss", "ai-safety", "interdisciplinary", "biology", "complex-systems"],
  },
  {
    name: "Cooperative AI Foundation Fellowship",
    organization: "Cooperative AI Foundation",
    organizationUrl: "https://www.cooperativeai.com/",
    description:
      "Research grants and fellowships for work on cooperative AI — multi-agent cooperation, game theory, mechanism design, social choice with AI agents. Funds PhD students, postdocs, and independent researchers. Founded by researchers from DeepMind and Oxford; closely tied to the cooperative-AI research community.",
    stipend: "Variable — research grants $50k–$200k typical",
    eligibility: "Researchers at any career stage working on multi-agent cooperation, mechanism design, or social choice with AI agents.",
    location: "Remote (worldwide; researchers at their home institutions)",
    focus: "Cooperative AI, multi-agent systems, mechanism design",
    applyUrl: "https://www.cooperativeai.com/",
    rolling: true,
    cadence: "Rolling",
    tags: ["cooperative-ai", "multi-agent", "mechanism-design", "research"],
  },

  // === APAC + global pipeline (added 2026-05-17) ===
  {
    name: "AI Singapore Apprenticeship Programme (AIAP)",
    organization: "AI Singapore",
    organizationUrl: "https://aisingapore.org/",
    description:
      "9-month full-time paid AI engineer apprenticeship run by the Singapore government's national AI office. Apprentices work on real industry deployments with sponsor companies — banks, government agencies, healthcare systems — under senior AI engineer mentorship. Strong pipeline into permanent AI roles in Singapore and ASEAN. Open primarily to Singaporeans / PRs.",
    stipend: "$3,500–$5,500 SGD/month + employer-sponsored placement after completion",
    duration: "9 months full-time",
    eligibility: "Singapore citizens / PRs preferred. Strong CS / engineering / data-science background; some prior ML exposure expected. Limited slots for foreigners.",
    location: "Singapore only (in-person; citizens / PRs preferred)",
    focus: "Applied AI engineering — NLP, CV, MLOps, deployment",
    applyUrl: "https://aiap.sg/",
    rolling: false,
    cadence: "2 batches per year",
    tags: ["ai-singapore", "aiap", "apac", "singapore", "applied-ai"],
  },

  // === Generalist with strong AI/web3 alumni (added 2026-05-17) ===
  {
    name: "Knight-Hennessy Scholars",
    organization: "Stanford University",
    organizationUrl: "https://knight-hennessy.stanford.edu/",
    description:
      "Stanford's flagship graduate fellowship — funds full tuition + stipend + leadership programming for any Stanford graduate degree (PhD, MD, JD, MBA, MS, MA). Cohort of ~100/year selected globally. Designed to develop leaders across sectors — frequently picks AI/CS PhD students alongside policy, medicine, business. Alumni network is deliberately cross-disciplinary.",
    stipend: "Full tuition + ~$48k/year stipend + ~$10k/year for experiences",
    stipendUsd: 144000,
    duration: "Up to 3 years (or length of program)",
    eligibility: "Anyone applying to or enrolled in their first year of a Stanford graduate program. Citizenship-agnostic. Bachelor's degree earned within the last 7 years.",
    location: "Stanford, CA (in-person, open to applicants worldwide)",
    focus: "Generalist — leadership across sectors (AI/CS, policy, medicine, business)",
    applyUrl: "https://knight-hennessy.stanford.edu/admission",
    rolling: false,
    cadence: "Annual (deadline ~October)",
    tags: ["knight-hennessy", "stanford", "graduate", "generalist", "leadership"],
  },
  {
    name: "Founders Inc Fellowship",
    organization: "Founders Inc",
    organizationUrl: "https://www.f.inc/",
    description:
      "SF-based frontier-tech founder fellowship and studio. Funds and houses early-stage founders building in hardware, AI, robotics, defense-tech, and bio. Office space at the F.inc campus in SF, capital ($25k–$100k), and exposure to a network of frontier-tech investors and operators. Distinct from accelerator programs by emphasis on physical / hard-tech bets.",
    stipend: "$25k–$100k early checks + SF office space + community",
    eligibility: "Pre-seed / seed founders building hard-tech, hardware, AI, robotics, defense, bio. SF-based or willing to relocate.",
    location: "San Francisco (in-person at F.inc campus, open to applicants worldwide who can relocate)",
    focus: "Hard-tech founders — hardware, AI, robotics, defense, bio",
    applyUrl: "https://www.f.inc/",
    rolling: true,
    cadence: "Rolling",
    tags: ["founders-inc", "hard-tech", "robotics", "hardware", "sf"],
  },
  {
    name: "Plurality Institute Fellowship",
    organization: "Plurality Institute",
    organizationUrl: "https://www.plurality.institute/",
    description:
      "Research fellowship on plural technology, pluralistic governance, and the intersection of AI + democracy. Closely tied to Glen Weyl, Audrey Tang, and the ⿻ Plurality book. Fellows publish research, build prototypes (quadratic funding, retroactive PGF, soulbound governance), and connect with peers across web3, civic tech, and AI policy.",
    stipend: "Variable — research grants + project funding",
    eligibility: "Researchers, builders, designers working on plural tech, governance, civic tech, or AI-democracy intersections.",
    location: "Remote (worldwide)",
    focus: "Plural technology, AI + democracy, governance design, civic tech",
    applyUrl: "https://www.plurality.institute/",
    rolling: true,
    cadence: "Rolling",
    tags: ["plurality", "governance", "civic-tech", "ai-policy", "weyl"],
  },

  // === Hard-tech founders + bio + high-school pipeline (added 2026-05-17) ===
  {
    name: "Activate Fellowship",
    organization: "Activate (formerly Cyclotron Road)",
    organizationUrl: "https://www.activate.org/fellowship",
    description:
      "2-year fellowship for scientists and engineers commercializing hard-tech breakthroughs — energy, climate, advanced materials, biotech, AI/compute-infrastructure. $100k+ stipend, embedded position at a host research institution (Berkeley Lab, Argonne, Cornell, Houston), and dedicated mentorship through company formation. Spinouts include Twelve, Lilac Solutions, Mangrove Lithium. Originally born at Berkeley Lab as Cyclotron Road.",
    stipend: "$100,000+ stipend over 2 years + health benefits + travel + ~$100k project budget",
    stipendUsd: 100000,
    duration: "2 years",
    eligibility: "Scientist / engineer founders (often post-PhD) commercializing hard-tech research. US-based or able to relocate to host site. Multiple cohorts by host city.",
    location: "US only — Berkeley, CA / Boston, MA / Houston, TX / Chicago, IL / Ithaca, NY (in-person at host site)",
    focus: "Hard-tech commercialization — energy, climate, advanced materials, biotech, AI infra",
    applyUrl: "https://www.activate.org/fellowship",
    rolling: false,
    cadence: "Annual (per host city)",
    tags: ["activate", "hard-tech", "energy", "climate", "biotech", "phd"],
  },
  {
    name: "Nucleate Fellowship",
    organization: "Nucleate",
    organizationUrl: "https://www.nucleate.xyz/",
    description:
      "Free, student-and-postdoc-led fellowship for aspiring bio + AI-bio founders. ~6-month structured program: team formation, IP strategy, fundraising, mentorship from founders, VCs, and operators. Multiple tracks (Therapeutics, Eto/Tech Bio, Climate Bio, Activator for newer markets). Operates in 40+ cities globally; built the Nucleate Eto track specifically for the AI-meets-bio wave.",
    stipend: "Free; alumni eligible for pre-seed checks via partner VCs",
    duration: "~6 months",
    eligibility: "PhD students, postdocs, and early-career researchers building or considering a biotech / AI-bio / climate-bio company.",
    location: "40+ cities globally (in-person chapters) + remote elements",
    focus: "Bio founders, AI-bio (Eto), climate bio, therapeutics",
    applyUrl: "https://www.nucleate.xyz/",
    rolling: false,
    cadence: "Annual cohorts (varies by chapter)",
    tags: ["nucleate", "bio", "ai-bio", "founders", "phd", "global"],
  },
  {
    name: "Atlas Fellowship",
    organization: "Atlas Fellowship",
    organizationUrl: "https://www.atlasfellowship.org/",
    description:
      "Selective fellowship for ambitious high schoolers worldwide. Summer program in Berkeley + $10k scholarship + ongoing mentorship. Curriculum heavy on AI safety, EA-adjacent thinking, and frontier research. Selective — single-digit acceptance rate from thousands of applicants. Alumni pipeline into top STEM undergrad programs and frontier AI / safety research labs.",
    stipend: "$10,000 scholarship + free Berkeley summer program (travel + lodging covered)",
    stipendUsd: 10000,
    duration: "10 days summer + ongoing mentorship",
    eligibility: "High school students worldwide (typically ages 15–19). Strong intellectual track record. Application includes essays + interviews.",
    location: "Berkeley, CA (10-day summer in-person, open to high schoolers worldwide)",
    focus: "AI safety, frontier research, high-school-to-frontier pipeline",
    applyUrl: "https://www.atlasfellowship.org/",
    rolling: false,
    cadence: "Annual (summer)",
    tags: ["atlas", "high-school", "ai-safety", "berkeley", "pipeline"],
  },
  {
    name: "CAIS Fellowship",
    organization: "Center for AI Safety (CAIS)",
    organizationUrl: "https://www.safe.ai/",
    description:
      "Funded research fellowships at the Center for AI Safety in San Francisco. Two tracks: a general research fellowship (technical AI safety, evals, model organisms) and a Philosophy Fellowship for philosophers applying their expertise to AI risk. Run by Dan Hendrycks and team — same group that authored the WMDP benchmark, RepE, and the influential 'Statement on AI Risk'.",
    stipend: "Competitive (covers full-time work) + SF housing support",
    duration: "Typically 6–12 months",
    eligibility: "Strong ML / philosophy / safety background. Research fellowship: technical AI background. Philosophy Fellowship: PhD in philosophy or equivalent.",
    location: "San Francisco, CA (in-person, open to applicants worldwide)",
    focus: "AI safety research, model evals, philosophy of AI risk",
    applyUrl: "https://www.safe.ai/fellowship",
    rolling: true,
    cadence: "Rolling",
    tags: ["cais", "ai-safety", "evals", "philosophy", "sf", "in-person", "global"],
  },

  // === Global South + climate (added 2026-05-17) ===
  {
    name: "Wadhwani AI Fellowship",
    organization: "Wadhwani Institute for Artificial Intelligence",
    organizationUrl: "https://www.wadhwaniai.org/",
    description:
      "India's flagship applied-AI-for-social-good fellowship. Fellows build and deploy ML systems for public health (TB screening, maternal health), agriculture (cotton pest detection), and education across Indian government partnerships. Multi-year fellowship with full-time pay, embedded in Wadhwani AI's Mumbai / Bengaluru offices. Co-founded by Romesh & Sunil Wadhwani.",
    stipend: "Full-time market-rate salary + research budget",
    duration: "1–2+ years",
    eligibility: "ML engineers, data scientists, applied researchers willing to work on India-specific deployments. India-based candidates strongly preferred; some openness to relocation.",
    location: "India only — Mumbai / Bengaluru (in-person)",
    focus: "Applied AI for public health, agriculture, education in India",
    applyUrl: "https://www.wadhwaniai.org/",
    rolling: true,
    cadence: "Rolling",
    tags: ["wadhwani", "india", "apac", "applied-ai", "public-good", "in-person"],
  },
  {
    name: "AI4D Africa Scholarship Program",
    organization: "AI4D Africa (IDRC + Sida + Google.org)",
    organizationUrl: "https://www.ai4d.ai/",
    description:
      "Pan-African AI-for-development scholarship and fellowship program funded by Canada's IDRC, Sweden's Sida, and Google.org. Supports masters and PhD students across Africa working on AI applied to local priorities — agriculture, health, language, climate. Includes the AI4D African Language Dataset Challenge and the Anglophone / Francophone Africa Multidisciplinary AI Labs.",
    stipend: "Variable — full scholarships, research grants, and project funding",
    duration: "Program-dependent (often multi-year scholarships)",
    eligibility: "African nationals enrolled in or accepted to masters/PhD programs at African universities. Some tracks open to early-career researchers.",
    location: "Africa-wide (host institutions across the continent)",
    focus: "AI for development — agriculture, health, NLP for African languages, climate",
    applyUrl: "https://www.ai4d.ai/",
    rolling: false,
    cadence: "Annual cohorts per track",
    tags: ["ai4d", "africa", "global-south", "applied-ai", "agriculture", "nlp"],
  },
  {
    name: "Masakhane Research Foundation Fellowship",
    organization: "Masakhane",
    organizationUrl: "https://www.masakhane.io/",
    description:
      "Open, distributed research collective for NLP for African languages — the largest such effort in the world. Fellowship and grant program supports researchers building datasets, models, and tools for 100+ African languages. Outputs published at ACL, EMNLP, NeurIPS. Pipeline into AI4D, Google African Languages, and frontier-lab Africa research seats.",
    stipend: "Variable research grants",
    eligibility: "Researchers (any career stage) working on NLP for African languages. Bias toward African nationals; pan-African and diaspora welcome.",
    location: "Remote (worldwide; pan-African focus)",
    focus: "NLP for African languages — datasets, models, tooling",
    applyUrl: "https://www.masakhane.io/",
    rolling: true,
    cadence: "Rolling",
    tags: ["masakhane", "africa", "nlp", "low-resource", "open-source", "remote"],
  },
  {
    name: "Latitud Fellowship",
    organization: "Latitud",
    organizationUrl: "https://latitud.com/",
    description:
      "Founder fellowship for Latin American entrepreneurs building global-scale tech companies. 12-week program with weekly sessions, mentorship from LatAm operators (Rappi, Nubank, Kavak), and access to Latitud's investor network. Pipeline into Latitud Ventures' pre-seed and seed checks. AI / fintech / marketplace heavy in practice.",
    stipend: "Free to participate; pre-seed checks available post-program",
    duration: "12 weeks",
    eligibility: "LatAm founders (citizenship or residency in any LatAm country). Pre-seed to seed stage. English working proficiency.",
    location: "LatAm-based founders (online + occasional in-person summit)",
    focus: "LatAm founders — AI, fintech, marketplaces, SaaS",
    applyUrl: "https://latitud.com/fellowship",
    rolling: false,
    cadence: "Multiple cohorts per year",
    tags: ["latitud", "latam", "founders", "fintech", "ai", "online"],
  },
  {
    name: "ClimateBase Fellowship",
    organization: "ClimateBase",
    organizationUrl: "https://www.climatebase.org/fellowship",
    description:
      "Online 12-week climate-career fellowship — designed for mid-career professionals transitioning into climate work. Curriculum spans climate science fundamentals, the climate-tech landscape, and applied projects. Includes capstone with a climate startup. Pipeline into 1,000+ climate-tech companies hiring through ClimateBase's job board. Distinct from research fellowships — this is career-pivot infrastructure.",
    stipend: "Tuition-based ($1,300–$2,500); scholarships available",
    duration: "12 weeks",
    eligibility: "Mid-career professionals (any background) transitioning into climate work. Open globally; English required.",
    location: "Online (global, English-language)",
    focus: "Climate career transition — climate tech, climate science, applied projects",
    applyUrl: "https://www.climatebase.org/fellowship",
    rolling: false,
    cadence: "3–4 cohorts per year",
    tags: ["climatebase", "climate", "career-transition", "online", "global"],
  },
  {
    name: "Terra.do Climate Career Programs",
    organization: "Terra.do",
    organizationUrl: "https://terra.do/",
    description:
      "Online climate-education platform offering structured learning programs and a 3-month 'Learning for Action' climate fellowship. Designed for engineers, product managers, and researchers reskilling into climate tech, climate AI, and carbon markets. Alumni pipeline into Stripe Climate, Watershed, Convoy of Hope, and frontier climate startups. Live cohorts + recorded modules + project work.",
    stipend: "Tuition-based ($500–$2,000); some scholarships",
    duration: "3 months (Learning for Action); other programs 6–12 weeks",
    eligibility: "Engineers, PMs, researchers, operators reskilling into climate. Open globally.",
    location: "Online (global, English-language)",
    focus: "Climate AI, carbon markets, climate tech career transition",
    applyUrl: "https://terra.do/",
    rolling: true,
    cadence: "Multiple cohorts per year",
    tags: ["terra-do", "climate", "career-transition", "online", "global", "climate-ai"],
  },
  {
    name: "Eccentric Labs — Sui Builder Track",
    organization: "Eccentric Labs",
    organizationUrl: "https://eccentriclabs.co/",
    description:
      "Self-paced online curriculum for Sui-ecosystem builders, hosted on Eccentric Labs' learning platform. Complete the lesson track and graduates are evaluated for ecosystem funding. Eccentric Labs sources outlier founders and agent builders across Latin America, Africa, Southeast Asia, and Greater China — emerging-market talent is the stated wedge.",
    stipend: "Funding consideration on completion (amount not publicly disclosed)",
    duration: "Self-paced",
    eligibility: "Open globally; Eccentric Labs' sourcing focus is Latin America, Africa, Southeast Asia, and Greater China.",
    location: "Online (account required — gated Moodle platform)",
    focus: "Sui ecosystem builders — Move smart contracts, Sui dApps, ecosystem tooling",
    applyUrl: "https://sui.eccentriclabs.co/",
    rolling: true,
    cadence: "Rolling / self-paced",
    tags: ["sui", "eccentric-labs", "online", "learn-to-earn", "emerging-markets", "latam", "africa", "southeast-asia", "greater-china"],
  },

  // === Open-source contributor fellowships (added 2026-05-18) ===
  {
    name: "Flow Fellowship",
    organization: "Flow Research",
    organizationUrl: "https://flowresearch.tech/",
    description:
      "Unpaid open-source contribution fellowship — no stipend, no equity, no guaranteed job. 12-week cohort from Flow Research with five workstreams: Builder/Product (Harnessy agent harness, WorkStream incentive layer, Garden collaboration software, Jarvis knowledge-work agent), AI Research (decentralized training, neural computers, world models), Systems/Protocol (local-first, security, DePINs, crypto economics, blockchain + protocol engineering), Learning Content, and Creative/Media. Part-time friendly (~15–20 hrs/week). Compensation is mentorship, async + biweekly synchronous review, a public portfolio artifact, and points for accepted contributions toward Flow's long-term ecosystem. First cohort begins June 1, 2026; 12-week trial ends in Demo Week, then continues as a year-long contributor program.",
    stipend: "Unpaid — no stipend, no equity (points-only contribution path)",
    duration: "12-week trial cohort + year-long contributor program",
    eligibility:
      "Builders, researchers, educators, systems thinkers, and storytellers willing to ship public open-source work. No degree, prior research, or established profile required. Expected commitment ~15–20 hrs/week.",
    location: "Remote (worldwide; fully online program)",
    focus: "Open-source AI infrastructure, agentic systems, protocols, DePIN, crypto economics, learning + media",
    applyUrl:
      "https://docs.google.com/forms/d/e/1FAIpQLSfbqzu_My55Jk6Bar_R-VlNVYnRWUHVmEyBCe-4VBlXAEqz6g/viewform?usp=dialog",
    nextDeadline: "2026-06-01T00:00:00.000Z",
    rolling: false,
    cadence: "Cohort-based (first cohort starts 2026-06-01)",
    tags: ["flow-research", "open-source", "ai", "agents", "web3", "depin", "protocols", "remote", "unpaid"],
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
