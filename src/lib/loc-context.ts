import { cookies, headers } from "next/headers";

const LOC_COOKIE = "rex_loc";

/**
 * The current request's path+query, stamped into request headers by
 * middleware. Used by header components to round-trip back to where the user
 * was after a side-effect (e.g. clearing the location pill).
 */
export function getCurrentPath(): string {
  return headers().get("x-full-path") || headers().get("x-pathname") || "/";
}

/**
 * Persistent location context — set by middleware whenever a public page is
 * loaded with `?loc=…`. Lane pages (events, jobs, hackathons, search) use
 * this to fall back to a sticky scope when no explicit `loc` query param is
 * present. Cleared via /api/loc/clear.
 */
export function getStickyLoc(): string {
  const value = cookies().get(LOC_COOKIE)?.value ?? "";
  return value.trim().slice(0, 80);
}

/**
 * Resolve the effective location filter for a lane page. URL param wins; the
 * cookie is the fallback. Empty string means "no filter".
 */
export function resolveLoc(searchParamLoc: string | undefined): string {
  const explicit = (searchParamLoc ?? "").trim().slice(0, 80);
  if (searchParamLoc !== undefined) return explicit;
  return getStickyLoc();
}

export const LOC_COOKIE_NAME = LOC_COOKIE;
