import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { desc, eq } from "drizzle-orm";
import {
  db,
  bounties,
  bountyClaims,
  hackTraces,
  submitters,
  type BountyClaimRejectionReason,
} from "@/lib/db";
import { PublicShell } from "@/components/public-shell";
import { getCircleSession } from "@/lib/circle-auth";
import { meetsTier } from "@/lib/clearance";
import {
  BOUNTY_CLAIM_MIN_TIER,
  bountyClaimBondUsdc,
  checkVictimAccessToken,
} from "@/lib/bounty";
import { explorerUrl } from "@/lib/chains";
import { BountyClaimForm } from "./claim-form";
import { VerifyVictimPanel } from "./verify-victim-panel";

export const dynamic = "force-dynamic";

type BountyDetail = NonNullable<Awaited<ReturnType<typeof loadBounty>>>;

async function loadBounty(publicId: string) {
  const [b] = await db
    .select()
    .from(bounties)
    .where(eq(bounties.publicId, publicId))
    .limit(1);
  if (!b) return null;

  const trace = b.hackTraceId
    ? (
        await db
          .select({
            publicId: hackTraces.publicId,
            chain: hackTraces.chain,
            rootAddress: hackTraces.rootAddress,
            lossUsd: hackTraces.lossUsd,
            victimLabel: hackTraces.victimLabel,
          })
          .from(hackTraces)
          .where(eq(hackTraces.id, b.hackTraceId))
          .limit(1)
      )[0] ?? null
    : null;

  const claims = await db
    .select({
      publicId: bountyClaims.publicId,
      status: bountyClaims.status,
      rejectionReason: bountyClaims.rejectionReason,
      submittedAt: bountyClaims.submittedAt,
      reviewedAt: bountyClaims.reviewedAt,
      claimantHandle: submitters.displayHandle,
      claimantSlug: submitters.slug,
    })
    .from(bountyClaims)
    .leftJoin(submitters, eq(submitters.id, bountyClaims.claimantSubmitterId))
    .where(eq(bountyClaims.bountyId, b.id))
    .orderBy(desc(bountyClaims.submittedAt));

  return { bounty: b, trace, claims };
}

export async function generateMetadata({
  params,
}: {
  params: { publicId: string };
}): Promise<Metadata> {
  const data = await loadBounty(params.publicId);
  if (!data) return { title: "Bounty not found · RexIntel" };
  const { bounty: b } = data;
  const amount =
    b.kind === "recovery"
      ? `${((b.recoveryPercentBps ?? 0) / 100).toFixed(0)}% of recovered funds`
      : `$${Number(b.flatAmountUsdc ?? 0).toFixed(0)} USDC`;
  return {
    title: `Recovery bounty · ${amount} · RexIntel`,
    description:
      "White-hat researchers at the trusted clearance tier can claim this bounty. Sealed evidence package, curator + victim adjudication, custodial USDC escrow on Base.",
  };
}

