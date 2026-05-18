import Link from "next/link";
import type { Metadata } from "next";
import { PublicShell } from "@/components/public-shell";
import { Chip } from "./_lanes/_shared";
import { PrizePoolBanner, SignalsLane } from "./_lanes/signals";
import { AcceleratorsLane } from "./_lanes/accelerators";
import { FellowshipsLane } from "./_lanes/fellowships";
import { GrantsLane } from "./_lanes/grants";
import { CapitalLane } from "./_lanes/capital";
import { PerksLane } from "./_lanes/perks";
import { CitiesLane } from "./_lanes/cities";
import { ResidenciesLane } from "./_lanes/residencies";

export const dynamic = "force-dynamic";

type Lane =
  | "signals"
  | "accelerators"
  | "fellowships"
  | "grants"
  | "cities"
  | "capital"
  | "residencies"
  | "perks";

const LANES: { id: Lane; label: string }[] = [
  { id: "signals", label: "Signals" },
  { id: "accelerators", label: "Accel" },
  { id: "fellowships", label: "Fellowships" },
  { id: "grants", label: "Grants" },
  { id: "capital", label: "Capital" },
  { id: "perks", label: "Perks" },
  { id: "cities", label: "Cities" },
  { id: "residencies", label: "Residencies" },
];

const LANE_COPY: Record<
  Lane,
  {
    kicker: string;
    title: string;
    subtitle: string;
    classification: { text: string; show?: "sm" }[];
    submitHref?: string;
    submitLabel?: string;
  }
> = {
  signals: {
    kicker: "▸ Intel Wire",
    title: "What the field is reporting.",
    subtitle:
      "Tips, sightings and analyst-flagged signals. Reviewed by RexIntel before publication. Anonymous sources welcome.",
    classification: [
      { text: "● Open Channel // Intel Wire" },
      { text: "Approved Submissions / Live", show: "sm" },
    ],
    submitHref: "/submit",
    submitLabel: "Drop intel ▸",
  },
  accelerators: {
    kicker: "▸ Intel · Accelerators",
    title: "Programs worth applying to.",
    subtitle:
      "Accelerators and incubators currently accepting applications — crypto-native programs and broader founder cohorts. Curated by RexIntel.",
    classification: [
      { text: "● Open Channel // Intel · Acceleration Programs" },
      { text: "Cohort Intake / Founders + Builders", show: "sm" },
    ],
    submitHref: "/submit?type=accelerator",
    submitLabel: "+ Add Program ▸",
  },
  fellowships: {
    kicker: "▸ Intel · Fellowships",
    title: "Stipends for builders + researchers.",
    subtitle:
      "Funded fellowships across crypto protocols, AI research, security, and frontier tech — Thiel, EPF, Schmidt, Anthropic Fellows and similar. Stipend, no equity.",
    classification: [
      { text: "● Open Channel // Intel · Fellowship Programs" },
      { text: "Stipend Cohorts / Apply", show: "sm" },
    ],
    submitHref: "/submit?type=fellowship",
    submitLabel: "+ Add Fellowship ▸",
  },
  grants: {
    kicker: "▸ Intel · Grants",
    title: "Capital for builders.",
    subtitle:
      "Active grant programs from protocols, foundations, and public-goods initiatives. Curated by RexIntel.",
    classification: [
      { text: "● Open Channel // Intel · Capital Allocation" },
      { text: "Active Grant Programs", show: "sm" },
    ],
    submitHref: "/submit?type=grant",
    submitLabel: "+ Add Grant ▸",
  },
  cities: {
    kicker: "▸ Intel · Pop-Up Cities",
    title: "Show up, build together.",
    subtitle:
      "Multi-week residencies — Zuzalu, Edge City, Crecimiento and the next generation of pop-up gatherings. Application-based intake.",
    classification: [
      { text: "● Open Channel // Intel · Pop-Up Residencies" },
      { text: "Multi-week Gatherings / Apply", show: "sm" },
    ],
    submitHref: "/submit?type=popup_city",
    submitLabel: "+ Add City ▸",
  },
  capital: {
    kicker: "▸ Intel · Capital",
    title: "Funds taking cold pitches.",
    subtitle:
      "Pre-seed and early-stage VC funds with public pitch portals. Rolling intake, equity checks, real first-check leads — not cohort programs. Curated by RexIntel.",
    classification: [
      { text: "● Open Channel // Intel · Capital Allocation" },
      { text: "Open Funds / Cold Pitch Portals", show: "sm" },
    ],
  },
  residencies: {
    kicker: "▸ Intel · Residencies",
    title: "Programs that put builders in a room together.",
    subtitle:
      "Multi-week founder + builder residencies — cohort retreats, themed sprints, application-based intake. Distinct from pop-up cities (festivals) and accelerators (equity checks).",
    classification: [
      { text: "● Open Channel // Intel · Builder Residencies" },
      { text: "Cohort Retreats / Apply", show: "sm" },
    ],
    submitHref: "/submit?type=residency",
    submitLabel: "+ Add Residency ▸",
  },
  perks: {
    kicker: "▸ Intel · Perks",
    title: "Free credits + builder discounts.",
    subtitle:
      "Infra credits, cloud perks, and vendor programs — what builders can claim without giving up equity or cash. Curated by RexIntel.",
    classification: [
      { text: "● Open Channel // Intel · Builder Perks" },
      { text: "Credits + Vendor Programs", show: "sm" },
    ],
    submitHref: "/submit?type=perks",
    submitLabel: "+ Add Perk ▸",
  },
};

