/**
 * Run with: npx tsx scripts/seed-events-saastr-week.ts
 *
 * Seeds the SaaStr / Human+Tech / I/O week of events (May 11–16 2026) into
 * the Field Calendar as approved + published. Idempotent: matched by
 * payload->>'name' so re-running updates existing rows instead of duplicating.
 *
 * NOTE: explicitly-tagged [TEST] / (TEST) lu.ma stub entries are skipped.
 * All times converted from PDT (UTC-7) to UTC at write-time.
 */
import "dotenv/config";
import { and, eq, sql } from "drizzle-orm";
import { db, submissions } from "../src/lib/db";
import type { EventPayload } from "../src/lib/db/schema";

type SeedEvent = EventPayload & {
  /** Internal hint — not persisted; used for log readability only. */
  _day?: string;
};

const events: SeedEvent[] = [
  // ── Monday, May 11 ──────────────────────────────────────────────────
  {
    _day: "Mon",
    name: "Walk the streets that built SaaS | Founder’s SF tour @SaaStr AI’26",
    startsAt: "2026-05-11T16:30:00Z",
    endsAt: "2026-05-11T20:00:00Z",
    city: "San Mateo",
    country: "USA",
    url: "https://lu.ma/sf-founder-walk",
    description:
      "Presented by Sprinto. Hosted by Team Sprinto. A founder walking tour around SaaStr AI ’26.",
    eventType: "meetup",
  },
  {
    _day: "Mon",
    name: "ClawCamp @ Human+Tech Week: How OpenClaw & Personal Agents Increase Abilities + Launch Your Agent",
    startsAt: "2026-05-11T17:00:00Z",
    endsAt: "2026-05-12T00:00:00Z",
    city: "San Francisco",
    country: "USA",
    url: "https://lu.ma/clawcamp-human-tech",
    description:
      "Presented by ClawCamp.us. Hosted by ClawCamp Community, Human+Tech Week, Colin Nebius, Devinder Sodhi, Dave Nielsen, Marko Calvo-Cruz, Dr. Lucas Root, De Kai, Rayyan Zahid, Anand Vallamsetla.",
    eventType: "workshop",
  },
  {
    _day: "Mon",
    name: "Desafía SF Spring 2026 Demo Day",
    startsAt: "2026-05-12T00:30:00Z",
    endsAt: "2026-05-12T04:00:00Z",
    city: "San Francisco",
    country: "USA",
    url: "https://lu.ma/1aovajig",
    description: "Hosted by SOSA.",
    eventType: "other",
  },
  {
    _day: "Mon",
    name: "AI + Infrastructure Leaders Dinner in SF",
    startsAt: "2026-05-12T01:00:00Z",
    endsAt: "2026-05-12T04:00:00Z",
    city: "San Francisco",
    country: "USA",
    url: "https://lu.ma/tu0atvh0",
    description: "Hosted by Cleric.ai.",
    eventType: "meetup",
    priceTier: "invite",
  },
  {
    _day: "Mon",
    name: "The Initial Commit: Day 0 Welcome Party with Bessemer, Zetta & Zero Prime",
    startsAt: "2026-05-12T01:00:00Z",
    endsAt: "2026-05-12T04:00:00Z",
    city: "San Francisco",
    country: "USA",
    url: "https://lu.ma/0o8y6jdb",
    description:
      "Presented by AI Council. Hosted by Pete Soderling, Yang Tran, Bessemer, Apoorva Pandhi, Lauri Moore.",
    eventType: "meetup",
  },
  {
    _day: "Mon",
    name: "CMO & Marketing Leaders Roundtable Dinner",
    startsAt: "2026-05-12T01:30:00Z",
    endsAt: "2026-05-12T03:30:00Z",
    city: "San Francisco",
    country: "USA",
    url: "https://lu.ma/0ojy9hqr",
    description:
      "Presented by Omnibound AI. Hosted by Omnibound AI, Sahar Mor (Bond AI), Al Lalani, Akash Iyer.",
    eventType: "meetup",
    priceTier: "invite",
  },
  {
    _day: "Mon",
    name: "AI Comedy Night: Builder’s Confessions",
    startsAt: "2026-05-12T01:30:00Z",
    endsAt: "2026-05-12T05:00:00Z",
    venue: "Corgi offices, 425 Bush St floor 5",
    city: "San Francisco",
    country: "USA",
    url: "https://lu.ma/snz96e5m",
    description:
      "Presented by Tanagram Community Events. Hosted by Kaia, Paulina Laba, Feifan Zhou, Michael Ludden, Sahar Mor (Bond AI), Brooke LeBlanc.",
    eventType: "meetup",
  },
  {
    _day: "Mon",
    name: "New Cybernetic Esoterica",
    startsAt: "2026-05-12T02:00:00Z",
    endsAt: "2026-05-12T03:00:00Z",
    city: "San Francisco",
    country: "USA",
    url: "https://lu.ma/techgnosis",
    description:
      "Presented by tiat (the intersection of art & technology). Hosted by ash, Erik Davis, Megan Phipps.",
    eventType: "meetup",
  },

  // ── Tuesday, May 12 ─────────────────────────────────────────────────
  {
    _day: "Tue",
    name: "FC SF • Founders Run & Coffee!",
    startsAt: "2026-05-12T14:00:00Z",
    endsAt: "2026-05-12T16:00:00Z",
    city: "San Francisco",
    country: "USA",
    url: "https://lu.ma/2opylbqn",
    description:
      "Presented by Founders Common. Hosted by Founders Common, Nikki Heyder, Chris Ashley.",
    eventType: "meetup",
    priceTier: "free",
  },
  {
    _day: "Tue",
    name: "JSV Book Club: Runnin’ Down a Dream with Bill Gurley",
    startsAt: "2026-05-13T00:00:00Z",
    endsAt: "2026-05-13T03:00:00Z",
    city: "San Francisco",
    country: "USA",
    url: "https://lu.ma/t8ejcw9j",
    description: "Hosted by Jackson Square Ventures.",
    eventType: "meetup",
  },
  {
    _day: "Tue",
    name: "[May 12th] CMU Builder Demo Night & Founder Mixer at Foundation Capital (ft. Powell St)",
    startsAt: "2026-05-13T00:30:00Z",
    endsAt: "2026-05-13T04:00:00Z",
    city: "San Francisco",
    country: "USA",
    url: "https://lu.ma/c30s4ba3",
    description:
      "Presented by CMU T&E. Hosted by CMU Tech & Entrepreneurship, Kevin Fang, Leo Lu, Lanzo Small, Yas.",
    eventType: "meetup",
  },
  {
    _day: "Tue",
    name: "Vibe Your SaaS: Startup Pitch Competition + VC/Founder Mixer @ Entrepreneurs First",
    startsAt: "2026-05-13T00:30:00Z",
    endsAt: "2026-05-13T03:30:00Z",
    city: "San Francisco",
    country: "USA",
    url: "https://lu.ma/000fneuw",
    description:
      "Presented by Vibe Your SaaS // IRL. Hosted by Gregory Kennedy, Arjun Dev Arora.",
    eventType: "other",
  },
  {
    _day: "Tue",
    name: "Streaming the Future: Kafka & The Agentic Era",
    startsAt: "2026-05-13T00:30:00Z",
    endsAt: "2026-05-13T03:00:00Z",
    city: "San Francisco",
    country: "USA",
    url: "https://lu.ma/ub9sq0u5",
    description:
      "Presented by Aiven. Hosted by Hugh Evans, Florian from Aiven, Sahar Mor (Bond AI), Fahad Shah, Yingjun Wu, Emma Tian.",
    eventType: "meetup",
  },
  {
    _day: "Tue",
    name: "AI-pilled teams",
    startsAt: "2026-05-13T00:30:00Z",
    endsAt: "2026-05-13T03:00:00Z",
    city: "San Francisco",
    country: "USA",
    url: "https://lu.ma/aipilled",
    description:
      "Presented by PromptQL Events. Hosted by Rajoshi Ghosh, PromptQL Events, Abhishek, Sahar Mor (Bond AI).",
    eventType: "meetup",
  },
  {
    _day: "Tue",
    name: "After Hours at The Detour: AI Council x LangChain Interrupt Happy Hour",
    startsAt: "2026-05-13T01:00:00Z",
    endsAt: "2026-05-13T04:00:00Z",
    city: "San Francisco",
    country: "USA",
    url: "https://lu.ma/w2a5ugda",
    description: "Presented by MongoDB. Hosted by MongoDB.",
    eventType: "meetup",
  },
  {
    _day: "Tue",
    name: "SaaStr Week Founder Mixer 🍕🍺 Step Out. StepFun In.",
    startsAt: "2026-05-13T01:00:00Z",
    endsAt: "2026-05-13T04:00:00Z",
    city: "San Mateo",
    country: "USA",
    url: "https://lu.ma/4cqlswgf",
    description: "Presented by SEAMATE. Hosted by SEAMATE.",
    eventType: "meetup",
  },
  {
    _day: "Tue",
    name: "Tech Leaders Meetup with Qoder AI Coding",
    startsAt: "2026-05-13T01:00:00Z",
    endsAt: "2026-05-13T04:00:00Z",
    city: "San Jose",
    country: "USA",
    url: "https://lu.ma/qodermeetup",
    description: "Presented by AI Builders. Hosted by AI Builders, Qoder.",
    eventType: "meetup",
  },
  {
    _day: "Tue",
    name: "Women + AI: An SF Dinner Party Series, No. 3",
    startsAt: "2026-05-13T01:30:00Z",
    endsAt: "2026-05-13T03:30:00Z",
    city: "San Francisco",
    country: "USA",
    url: "https://lu.ma/aeo57uee",
    description: "Presented by Women + AI. Hosted by kylee lessard.",
    eventType: "meetup",
    priceTier: "invite",
  },

  // ── Wednesday, May 13 ───────────────────────────────────────────────
  {
    _day: "Wed",
    name: "Getting Started with OpenClaw: Workshop",
    startsAt: "2026-05-13T21:00:00Z",
    endsAt: "2026-05-14T00:00:00Z",
    city: "Sunnyvale",
    country: "USA",
    url: "https://lu.ma/may-openclaw-workshop",
    description:
      "Presented by TechEquity Ai - Silicon Valley. Hosted by TechEquity Ai, Sheena Tu, Mahan Soltanzadeh, Dave Nielsen.",
    eventType: "workshop",
  },
  {
    _day: "Wed",
    name: "Agent Building Day @ Corgi Cafe",
    startsAt: "2026-05-13T22:00:00Z",
    endsAt: "2026-05-14T03:00:00Z",
    city: "San Francisco",
    country: "USA",
    url: "https://lu.ma/b7kg8vno",
    description:
      "Hosted by Graham Cummings, natasha, Brooke LeBlanc, Laura Dang, Sahar Mor (Bond AI).",
    eventType: "workshop",
  },
  {
    _day: "Wed",
    name: "Reading Group (+🧋): Code Synthesis for Agentic Decision-Making: Code World Models and Autoharness",
    startsAt: "2026-05-13T22:00:00Z",
    endsAt: "2026-05-14T00:30:00Z",
    city: "San Francisco",
    country: "USA",
    url: "https://lu.ma/i3x1qxpm",
    description:
      "Presented by Snorkel AI Community Events. Hosted by David Burch, Incynthia Truong.",
    eventType: "meetup",
  },
  {
    _day: "Wed",
    name: "SF DEMO NIGHT 🚀 (w/ The AI Collective)",
    startsAt: "2026-05-14T00:30:00Z",
    endsAt: "2026-05-14T03:30:00Z",
    city: "San Francisco",
    country: "USA",
    url: "https://lu.ma/may-demo",
    description:
      "Presented by The AI Collective. Hosted by The AI Collective, Chappy Asel, Stephen Campbell, Ash Kumra, Adelina Martiniuc, Dmytro Spodarets, My Luu, Wanda Wang, Layan Khrais, Christopher O’Dore, Anthony Garcia, Ash K., Ravi Sharma, Roan Weigert, Yi Ding, Eric Fett, AWS Builder Loft, Human+Tech Week, Bill Raymond.",
    eventType: "meetup",
  },
  {
    _day: "Wed",
    name: "Research Meetup: Agentic Code (SF)",
    startsAt: "2026-05-14T00:30:00Z",
    endsAt: "2026-05-14T02:30:00Z",
    city: "San Francisco",
    country: "USA",
    url: "https://lu.ma/sf-agentic-code-meetup",
    description: "Hosted by Scale Events.",
    eventType: "meetup",
  },
  {
    _day: "Wed",
    name: "“LLMs War”, “AI in Blockchain / Retail” keynotes + Startup Pitches",
    startsAt: "2026-05-14T00:30:00Z",
    endsAt: "2026-05-14T03:30:00Z",
    city: "Palo Alto",
    country: "USA",
    url: "https://lu.ma/5jazoh37",
    description: "Presented by WeShine. Hosted by WeShine, Bernie K.",
    eventType: "conference",
  },
  {
    _day: "Wed",
    name: "Spirituality+AI: Building the Relational Infrastructure",
    startsAt: "2026-05-14T00:30:00Z",
    endsAt: "2026-05-14T04:30:00Z",
    city: "San Francisco",
    country: "USA",
    url: "https://lu.ma/8rhqg24d",
    description:
      "Hosted by Anna Spisak, Human+Tech Week, Doruk Kurt, Stacey Lawson, Alexis Hamill, Compassion 2.0, Eddy Vaisberg, Nazar, Positive AI Labs, Giselle Tomimbang-Mercado, Jonatan Littke, Flourishing Systems Foundation.",
    eventType: "meetup",
  },
  {
    _day: "Wed",
    name: "Uncorked: Reversed Pitch at a Winery (Unofficial SaaStr side event)",
    startsAt: "2026-05-14T00:30:00Z",
    endsAt: "2026-05-14T03:30:00Z",
    city: "Redwood City",
    country: "USA",
    url: "https://lu.ma/nrgih27n",
    description:
      "Presented by Salesbricks. Hosted by Lani Rich, Jiefry Loremas, Team Sprinto, Karishma Bali, Austin Madden.",
    eventType: "meetup",
  },
  {
    _day: "Wed",
    name: "UAtech Venture Night @ Saastr Annual – The Ultimate Startup & Investor Experience!",
    startsAt: "2026-05-14T01:00:00Z",
    endsAt: "2026-05-14T04:00:00Z",
    city: "San Mateo",
    country: "USA",
    url: "https://lu.ma/SF_May26",
    description:
      "Presented by UAtech.events. Hosted by UAtech.events, Catalyst Bay, Volodymyr Demianenko, Reply, SurveyMonkey, Nazar Gulyk, Anna Shchehula, Juliana C, Yurii Filipchuk, Alina Blyzniuk, Yevgeniy Drobot, C UKRAINE SAN FRANCISCO, Consulate General of Ukraine in SF.",
    eventType: "meetup",
  },
  {
    _day: "Wed",
    name: "Databricks @ AI Council26 Networking Event",
    startsAt: "2026-05-14T01:00:00Z",
    endsAt: "2026-05-14T04:00:00Z",
    city: "San Francisco",
    country: "USA",
    url: "https://lu.ma/tbgqqhp3",
    description:
      "Presented by Databricks Community. Hosted by Lizzie S, Denny Lee, Josh Lillie, Pete Soderling, Brooke.",
    eventType: "meetup",
  },
  {
    _day: "Wed",
    name: "Fin x Metronome: Pricing Strategies for AI Agents",
    startsAt: "2026-05-14T01:00:00Z",
    endsAt: "2026-05-14T04:00:00Z",
    city: "San Francisco",
    country: "USA",
    url: "https://lu.ma/finxmetronome",
    description:
      "Presented by Fin. Hosted by Kelly Farrell, Chen-Chen from Intercom, Metronome Events.",
    eventType: "meetup",
  },
  {
    _day: "Wed",
    name: "SPC Demo Night",
    startsAt: "2026-05-14T01:30:00Z",
    endsAt: "2026-05-14T04:00:00Z",
    city: "San Francisco",
    country: "USA",
    url: "https://lu.ma/rwkc1a72",
    description: "Presented by South Park Commons. Hosted by South Park Commons, Gopal Raman.",
    eventType: "meetup",
  },

  // ── Thursday, May 14 ────────────────────────────────────────────────
  {
    _day: "Thu",
    name: "Agents & Bagels: Interrupt’26 + SaaStr Breakfast",
    startsAt: "2026-05-14T15:00:00Z",
    endsAt: "2026-05-14T16:00:00Z",
    city: "San Francisco",
    country: "USA",
    url: "https://lu.ma/blsf0q7p",
    description:
      "Presented by Scalekit. Hosted by Tamilselvi Ramasamy, Sahar Mor (Bond AI), Adam Chan, Shrimithran, AI+, Amy Quan.",
    eventType: "meetup",
  },
  {
    _day: "Thu",
    name: "Agent Builders Breakfast - Founders & Builders in SOMA, SF",
    startsAt: "2026-05-14T15:00:00Z",
    endsAt: "2026-05-14T16:30:00Z",
    city: "San Francisco",
    country: "USA",
    url: "https://lu.ma/nhvmcczj",
    description: "Hosted by Michael Ducker.",
    eventType: "meetup",
  },
  {
    _day: "Thu",
    name: "Bring OpenClaw Into Your Mobile and Web App — Live Workshop, San Francisco",
    startsAt: "2026-05-14T16:30:00Z",
    endsAt: "2026-05-15T00:00:00Z",
    city: "San Francisco",
    country: "USA",
    url: "https://lu.ma/7x7jsej2",
    description:
      "Presented by Bond AI - San Francisco and Bay Area. Hosted by mesibo, Sahar Mor (Bond AI).",
    eventType: "workshop",
  },
  {
    _day: "Thu",
    name: "Hello World Launch Party by Anything",
    startsAt: "2026-05-14T20:00:00Z",
    endsAt: "2026-05-15T00:00:00Z",
    city: "San Francisco",
    country: "USA",
    url: "https://lu.ma/h06u0dux",
    description: "Presented by Anything. Hosted by Ariella.",
    eventType: "meetup",
  },
  {
    _day: "Thu",
    name: "2026 Saastr AI Demo Day & After Party",
    startsAt: "2026-05-14T20:30:00Z",
    endsAt: "2026-05-15T00:00:00Z",
    city: "San Francisco",
    country: "USA",
    url: "https://lu.ma/saastr2026",
    description:
      "Presented by FounderGro Events. Hosted by EpicConnector, Josh Norris, Sahar Mor (Bond AI), asuka, Frontier Tower, Susana Bao, Sophie Suo, Winni Chen.",
    eventType: "other",
  },
  {
    _day: "Thu",
    name: "The CFO Playbook for Value Creation in a Volatile Market",
    startsAt: "2026-05-15T00:00:00Z",
    endsAt: "2026-05-15T02:30:00Z",
    city: "Menlo Park",
    country: "USA",
    url: "https://lu.ma/n6q6vmi2",
    description:
      "Presented by The CFO Community. Hosted by Murray, Armello Rodriguez, Christina Bui, Louis Lehot, Bernard Mendoza, Sabrina Ritchie.",
    eventType: "meetup",
  },
  {
    _day: "Thu",
    name: "CoCo Labs - Bay Area Snowflake User Group",
    startsAt: "2026-05-15T00:00:00Z",
    endsAt: "2026-05-15T03:00:00Z",
    city: "Menlo Park",
    country: "USA",
    url: "https://lu.ma/i78wufyv",
    description: "Presented by Silicon Valley AI Hub. Hosted by Silicon Valley AI Hub.",
    eventType: "meetup",
  },
  {
    _day: "Thu",
    name: "GitTogether (AI-First Event) + Free Swags",
    startsAt: "2026-05-15T00:30:00Z",
    endsAt: "2026-05-15T03:30:00Z",
    city: "San Francisco",
    country: "USA",
    url: "https://lu.ma/lr79szro",
    description: "Hosted by Neha Gupta, Keploy Inc, Sahar Mor (Bond AI), Prad.",
    eventType: "meetup",
  },
  {
    _day: "Thu",
    name: "Hello, Operator: A product launch from Fin",
    startsAt: "2026-05-15T00:30:00Z",
    endsAt: "2026-05-15T03:30:00Z",
    city: "San Francisco",
    country: "USA",
    url: "https://lu.ma/customer-agent",
    description: "Presented by Fin. Hosted by Liam Keegan.",
    eventType: "meetup",
  },
  {
    _day: "Thu",
    name: "AI Healthtech Night",
    startsAt: "2026-05-15T01:00:00Z",
    endsAt: "2026-05-15T03:30:00Z",
    city: "San Francisco",
    country: "USA",
    url: "https://lu.ma/yjw3kqez",
    description:
      "Presented by Workato Developer Events. Hosted by Emily, Workato, Leila Rishniw, Workato, Arjun Subedi.",
    eventType: "meetup",
  },
  {
    _day: "Thu",
    name: "AI x Single-cell Biology Reading Group",
    startsAt: "2026-05-15T01:00:00Z",
    endsAt: "2026-05-15T04:00:00Z",
    city: "San Francisco",
    country: "USA",
    url: "https://lu.ma/scpifdyp",
    description:
      "Hosted by Kenny Workman, Kyle Giffin, Zhen Yang, Harihara Subrahmaniam Muralidharan.",
    eventType: "meetup",
  },
  {
    _day: "Thu",
    name: "The Sound of Intelligent AI – Palo Alto Happy Hour",
    startsAt: "2026-05-15T01:00:00Z",
    endsAt: "2026-05-15T04:00:00Z",
    city: "Palo Alto",
    country: "USA",
    url: "https://lu.ma/6sazx5iw",
    description: "Presented by Centific. Hosted by David No, Abhishek Mukherji.",
    eventType: "meetup",
  },

  // ── Friday, May 15 ──────────────────────────────────────────────────
  {
    _day: "Fri",
    name: "What GTM Support Should Founders Expect from Investors, Big Tech and Advisors?",
    startsAt: "2026-05-15T21:00:00Z",
    endsAt: "2026-05-16T00:00:00Z",
    city: "Los Altos Hills",
    country: "USA",
    url: "https://lu.ma/8byko77w",
    description:
      "Presented by Eminence Tea House. Hosted by Eminence Tea House, Emma Wang, Sahar Mor (Bond AI), Wade Song, Warren Li, Jason Liang, Kelly at Buda AI.",
    eventType: "meetup",
  },
  {
    _day: "Fri",
    name: "Building the Future: AI, Startup Cities & the Next Era of Human Potential (SF)",
    startsAt: "2026-05-15T21:00:00Z",
    endsAt: "2026-05-16T00:30:00Z",
    city: "San Francisco",
    country: "USA",
    url: "https://lu.ma/LightDAOHTW",
    description:
      "Presented by Light DAO. Hosted by Ruby Yeh, Payam Safa, Human+Tech Week.",
    eventType: "meetup",
  },
  {
    _day: "Fri",
    name: "Stop Building Goldfish Agents: Build Real Memory with Oracle AI Database and LangChain",
    startsAt: "2026-05-16T00:00:00Z",
    endsAt: "2026-05-16T04:00:00Z",
    city: "San Francisco",
    country: "USA",
    url: "https://lu.ma/p8d635rz",
    description:
      "Presented by San Francisco MLOps Community. Hosted by MLOps Community, Rahul Parundekar, Yelaine Wang, Casius Lee.",
    eventType: "meetup",
  },

  // ── Saturday, May 16 ────────────────────────────────────────────────
  {
    _day: "Sat",
    name: "Scrappy (AI) Founders Go Hard Hiking",
    startsAt: "2026-05-16T15:30:00Z",
    endsAt: "2026-05-16T23:00:00Z",
    city: "San Francisco",
    country: "USA",
    url: "https://lu.ma/27fq3ner",
    description:
      "Presented by 12 Scrappy Founders. Hosted by Denis Belyavsky, Alena Beliauskaya.",
    eventType: "meetup",
  },
  {
    _day: "Sat",
    name: "Notion Developer Platform Hackathon",
    // Multi-day: ends May 17 3:30 PM PDT
    startsAt: "2026-05-16T16:00:00Z",
    endsAt: "2026-05-17T22:30:00Z",
    city: "San Francisco",
    country: "USA",
    url: "https://lu.ma/fyuf7",
    description: "Presented by Notion. Hosted by Lexi Horwitz.",
    eventType: "hackathon",
  },
  {
    _day: "Sat",
    name: "Agent Forge AI Hackathon",
    startsAt: "2026-05-16T17:00:00Z",
    endsAt: "2026-05-17T01:00:00Z",
    city: "Sunnyvale",
    country: "USA",
    url: "https://lu.ma/agentforge",
    description:
      "Presented by AI Builders. Hosted by AI Builders, Meng Du, Beta Fund, Oktay Goktas, Nosana, Zeabur, Qoder.",
    eventType: "hackathon",
  },
  {
    _day: "Sat",
    name: "Hackathon: Building your own Agent LLM Wiki",
    startsAt: "2026-05-16T19:00:00Z",
    endsAt: "2026-05-17T01:00:00Z",
    city: "San Francisco",
    country: "USA",
    url: "https://lu.ma/uhda61yp",
    description:
      "Presented by cognee. Hosted by cognee, Nicole Levin, Pebblebed VC, Sahar Mor (Bond AI), Marie Owens.",
    eventType: "hackathon",
  },
  {
    _day: "Sat",
    name: "AI Native Developers Meetup | Google I/O Week",
    startsAt: "2026-05-16T21:30:00Z",
    endsAt: "2026-05-17T01:30:00Z",
    city: "Sunnyvale",
    country: "USA",
    url: "https://lu.ma/ai-native-developers-io-week",
    description: "Presented by SEAMATE. Hosted by SEAMATE, Subotiz, Linkloud.",
    eventType: "meetup",
  },
];

async function upsertEvent(raw: SeedEvent) {
  // Strip the `_day` log-only hint before persisting.
  const { _day, ...payload } = raw;

  const eventStartsAt = new Date(payload.startsAt);

  const existing = await db
    .select({ id: submissions.id, publicId: submissions.publicId })
    .from(submissions)
    .where(
      and(
        eq(submissions.type, "event"),
        sql`${submissions.payload}->>'name' = ${payload.name}`,
      ),
    )
    .limit(1);

  if (existing.length > 0) {
    const [row] = await db
      .update(submissions)
      .set({
        payload,
        eventStartsAt,
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
      type: "event",
      status: "approved",
      payload,
      eventStartsAt,
      publishedAt: new Date(),
    })
    .returning({ publicId: submissions.publicId });
  return { action: "inserted" as const, publicId: row.publicId };
}

async function main() {
  let inserted = 0;
  let updated = 0;
  for (const e of events) {
    const r = await upsertEvent(e);
    if (r.action === "inserted") inserted++;
    else updated++;
    console.log(`  [${e._day}] ${r.action.padEnd(8)} /events/${r.publicId}  ${e.name}`);
  }
  console.log(
    `\n✓ ${events.length} events processed (${inserted} new, ${updated} updated).`,
  );
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
