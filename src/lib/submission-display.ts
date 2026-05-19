import type {
  SubmissionPayload,
  IntelPayload,
  EventPayload,
  JobPayload,
  PopupCityPayload,
  HackathonPayload,
  GrantPayload,
  AcceleratorPayload,
  CapitalPayload,
  ResidencyPayload,
  PerksPayload,
  FellowshipPayload,
  LossReportPayload,
} from "@/lib/db/schema";
import { detailHref } from "@/lib/slug";

/**
 * Cross-type helpers for rendering submission rows. The leaderboard, the
 * prize-pool banner, the admin dashboard, and the vote-confirm redirect all
 * need to display a submission's title and route to its detail page WITHOUT
 * knowing in advance which submission_type they're looking at — once the
 * prize pool expanded past intel-only, anything with a payload field could
 * land in those views.
 *
 * Each submission_type has its own payload shape with a different "title"
 * field (intel→headline, capital/grant/etc→name, job→title) and its own
 * detail-page URL prefix. Centralizing the mapping here keeps the call sites
 * type-safe and ensures the leaderboard never renders an empty headline or
 * links to /intel/<id> for, say, a hackathon submission.
 */

export type SubmissionType =
  | "intel"
  | "event"
  | "job"
  | "grant"
  | "accelerator"
  | "popup_city"
  | "hackathon"
  | "capital"
  | "residency"
  | "perks"
  | "fellowship"
  | "loss_report";

/**
 * Extract the human-facing title for any submission payload. Falls back to
 * "Untitled submission" when a payload is malformed — the leaderboard would
 * rather show that than crash on a typo'd seed row.
 */
export function submissionTitle(
  type: SubmissionType,
  payload: SubmissionPayload,
): string {
  switch (type) {
    case "intel":
      return (payload as IntelPayload).headline || "Untitled intel";
    case "event":
      return (payload as EventPayload).name || "Untitled event";
    case "job":
      return (payload as JobPayload).title || "Untitled job";
    case "grant":
      return (payload as GrantPayload).name || "Untitled grant";
    case "accelerator":
      return (payload as AcceleratorPayload).name || "Untitled accelerator";
    case "popup_city":
      return (payload as PopupCityPayload).name || "Untitled pop-up city";
    case "hackathon":
      return (payload as HackathonPayload).name || "Untitled hackathon";
    case "capital":
      return (payload as CapitalPayload).name || "Untitled fund";
    case "residency":
      return (payload as ResidencyPayload).name || "Untitled residency";
    case "perks":
      return (payload as PerksPayload).name || "Untitled perk";
    case "fellowship":
      return (payload as FellowshipPayload).name || "Untitled fellowship";
    case "loss_report":
      return (payload as LossReportPayload).headline || "Loss report";
  }
}

/**
 * URL prefix per submission type. Hackathons live under /events because the
 * hackathon enum value is unused in production — actual hackathon rows are
 * stored as type='event' with payload.eventType='hackathon' (see sitemap.ts).
 */
export function submissionDetailPrefix(type: SubmissionType): string {
  switch (type) {
    case "intel":
      return "/intel";
    case "event":
    case "hackathon":
      return "/events";
    case "job":
      return "/jobs";
    case "grant":
      return "/grants";
    case "accelerator":
      return "/accelerators";
    case "popup_city":
      return "/pop-up-cities";
    case "capital":
      return "/capital";
    case "residency":
      return "/residencies";
    case "perks":
      return "/perks";
    case "fellowship":
      return "/fellowships";
    case "loss_report":
      return "/intel";
  }
}

export function submissionDetailHref(
  type: SubmissionType,
  publicId: string,
  payload: SubmissionPayload,
): string {
  return detailHref(
    submissionDetailPrefix(type),
    publicId,
    submissionTitle(type, payload),
  );
}

/**
 * Short label for the type pill on cross-type lists (leaderboard, dashboard).
 * Lowercase to match the existing mono-uppercase chip styling at the call
 * site, which applies its own `uppercase` class.
 */
export function submissionTypeLabel(type: SubmissionType): string {
  switch (type) {
    case "intel":
      return "intel";
    case "event":
      return "event";
    case "job":
      return "job";
    case "grant":
      return "grant";
    case "accelerator":
      return "accelerator";
    case "popup_city":
      return "pop-up";
    case "hackathon":
      return "hackathon";
    case "capital":
      return "capital";
    case "residency":
      return "residency";
    case "perks":
      return "perks";
    case "fellowship":
      return "fellowship";
    case "loss_report":
      return "loss report";
  }
}

/**
 * Anonymous flag is only meaningful for intel and loss_report — the other
 * surfaces don't offer anonymous submission. Returns false for those so the
 * leaderboard's "prize ineligible" badge only shows where it makes sense.
 */
export function submissionIsAnonymous(
  type: SubmissionType,
  payload: SubmissionPayload,
): boolean {
  if (type === "intel") {
    return (payload as IntelPayload).anonymous === true;
  }
  if (type === "loss_report") {
    return (payload as LossReportPayload).anonymous === true;
  }
  return false;
}