export default async function BountyDetailPage({
  params,
  searchParams,
}: {
  params: { publicId: string };
  searchParams: { token?: string };
}) {
  const data = await loadBounty(params.publicId);
  if (!data) notFound();
  const { bounty: b, trace, claims } = data;

  const session = await getCircleSession();
  const isVictimSession =
    !!session?.submitterId &&
    !!b.victimSubmitterId &&
    session.submitterId === b.victimSubmitterId;
  // Audit fix #6: raw access token in ?token= grants anon victims access
  // to their own draft. Hash-compared in constant time.
  const isVictimToken = checkVictimAccessToken(
    searchParams.token ?? null,
    b.victimAccessTokenHash,
  );
  const isVictim = isVictimSession || isVictimToken;
  const meetsClaimTier =
    !!session && meetsTier(session.clearanceTier, BOUNTY_CLAIM_MIN_TIER);

  // Public visibility: draft/funded/refunded/expired are hidden from
  // anyone except the victim. notFound() rather than 403 to avoid leaking
  // existence of unfunded drafts.
  const publiclyVisible = ["open", "adjudicating", "paid"].includes(b.status);
  if (!publiclyVisible && !isVictim) notFound();

  const showFullDescription = isVictim || meetsClaimTier;
  const claimable = b.status === "open" || b.status === "adjudicating";
  const needsVictimVerification =
    isVictim && !b.victimVerifiedAt && b.status !== "expired" && b.status !== "refunded";

  return (
    <PublicShell
      classification={[
        { text: `● ${b.status}` },
        { text: b.kind.replace("_", " "), show: "sm" },
        { text: `Bounty · ${b.publicId}`, show: "md" },
      ]}
    >
      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-8 space-y-6">
        <header className="space-y-3">
          <div className="text-[10px] font-mono uppercase tracking-widest text-[var(--rex-accent)]">
            ● Recovery bounty · {b.publicId}
          </div>
          <h1 className="font-display text-2xl sm:text-3xl font-semibold tracking-tight text-white">
            {b.kind === "recovery"
              ? `${((b.recoveryPercentBps ?? 0) / 100).toFixed(0)}% of recovered funds`
              : `$${Number(b.flatAmountUsdc ?? 0).toLocaleString()} USDC`}{" "}
            <span className="text-[var(--rex-text-muted)] font-display text-xl">
              · {b.kind === "info_arrest" ? "info → arrest" : b.kind === "info_recovery" ? "info → recovery" : "recovery share"}
            </span>
          </h1>
          {b.policeReportFiled ? (
            <div className="text-[11px] font-mono uppercase tracking-widest text-[var(--rex-warning)]">
              ⚠ Police report on file · ref {b.policeReportRef ?? "—"}
            </div>
          ) : null}
        </header>

        <section className="rex-card p-4 sm:p-5 grid grid-cols-2 sm:grid-cols-4 gap-4">
          <Stat label="Escrowed" value={`$${Number(b.escrowedAmountUsdc).toFixed(0)}`} sub="USDC on Base" />
          <Stat
            label="Expires"
            value={new Date(b.expiresAt).toISOString().slice(0, 10)}
            sub={
              new Date(b.expiresAt).getTime() > Date.now()
                ? `${Math.ceil((new Date(b.expiresAt).getTime() - Date.now()) / 86_400_000)}d left`
                : "expired"
            }
          />
          <Stat label="Claims" value={String(claims.length)} />
          <Stat label="Status" value={b.status} />
        </section>

        {trace ? (
          <section className="rex-card p-4 sm:p-5 space-y-2">
            <div className="text-[10px] font-mono uppercase tracking-widest text-[var(--rex-text-dim)]">
              ● Anchored to victim trace
            </div>
            <div className="text-[12px] font-mono text-[var(--rex-text-muted)] break-all">
              {trace.chain} ·{" "}
              <a
                href={explorerUrl(trace.chain, trace.rootAddress) ?? "#"}
                target="_blank"
                rel="noreferrer"
                className="text-[var(--rex-accent)] underline decoration-dotted underline-offset-2"
              >
                {trace.rootAddress}
              </a>
            </div>
            <div className="text-[11px] font-mono text-[var(--rex-text-dim)]">
              {trace.victimLabel ?? "—"}
              {trace.lossUsd
                ? ` · ~$${Number(trace.lossUsd).toLocaleString()} loss`
                : ""}
            </div>
            <Link
              href={`/trace/${trace.publicId}`}
              className="inline-block text-[11px] font-mono uppercase tracking-widest text-[var(--rex-accent)] underline decoration-dotted underline-offset-2"
            >
              View full outbound trace →
            </Link>
          </section>
        ) : null}

        <section className="rex-card p-4 sm:p-5 space-y-2">
          <div className="text-[10px] font-mono uppercase tracking-widest text-[var(--rex-text-dim)]">
            ● Description
          </div>
          {showFullDescription ? (
            <div className="text-sm text-[var(--rex-text-muted)] whitespace-pre-wrap leading-relaxed">
              {b.description}
            </div>
          ) : (
            <>
              <div className="text-sm text-[var(--rex-text-muted)] leading-relaxed">
                {b.description.slice(0, 200)}
                {b.description.length > 200 ? "…" : ""}
              </div>
              <div className="text-[11px] font-mono text-[var(--rex-text-dim)] pt-2 border-t border-[var(--rex-border-subtle)] mt-2">
                Full description is gated to{" "}
                <span className="text-[var(--rex-warning)]">
                  trusted-tier
                </span>{" "}
                contributors —{" "}
                <Link href="/login" className="text-[var(--rex-accent)] underline decoration-dotted">
                  sign in
                </Link>{" "}
                to read.
              </div>
            </>
          )}
        </section>

        {needsVictimVerification ? (
          <VerifyVictimPanel
            bountyPublicId={b.publicId}
            victimEmail={b.victimEmail}
            accessToken={searchParams.token ?? ""}
          />
        ) : null}

        <ClaimsPanel claims={claims} viewerLabel={isVictim ? "victim" : meetsClaimTier ? "trusted" : "public"} />

        {claimable ? (
          meetsClaimTier && !isVictim ? (
            <BountyClaimForm
              bountyPublicId={b.publicId}
              bondAmountUsdc={bountyClaimBondUsdc()}
            />
          ) : (
            <ClaimGateNotice
              isVictim={isVictim}
              hasSession={!!session}
            />
          )
        ) : null}
      </main>
    </PublicShell>
  );
}

function Stat({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div>
      <div className="text-[9px] font-mono uppercase tracking-widest text-[var(--rex-text-dim)]">
        {label}
      </div>
      <div className="text-base font-display text-white mt-0.5 capitalize">
        {value}
      </div>
      {sub ? (
        <div className="text-[10px] font-mono text-[var(--rex-text-dim)] mt-0.5">
          {sub}
        </div>
      ) : null}
    </div>
  );
}

