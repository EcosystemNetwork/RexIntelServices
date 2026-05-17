/**
 * Run with: npx tsx scripts/seed-popup-cities.ts
 *
 * Seeds upcoming pop-up city residencies into /pop-up-cities. Sourced from
 * edgecity.live (scraped 2026-05-10) plus public knowledge of the
 * Crecimiento and Network School programs.
 *
 * Only includes events with confirmed dates as of seed time. Past
 * pop-ups are excluded — they don't help discovery and they re-publish
 * automatically if a moderator approves a community submission later.
 *
 * Idempotent: name-match upsert.
 */
import "dotenv/config";
import { and, eq, sql } from "drizzle-orm";
import { db, submissions } from "../src/lib/db";
import type { PopupCityPayload } from "../src/lib/db/schema";

const cities: PopupCityPayload[] = [
  {
    name: "Edge Esmeralda 2026",
    organization: "Edge City",
    organizationUrl: "https://www.edgecity.live/",
    description:
      "Month-long pop-up village in Healdsburg, California — 1,000+ people from the frontiers of tech, science, culture, and policy living and building together. Programming runs in four weekly themes: Protocols for Flourishing (longevity, bio, neuro), Intelligence & Autonomy (AI, governance, d/acc), Emergent Futures & World Building (decentralized tech, creative AI, spatial computing), and Environments of Tomorrow (new urbanism, energy, climate, food). Application-based; pricing rises monthly so earlier apps fare better.",
    startsAt: "2026-05-30T12:00:00Z",
    endsAt: "2026-06-27T12:00:00Z",
    city: "Healdsburg",
    country: "United States",
    url: "https://www.edgeesmeralda.com/",
    applyUrl: "https://edgeesmeralda.simplefi.tech/auth",
    // Pricing rises monthly; effective application cutoff is kickoff day.
    applicationDeadline: "2026-05-29T23:59:00Z",
    focus: "Longevity, AI, d/acc, urbanism, frontier tech",
    tags: ["edge-city", "frontier-tech", "longevity", "ai", "d-acc"],
  },
  {
    name: "Network School",
    organization: "Network School / Balaji Srinivasan",
    organizationUrl: "https://network.school/",
    description:
      "Recurring 3-month pop-up education community from Balaji Srinivasan. Founders, technologists, and operators living and learning together in Forest City. Application-based.",
    startsAt: "2026-09-01T12:00:00Z",
    endsAt: "2026-11-30T12:00:00Z",
    city: "Forest City",
    country: "Malaysia",
    url: "https://network.school/",
    applyUrl: "https://network.school/",
    // Sequential 3-month cohorts accept applications continuously.
    rolling: true,
    focus: "Network states, founders, fitness, tech",
    tags: ["network-state", "founders"],
  },
  {
    name: "Aleph 2026 (Crecimiento)",
    organization: "Crecimiento",
    organizationUrl: "https://www.crecimiento.build/",
    description:
      "Aleph March '26 — recurring pop-up city in Buenos Aires from the Crecimiento movement positioning Argentina as a crypto + AI hub. Programmed by vertical, with hackathons, demo days, and investor office hours; Aleph Hub is the central venue with partner-community activations across the city. Applications are open on the Crecimiento Platform; Citizens get instant confirmation, Tourists are approval-gated.",
    startsAt: "2026-03-01T12:00:00Z",
    endsAt: "2026-03-31T12:00:00Z",
    city: "Buenos Aires",
    country: "Argentina",
    url: "https://aleph.crecimiento.build/",
    applyUrl: "https://aleph.crecimiento.build/",
    focus: "Frontier tech, crypto, AI, Latin America",
    tags: ["crecimiento", "buenos-aires", "latam", "crypto", "ai"],
  },
  {
    name: "Vitalia Roatán — March 2026",
    organization: "Vitalia",
    organizationUrl: "https://www.vitalia.city/",
    description:
      "Month-long pop-up city for longevity biotech, frontier health, and life-extension research in Próspera (a special economic zone on Roatán, Honduras). Brings founders, scientists, and engineers from ideation to early-stage fundraising in biotech, quantified-self, health delivery, web3, and crypto. Direct 2.5h flights from Miami / Houston. Self-funded participants budget ~$2-5k/month; need-based support available via the Ambassador program.",
    startsAt: "2026-03-01T12:00:00Z",
    endsAt: "2026-03-31T12:00:00Z",
    city: "Roatán",
    country: "Honduras",
    venue: "Próspera Zone, Roatán Island",
    url: "https://www.vitalia.city/",
    applyUrl: "https://www.vitalia.city/",
    focus: "Longevity biotech, life extension, frontier health",
    tags: ["vitalia", "longevity", "biotech", "prospera", "honduras"],
  },

  // === Added 2026-05-17 — rolling / continuous pop-up villages ===
  // Date fields omitted intentionally: these are recurring brands without
  // an announced 2026/2027 edition at time of seed. Re-verify quarterly.
  {
    name: "Edge City Patagonia",
    organization: "Edge City",
    organizationUrl: "https://www.edgecity.live/",
    description:
      "Month-long pop-up village in the Andes — builders, researchers, and creators prototyping new ways of living, working, and building. Continues the Zuzalu / Edge City ecosystem alongside Edge Esmeralda. 2025 edition ran Oct 18 – Nov 15; 2026/2027 dates announced on edgecity.live/patagonia.",
    city: "Patagonia",
    country: "Argentina",
    url: "https://www.edgecity.live/patagonia",
    applyUrl: "https://www.edgecity.live/patagonia",
    rolling: true,
    focus: "Frontier tech, longevity, builders — pop-up city",
    tags: ["edge-city", "patagonia", "zuzalu", "pop-up", "frontier"],
  },
  {
    name: "AGI House Hillsborough",
    organization: "AGI House",
    organizationUrl: "https://agihouse.org/",
    description:
      "Continuous-cohort residency hub in Hillsborough, CA — AGI House's flagship Bay Area location. Hosts AI founder events, hackathons, and a rotating in-house residency community. Founded by Jeremy Nixon and Andrej Karpathy. Distinct from the structured AGI House Fellowship — this is the always-on co-living + events surface.",
    city: "Hillsborough",
    country: "United States",
    venue: "AGI House",
    url: "https://agihouse.org/",
    applyUrl: "https://agihouse.org/",
    rolling: true,
    focus: "Frontier AI founders + researchers",
    tags: ["agi-house", "ai", "sf", "pop-up", "merit-based"],
  },
  {
    name: "Foresight Residency",
    organization: "Foresight Institute",
    organizationUrl: "https://foresight.org/residency/",
    description:
      "Long-running Bay Area pop-up residency for researchers and builders at the frontier of longevity, neurotech, intelligent cooperation, and existential hope. Foresight Institute hosts multi-week cohorts with workshops, salons, and 1:1 collaborations between technical practitioners and philosophers. Application-gated.",
    city: "San Francisco",
    country: "United States",
    url: "https://foresight.org/residency/",
    applyUrl: "https://foresight.org/residency/",
    rolling: true,
    focus: "Longevity, neurotech, AI safety, existential hope",
    tags: ["foresight", "longevity", "neurotech", "ai-safety", "sf"],
  },
  {
    name: "Crecimiento Buenos Aires",
    organization: "Crecimiento",
    organizationUrl: "https://crecimiento.build/",
    description:
      "Continuous LATAM pop-up community out of Buenos Aires running multiple themed editions per year (Aleph in March, Devconnect-style satellites). Crecimiento's mandate: turn Argentina into the crypto + AI builder capital of South America. Hub + edition calendar at crecimiento.build.",
    city: "Buenos Aires",
    country: "Argentina",
    url: "https://crecimiento.build/",
    applyUrl: "https://crecimiento.build/",
    rolling: true,
    focus: "Crypto + AI builders — LATAM hub",
    tags: ["crecimiento", "argentina", "latam", "crypto", "ai", "aleph"],
  },
  {
    name: "Zuzalu Network",
    organization: "Zuzalu",
    organizationUrl: "https://www.zuzalu.city/",
    description:
      "Network of pop-up villages descended from the original 2023 Zuzalu in Montenegro. ~20 independent groups now run themed pop-ups under the Zuzalu banner across longevity, ZK, AI safety, and decentralized governance. Discovery via zuzalu.city + the Zuzalu City directory.",
    url: "https://www.zuzalu.city/",
    applyUrl: "https://www.zuzalu.city/",
    rolling: true,
    focus: "Decentralized network of themed pop-up villages",
    tags: ["zuzalu", "network", "pop-up", "longevity", "zk", "ai-safety"],
  },
];

async function upsert(payload: PopupCityPayload) {
  const eventStartsAt = payload.startsAt ? new Date(payload.startsAt) : null;
  const eventEndsAt = payload.endsAt ? new Date(payload.endsAt) : null;
  const existing = await db
    .select({ id: submissions.id, publicId: submissions.publicId })
    .from(submissions)
    .where(
      and(
        eq(submissions.type, "popup_city"),
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
        eventEndsAt,
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
      type: "popup_city",
      status: "approved",
      payload,
      eventStartsAt,
      eventEndsAt,
      publishedAt: new Date(),
    })
    .returning({ publicId: submissions.publicId });
  return { action: "inserted" as const, publicId: row.publicId };
}

async function main() {
  let inserted = 0;
  let updated = 0;
  for (const c of cities) {
    const r = await upsert(c);
    if (r.action === "inserted") inserted++;
    else updated++;
    console.log(`  ${r.action.padEnd(8)} /pop-up-cities/${r.publicId}  ${c.name}`);
  }
  console.log(
    `\n✓ ${cities.length} pop-up cities processed (${inserted} new, ${updated} updated).`,
  );
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
