import type {
  ClearanceTier,
  ContributionEventKind,
} from "./db/schema";

// Intel payload kind taxonomy lives in lib/intel-types; we redeclare the
// minimal shape here to avoid pulling pg-core/drizzle into modules that only
// need the points-mapping logic.
type IntelKind = "tip" | "original" | "incident";

// Tier thresholds — the minimum cumulative `points` needed for each tier.
// Tuned for the 90-day wedge plan: contributor is one-and-done so wallet
// connection actually *unlocks* something; trusted requires sustained value
// (a few accepted incidents or many accepted tips); inner_circle is rare
// (handful of contributors at any given time).
export const TIER_THRESHOLDS: Record<ClearanceTier, number> = {
  open: 0,
  contributor: 1,
  trusted: 50,
  inner_circle: 250,
};

// Strict ordering for tier comparisons. Indices encode "higher tier = greater
// number" — use `tierRank()` rather than reaching into this array directly.
const TIER_ORDER: ClearanceTier[] = [
  "open",
  "contributor",
  "trusted",
  "inner_circle",
];

export function tierRank(tier: ClearanceTier): number {
  return TIER_ORDER.indexOf(tier);
}

export function meetsTier(
  current: ClearanceTier,
  required: ClearanceTier,
): boolean {
  return tierRank(current) >= tierRank(required);
}

export function tierForPoints(points: number): ClearanceTier {
  // Walk from highest to lowest; first threshold met wins.
  if (points >= TIER_THRESHOLDS.inner_circle) return "inner_circle";
  if (points >= TIER_THRESHOLDS.trusted) return "trusted";
  if (points >= TIER_THRESHOLDS.contributor) return "contributor";
  return "open";
}

// Points awarded for each accepted contribution kind. Weights match the
// "scarcity > volume" memory: incidents pay 50, original tips 15, public
// Luma-paste events 1 — so farming aggregated event feeds yields nothing
// meaningful. Curator awards are variable and passed in at award-time.
// `retraction_clawback` is rejected by awardContributionPoints: trust is
// monotonic up, bad actors are handled via clearance freeze/ban.
export const CONTRIBUTION_POINTS: Record<ContributionEventKind, number> = {
  incident_accepted: 50,
  original_accepted: 15,
  tip_accepted: 5,
  event_scoop_accepted: 5,
  event_paste_accepted: 1,
  address_tag_accepted: 5,
  vote_cast: 1,
  prize_win_first: 100,
  prize_win_second: 50,
  prize_win_third: 25,
  curator_award: 0, // variable — caller must override
  // Small per-citation drip. Capped in the citation hook so one investigation
  // referencing fifty of your prior addresses doesn't dump 50pts in one go.
  intel_cited: 1,
  // Firsthand victim report approved by curator. Lower bar than an original
  // tip (which is reportable signal someone else can verify), so smaller
  // award — but enough that one accepted report unlocks contributor tier
  // and lets a victim's queued attributions flow into the graph.
  loss_report_accepted: 3,
  retraction_clawback: 0, // rejected at runtime — kept here so the enum type is exhaustive
  // Accepted white-hat bounty claim. Bar is real money + curator + victim
  // ack, so rewards above incident_accepted (50) but below curator_award
  // territory. One accepted claim moves a new contributor most of the way
  // to trusted (50→125, threshold 250 for inner_circle).
  bounty_claim_accepted: 75,
};

/**
 * Map a submission `(type, kind)` to the contribution event kind awarded
 * on curator approval. Intel splits on payload.kind because incidents
 * (50pts) and tips (5pts) are an order of magnitude apart in scarcity.
 * All non-intel surfaces collapse to `event_scoop_accepted` for now —
 * once the harvester layer can distinguish "scoop" from "Luma paste"
 * post-hoc, we'll branch here on a separate signal.
 */
export function pointsKindForSubmission(
  type: string,
  payload: unknown,
): ContributionEventKind {
  if (type === "intel") {
    const kind = (payload as { kind?: IntelKind } | null)?.kind;
    if (kind === "incident") return "incident_accepted";
    if (kind === "original") return "original_accepted";
    return "tip_accepted";
  }
  if (type === "loss_report") return "loss_report_accepted";
  return "event_scoop_accepted";
}