function ClaimsPanel({
  claims,
  viewerLabel,
}: {
  claims: BountyDetail["claims"];
  viewerLabel: "victim" | "trusted" | "public";
}) {
  if (claims.length === 0) {
    return (
      <section className="rex-card p-4 sm:p-5 text-sm text-[var(--rex-text-muted)]">
        No claims yet. Be the first to submit one.
      </section>
    );
  }
  if (viewerLabel === "public") {
    return (
      <section className="rex-card p-4 sm:p-5">
        <div className="text-[10px] font-mono uppercase tracking-widest text-[var(--rex-text-dim)] mb-2">
          ● Claims
        </div>
        <div className="text-sm text-[var(--rex-text-muted)]">
          {claims.length} claim{claims.length === 1 ? "" : "s"} on this
          bounty. Sign in at the trusted tier to see who claimed and when.
        </div>
      </section>
    );
  }
  // Hide claimant identity for bad-faith / doxx-attempt verdicts. A
  // would-be doxxer should not get a free attribution slot on the public
  // bounty page even if they hit "submit" once before getting banned.
  const STRIKE_REASONS: BountyClaimRejectionReason[] = ["bad_faith", "doxx_attempt"];
  const isHiddenClaimant = (
    c: BountyDetail["claims"][number],
  ): boolean =>
    c.status === "rejected" &&
    !!c.rejectionReason &&
    STRIKE_REASONS.includes(c.rejectionReason);

  return (
    <section className="rex-card p-4 sm:p-5 space-y-2">
      <div className="text-[10px] font-mono uppercase tracking-widest text-[var(--rex-text-dim)] mb-2">
        ● Claims · viewer: {viewerLabel}
      </div>
      <ul className="space-y-2">
        {claims.map((c) => {
          const hideIdentity = isHiddenClaimant(c);
          return (
            <li
              key={c.publicId}
              className="flex flex-wrap items-center justify-between gap-2 text-[12px] font-mono border-b border-[var(--rex-border-subtle)] pb-2 last:border-0 last:pb-0"
            >
              <div className="flex items-center gap-2">
                <span className="text-[var(--rex-text-muted)]">
                  {hideIdentity ? (
                    <span className="text-[var(--rex-text-dim)]">
                      [hidden — strike issued]
                    </span>
                  ) : c.claimantHandle ? (
                    <Link
                      href={`/contributors/${c.claimantSlug ?? ""}`}
                      className="text-[var(--rex-accent)] underline decoration-dotted underline-offset-2"
                    >
                      @{c.claimantHandle}
                    </Link>
                  ) : (
                    <span className="text-[var(--rex-text-dim)]">anonymous</span>
                  )}
                </span>
                <span className="text-[var(--rex-text-dim)]">·</span>
                <span className="uppercase tracking-widest text-[10px]">
                  {c.status}
                </span>
              </div>
              <div className="text-[10px] text-[var(--rex-text-dim)]">
                submitted {new Date(c.submittedAt).toISOString().slice(0, 10)}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function ClaimGateNotice({
  isVictim,
  hasSession,
}: {
  isVictim: boolean;
  hasSession: boolean;
}) {
  if (isVictim) {
    return (
      <section className="rex-card p-4 sm:p-5 text-[12px] text-[var(--rex-text-muted)]">
        You posted this bounty. Claims will appear above as researchers
        submit them; you&apos;ll be asked to ack the outcome before payout.
      </section>
    );
  }
  return (
    <section className="rex-card p-4 sm:p-5 space-y-2">
      <div className="text-[10px] font-mono uppercase tracking-widest text-[var(--rex-warning)]">
        ● Submitting a claim
      </div>
      <div className="text-sm text-[var(--rex-text-muted)] leading-relaxed">
        Claim submission is gated to <strong>trusted-tier</strong>{" "}
        contributors. You earn trusted by submitting accepted intel,
        original reporting, or incident investigations. The bond charged
        per claim ($25 USDC) is refundable on any non-bad-faith outcome.
      </div>
      {!hasSession ? (
        <Link
          href="/login"
          className="inline-block text-[11px] font-mono uppercase tracking-widest px-3 py-2 rounded border border-[var(--rex-accent)]/40 text-[var(--rex-accent)] hover:bg-[var(--rex-accent)]/10 transition"
        >
          Sign in to continue →
        </Link>
      ) : (
        <Link
          href="/contributors"
          className="inline-block text-[11px] font-mono uppercase tracking-widest text-[var(--rex-accent)] underline decoration-dotted underline-offset-2"
        >
          See how to earn trusted tier →
        </Link>
      )}
    </section>
  );
}