function laneFrom(value: string | undefined): Lane {
  if (
    value === "accelerators" ||
    value === "fellowships" ||
    value === "grants" ||
    value === "cities" ||
    value === "capital" ||
    value === "residencies" ||
    value === "perks"
  ) {
    return value;
  }
  return "signals";
}

export function generateMetadata({
  searchParams,
}: {
  searchParams: { lane?: string };
}): Metadata {
  const lane = laneFrom(searchParams.lane);
  const copy = LANE_COPY[lane];
  const titles: Record<Lane, string> = {
    signals: "Intel Wire — Rex Intel Services",
    accelerators: "Accelerators — Intel · Rex Intel Services",
    fellowships: "Fellowships — Intel · Rex Intel Services",
    grants: "Grants — Intel · Rex Intel Services",
    cities: "Pop-Up Cities — Intel · Rex Intel Services",
    capital: "Capital — Funds taking pitches · Rex Intel Services",
    residencies: "Residencies — Intel · Rex Intel Services",
    perks: "Perks — Credits + Vendor Programs · Rex Intel Services",
  };
  // Canonical points to the lane URL only — strip filter/severity/category/view
  // params so SERPs treat all filter combinations as the same canonical page.
  const canonical = lane === "signals" ? "/intel" : `/intel?lane=${lane}`;
  return {
    title: titles[lane],
    description: copy.subtitle,
    alternates: { canonical },
    openGraph: {
      title: titles[lane],
      description: copy.subtitle,
      type: "website",
    },
  };
}

export default async function IntelHubPage({
  searchParams,
}: {
  searchParams: {
    lane?: string;
    severity?: string;
    category?: string;
    filter?: string;
    view?: string;
    sector?: string;
    soon?: string;
    minUsd?: string;
  };
}) {
  const lane = laneFrom(searchParams.lane);
  const copy = LANE_COPY[lane];

  return (
    <PublicShell classification={copy.classification}>
      <main className="max-w-4xl mx-auto px-6 pt-8 md:pt-14 pb-24">
        <div className="mb-8 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
          <div>
            <p
              className="text-xs uppercase tracking-widest mb-2"
              style={{ color: "var(--rex-text-dim)" }}
            >
              {copy.kicker}
            </p>
            <h1 className="font-display text-4xl md:text-5xl font-semibold tracking-tight text-white mb-3">
              {copy.title}
            </h1>
            <p className="text-sm md:text-base text-[var(--rex-text-muted)] max-w-xl leading-relaxed">
              {copy.subtitle}
            </p>
            {lane === "signals" && (
              <div className="mt-3">
                <a
                  href="/intel/feed.xml"
                  className="text-[10px] font-mono uppercase tracking-widest text-[var(--rex-text-dim)] hover:text-[var(--rex-accent)] transition-colors"
                >
                  ⌁ RSS
                </a>
              </div>
            )}
          </div>
          {copy.submitHref && (
            <Link href={copy.submitHref} className="rex-btn whitespace-nowrap">
              {copy.submitLabel ?? "+ Submit ▸"}
            </Link>
          )}
        </div>

        <LaneTabs active={lane} />

        {lane === "signals" && <PrizePoolBanner />}

        {lane === "signals" && (
          <SignalsLane
            sevFilter={searchParams.severity}
            catFilter={searchParams.category}
            view={searchParams.view}
          />
        )}
        {lane === "accelerators" && (
          <AcceleratorsLane
            filter={searchParams.filter}
            sector={searchParams.sector}
            soon={searchParams.soon}
            minUsd={searchParams.minUsd}
          />
        )}
        {lane === "fellowships" && (
          <FellowshipsLane
            filter={searchParams.filter}
            sector={searchParams.sector}
            soon={searchParams.soon}
            minUsd={searchParams.minUsd}
          />
        )}
        {lane === "grants" && (
          <GrantsLane
            filter={searchParams.filter}
            sector={searchParams.sector}
            soon={searchParams.soon}
          />
        )}
        {lane === "capital" && (
          <CapitalLane
            filter={searchParams.filter}
            sector={searchParams.sector}
          />
        )}
        {lane === "residencies" && (
          <ResidenciesLane
            view={searchParams.view}
            sector={searchParams.sector}
            soon={searchParams.soon}
          />
        )}
        {lane === "perks" && (
          <PerksLane filter={searchParams.filter} soon={searchParams.soon} />
        )}
        {lane === "cities" && (
          <CitiesLane
            view={searchParams.view}
            sector={searchParams.sector}
            soon={searchParams.soon}
          />
        )}
      </main>
    </PublicShell>
  );
}

function LaneTabs({ active }: { active: Lane }) {
  return (
    <div className="flex flex-wrap items-center gap-2 mb-6 text-xs font-mono">
      <span
        className="uppercase tracking-widest"
        style={{ color: "var(--rex-text-dim)" }}
      >
        LANE ▸
      </span>
      {LANES.map((l) => {
        const href = l.id === "signals" ? "/intel" : `/intel?lane=${l.id}`;
        return (
          <Chip key={l.id} href={href} active={active === l.id}>
            {l.label}
          </Chip>
        );
      })}
    </div>
  );
}
