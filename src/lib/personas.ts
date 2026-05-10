// Persona constants live in their own module (no server-only deps) so the
// landing-page client component can import them without dragging Drizzle's
// pg-core into the client bundle.
//
// Keep in sync with the persona-kind tags seeded in
// drizzle/0004_volatile_peter_parker.sql.

export const PERSONA_SLUGS = [
  "compliance",
  "exchange-risk",
  "investigator",
  "gov-le",
  "fund-risk",
] as const;

export type PersonaSlug = (typeof PERSONA_SLUGS)[number];

export const PERSONA_LABELS: Record<PersonaSlug, string> = {
  compliance: "Compliance / AML",
  "exchange-risk": "Exchange risk / Trust & safety",
  investigator: "Investigator / Researcher",
  "gov-le": "Government / Law enforcement",
  "fund-risk": "Fund / Treasury risk",
};
