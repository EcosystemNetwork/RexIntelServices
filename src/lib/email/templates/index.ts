// RexIntel newsletter template library.
//
// Each template is a self-contained, inline-styled HTML email designed to
// render correctly in Gmail / Outlook / Apple Mail / mobile clients. They
// share a 600px max-width, system fonts, and the RexIntel brand palette
// (#5fb91f accent on white body so non-dark-mode clients don't break).
//
// Merge tags supported in body, subject, and previewText:
//   {{firstName}} {{lastName}} {{email}}
// These are substituted at send time in src/lib/email/render.ts.

import { intelBriefing } from "./intel-briefing";
import { incidentAlert } from "./incident-alert";
import { investigationDrop } from "./investigation-drop";
import { communityBounty } from "./community-bounty";
import { welcome } from "./welcome";
import { weeklyDigest } from "./weekly-digest";
import { blank } from "./blank";

export interface NewsletterTemplate {
  id: string;
  name: string;
  description: string;
  category: "newsletter" | "alert" | "investigation" | "bounty" | "transactional" | "blank";
  subject: string;
  previewText: string;
  htmlBody: string;
}

export const TEMPLATES: NewsletterTemplate[] = [
  intelBriefing,
  incidentAlert,
  investigationDrop,
  communityBounty,
  welcome,
  weeklyDigest,
  blank,
];

export function getTemplate(id: string): NewsletterTemplate | undefined {
  return TEMPLATES.find((t) => t.id === id);
}
