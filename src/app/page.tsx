import { and, eq, sql } from "drizzle-orm";
import { db, addresses, intelAddresses, submissions } from "@/lib/db";
import LandingForm from "./landing-form";

export const dynamic = "force-dynamic";

/**
 * Landing-page server wrapper. Computes the live graph counters on the
 * server so the hero already shows proof on first paint (no client flash
 * of "0 addresses"). The interactive subscribe form lives in
 * landing-form.tsx as a client component.
 *
 * Counters intentionally scope to *approved* intel only — pending /
 * spam submissions don't count toward public graph velocity.
 */
export default async function LandingPage() {
  const [{ addressCount = 0, chainCount = 0 } = {}] = await db
    .select({
      addressCount: sql<number>`count(distinct ${addresses.id})::int`,
      chainCount: sql<number>`count(distinct ${addresses.chain})::int`,
    })
    .from(addresses)
    .innerJoin(intelAddresses, eq(intelAddresses.addressId, addresses.id))
    .innerJoin(submissions, eq(intelAddresses.submissionId, submissions.id))
    .where(
      and(eq(submissions.type, "intel"), eq(submissions.status, "approved")),
    );

  const [{ approvedIntelCount = 0 } = {}] = await db
    .select({
      approvedIntelCount: sql<number>`count(*)::int`,
    })
    .from(submissions)
    .where(
      and(eq(submissions.type, "intel"), eq(submissions.status, "approved")),
    );

  return (
    <LandingForm
      addressCount={addressCount}
      chainCount={chainCount}
      approvedIntelCount={approvedIntelCount}
    />
  );
}
