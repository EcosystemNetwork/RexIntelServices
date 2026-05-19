import { cache } from "react";
import { cookies } from "next/headers";
import Link from "next/link";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { and, desc, eq, ne, or, sql } from "drizzle-orm";
import { db, submissions, addresses, intelAddresses, intelVotes, submitters } from "@/lib/db";
import type { IntelPayload, AddressRole } from "@/lib/db/schema";
import { PublicShell } from "@/components/public-shell";
import { JsonLd } from "@/components/json-ld";
import { FooterSubscribe } from "@/components/footer-subscribe";
import { explorerUrl } from "@/lib/chains";
import { absoluteUrl } from "@/lib/site-url";
import { parsePublicId, detailSegment, detailHref } from "@/lib/slug";
import { VoteButton } from "@/components/vote-button";
import { VOTER_COOKIE_NAME, verifyVoterCookie } from "@/lib/voter-cookie";
import { PrizePoolBanner } from "@/app/intel/_lanes/signals";
import { SpicyTag, FeaturedTag } from "@/app/intel/_lanes/_shared";
import { getMagicSession } from "@/lib/magic-auth";
import { meetsTier } from "@/lib/clearance";
import { ClearanceWall } from "@/components/clearance-wall";
import { IntelHero } from "@/components/intel-hero";
import { IntelArticleBody } from "@/components/intel-article-body";
import { IntelMediaGallery } from "@/components/intel-media-gallery";
import { IntelMiniGraph } from "@/components/intel-mini-graph";
import { fetchIntelSubgraph } from "@/lib/graph-data";

export const dynamic = "force-dynamic";

type LinkedAddress = {
  chain: string;
  address: string;
  label: string | null;
  role: AddressRole;
};

type LoadedIntel = {
  id: string;
  payload: IntelPayload;
  submitterHandle: string | null;
  submitterSlug: string | null;
  publishedAt: Date | null;
  featured: boolean;
  addresses: LinkedAddress[];
  voteCount: number;
};

type RelatedIntel = {
  publicId: string;
  payload: IntelPayload;
  publishedAt: Date | null;
  voteCount: number;
};

/**
 * Find 3 published intel rows that share kind OR category with the current
 * one. Prefers same-kind matches via ORDER BY, falls back to same-category.
 * Excludes the current row. Used to convert SEO landers into multi-page
 * sessions.
 */
async function loadRelatedIntel(
  currentId: string,
  payload: IntelPayload,
): Promise<RelatedIntel[]> {
  const kind = payload.kind ?? "tip";
  const category = payload.category ?? "";

  const rows = await db
    .select({
      publicId: submissions.publicId,
      payload: submissions.payload,
      publishedAt: submissions.publishedAt,
      voteCount: sql<number>`(SELECT count(*)::int FROM ${intelVotes} WHERE ${intelVotes.submissionId} = ${submissions.id})`,
    })
    .from(submissions)
    .where(
      and(
        eq(submissions.type, "intel"),
        eq(submissions.status, "approved"),
        ne(submissions.id, currentId),
        or(
          sql`${submissions.payload}->>'kind' = ${kind}`,
          sql`${submissions.payload}->>'category' = ${category}`,
        ),
      ),
    )
    // Same-kind first, then same-category, then everything else, newest within
    // each tier. Inlining the CASE expression in ORDER BY avoids the alias
    // gymnastics that drizzle's select-as-string would need.
    .orderBy(
      sql`CASE
        WHEN ${submissions.payload}->>'kind' = ${kind} THEN 0
        WHEN ${submissions.payload}->>'category' = ${category} THEN 1
        ELSE 2
      END`,
      desc(submissions.publishedAt),
    )
    .limit(3);

  return rows.map((r) => ({
    publicId: r.publicId,
    payload: r.payload as IntelPayload,
    publishedAt: r.publishedAt,
    voteCount: r.voteCount,
  }));
}

const loadIntel = cache(
  async (publicId: string): Promise<LoadedIntel | undefined> => {
    const [row] = await db
      .select({
        id: submissions.id,
        payload: submissions.payload,
        submitterHandle: submissions.submitterHandle,
        submitterSlug: submitters.slug,
        publishedAt: submissions.publishedAt,
        featured: submissions.featured,
      })
      .from(submissions)
      .leftJoin(submitters, eq(submitters.id, submissions.submitterId))
      .where(
        and(
          eq(submissions.publicId, publicId),
          eq(submissions.type, "intel"),
          eq(submissions.status, "approved"),
        ),
      )
      .limit(1);
    if (!row) return undefined;

    const [addrRows, [voteRow]] = await Promise.all([
      db
        .select({
          chain: addresses.chain,
          address: addresses.address,
          label: addresses.label,
          role: intelAddresses.role,
        })
        .from(intelAddresses)
        .innerJoin(addresses, eq(intelAddresses.addressId, addresses.id))
        .where(eq(intelAddresses.submissionId, row.id)),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(intelVotes)
        .where(eq(intelVotes.submissionId, row.id)),
    ]);

    return {
      id: row.id,
      payload: row.payload as IntelPayload,
      submitterHandle: row.submitterHandle,
      submitterSlug: row.submitterSlug,
      publishedAt: row.publishedAt,
      featured: row.featured ?? false,
      addresses: addrRows,
      voteCount: voteRow?.count ?? 0,
    };
  },
);

const ROLE_LABEL: Record<AddressRole, string> = {
  subject: "subject",
  counterparty: "counterparty",
  observed: "observed",
};

export async function generateMetadata({
  params,
}: {
  params: { publicId: string };
}): Promise<Metadata> {
  const realId = parsePublicId(params.publicId);
  if (!realId) return { title: "Intel not found — Rex Intel Services" };
  const row = await loadIntel(realId);
  if (!row) {
    return { title: "Intel not found — Rex Intel Services" };
  }
  const p = row.payload;
  const desc = (p.dek ?? p.body).replace(/\s+/g, " ").trim().slice(0, 200);
  const title = `${p.headline} — Rex Intel Services`;
  // Prefer an explicit hero image for the og:image so social shares show
  // the article art instead of the generated fallback card. Twitter
  // upgrades to summary_large_image when an image is present.
  const ogImage = p.heroImageUrl ?? undefined;
  return {
    title,
    description: desc,
    openGraph: {
      title,
      description: desc,
      type: "article",
      images: ogImage ? [ogImage] : undefined,
    },
    twitter: {
      card: ogImage ? "summary_large_image" : "summary",
      title,
      description: desc,
      images: ogImage ? [ogImage] : undefined,
    },
  };
}

const SEVERITY_TONE: Record<
  NonNullable<IntelPayload["severity"]>,
  { bg: string; fg: string; border: string }
> = {
  low: {
    bg: "rgba(136,136,160,0.10)",
    fg: "var(--rex-text-muted)",
    border: "rgba(136,136,160,0.35)",
  },
  medium: {
    bg: "rgba(96,165,250,0.10)",
    fg: "var(--rex-info)",
    border: "rgba(96,165,250,0.35)",
  },
  high: {
    bg: "rgba(251,191,36,0.10)",
    fg: "var(--rex-warning)",
    border: "rgba(251,191,36,0.35)",
  },
  critical: {
    bg: "rgba(248,113,113,0.10)",
    fg: "var(--rex-danger)",
    border: "rgba(248,113,113,0.35)",
  },
};

export default async function IntelDetailPage({
  params,
}: {
  params: { publicId: string };
}) {
  const realId = parsePublicId(params.publicId);
  if (!realId) notFound();
  const row = await loadIntel(realId);
  if (!row) notFound();

  const payload = row.payload;
  const canonical = detailSegment(realId, payload.headline);
  if (params.publicId !== canonical) {
    redirect(detailHref("/intel", realId, payload.headline));
  }
  const linkedAddresses = row.addresses;

  // Read the voter cookie server-side. If valid, check whether this
  // subscriber already voted on this intel so the button renders in the
  // "Voted" state immediately (no client flicker). Invalid/missing cookie
  // = render the idle CTA and let the client try /vote/cast on click.
  const voterCookieRaw = cookies().get(VOTER_COOKIE_NAME)?.value;
  const voterSubscriberId = verifyVoterCookie(voterCookieRaw);
  let alreadyVoted = false;
  if (voterSubscriberId) {
    const [vote] = await db
      .select({ submissionId: intelVotes.submissionId })
      .from(intelVotes)
      .where(
        and(
          eq(intelVotes.submissionId, row.id),
          eq(intelVotes.subscriberId, voterSubscriberId),
        ),
      )
      .limit(1);
    alreadyVoted = !!vote;
  }

  const relatedIntel = await loadRelatedIntel(row.id, payload);
  // Per-story mini-graph: this incident + its linked addresses + one-hop
  // co-incident neighbors. Returns null when the article has zero linked
  // addresses, in which case we skip the section entirely (nothing to
  // draw).
  const miniGraph = await fetchIntelSubgraph(row.id);

  // Clearance wall is currently disconnected — Rex Deus directed 2026-05-19
  // that the contributor-tier gate isn't ready for rollout. Keeping the
  // surrounding plumbing (clearance tiers, points, ClearanceWall component)
  // intact so flipping CLEARANCE_GATE_ENABLED back to true re-enables the
  // gate without re-wiring.
  const CLEARANCE_GATE_ENABLED = false;
  const requiresClearance =
    CLEARANCE_GATE_ENABLED && payload.kind === "incident" && !row.featured;
  const session = requiresClearance ? await getMagicSession() : null;
  const currentTier = session?.clearanceTier ?? "open";
  const isGated = requiresClearance && !meetsTier(currentTier, "contributor");
  const bodyForRender = payload.body;

  const dateLabel = row.publishedAt
    ? new Date(row.publishedAt).toLocaleDateString(undefined, {
        weekday: "short",
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : "";
  const tone = payload.severity ? SEVERITY_TONE[payload.severity] : null;
  const sourceLabel = payload.anonymous
    ? "Anonymous"
    : row.submitterHandle
      ? `@${row.submitterHandle}`
      : "Anonymous";

  const jsonLd: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": payload.kind === "incident" ? "ReportageNewsArticle" : "NewsArticle",
    headline: payload.headline,
    description: (payload.dek ?? payload.body).slice(0, 300),
    image: payload.heroImageUrl ? [payload.heroImageUrl] : undefined,
    // Honest paywall signal for Google so we don't get flagged for cloaking
    // when the human-visible body is truncated. Incidents only — original
    // and tip kinds stay fully public, and featured incidents are unlocked
    // for everyone.
    ...(requiresClearance
      ? {
          isAccessibleForFree: "False",
          hasPart: {
            "@type": "WebPageElement",
            isAccessibleForFree: "False",
            cssSelector: ".gated-body",
          },
        }
      : {}),
    datePublished: row.publishedAt?.toISOString(),
    articleSection: payload.kind ?? "tip",
    author: {
      "@type": payload.anonymous ? "Organization" : "Person",
      name: payload.anonymous ? "Rex Intel Services (Anonymous source)" : sourceLabel,
    },
    publisher: {
      "@type": "Organization",
      name: "Rex Intel Services",
      url: absoluteUrl("/"),
    },
    mainEntityOfPage: absoluteUrl(detailHref("/intel", realId, payload.headline)),
    about: linkedAddresses.length
      ? linkedAddresses.map((a) => ({
          "@type": "Thing",
          name: a.label ?? `${a.chain}:${a.address}`,
          identifier: `${a.chain}:${a.address}`,
          url: absoluteUrl(`/intel/address/${a.chain}/${a.address}`),
        }))
      : undefined,
    isBasedOn: payload.archiveUrl
      ? { "@type": "WebPage", url: payload.archiveUrl }
      : undefined,
    creditText: payload.sourceGrade
      ? `Source grade: ${payload.sourceGrade}`
      : undefined,
    keywords: payload.category ? [payload.category, payload.kind ?? "tip"] : undefined,
  };

  const sourceGradeTone: Record<
    NonNullable<IntelPayload["sourceGrade"]>,
    { bg: string; fg: string; border: string; label: string }
  > = {
    primary: {
      bg: "rgba(95,185,31,0.10)",
      fg: "var(--rex-accent)",
      border: "rgba(95,185,31,0.35)",
      label: "Primary source",
    },
    secondary: {
      bg: "rgba(96,165,250,0.10)",
      fg: "var(--rex-info)",
      border: "rgba(96,165,250,0.35)",
      label: "Secondary source",
    },
    hearsay: {
      bg: "rgba(136,136,160,0.10)",
      fg: "var(--rex-text-muted)",
      border: "rgba(136,136,160,0.35)",
      label: "Hearsay",
    },
  };
  const grade = payload.sourceGrade
    ? sourceGradeTone[payload.sourceGrade]
    : null;

  return (
    <PublicShell
      classification={[{ text: "● Open Channel // Intel Wire Detail" }]}
    >
      <JsonLd data={jsonLd} />
      <main className="max-w-3xl mx-auto px-6 pt-8 md:pt-12 pb-24">
        <Link
          href="/intel"
          className="mono-label hover:text-[var(--rex-text)] transition-colors inline-flex items-center gap-1.5 mb-6"
        >
          <span>←</span>
          <span>All intel</span>
        </Link>

        <article className="rex-card p-8">
          <div className="flex flex-wrap items-center gap-2 mb-3 text-[10px] font-mono uppercase tracking-widest">
            {row.featured && <FeaturedTag />}
            {payload.spicy && <SpicyTag />}
            {payload.kind === "original" && (
              <span
                className="px-1.5 py-0.5 rounded-sm"
                style={{
                  background: "rgba(95,185,31,0.10)",
                  color: "var(--rex-accent)",
                  border: "1px solid rgba(95,185,31,0.35)",
                }}
              >
                Original
              </span>
            )}
            {payload.kind === "incident" && (
              <span
                className="px-1.5 py-0.5 rounded-sm"
                style={{
                  background: "rgba(248,113,113,0.10)",
                  color: "#f87171",
                  border: "1px solid rgba(248,113,113,0.35)",
                }}
              >
                Incident
              </span>
            )}
            {payload.severity && tone && (
              <span
                className="px-1.5 py-0.5 rounded-sm"
                style={{
                  background: tone.bg,
                  color: tone.fg,
                  border: `1px solid ${tone.border}`,
                }}
              >
                {payload.severity}
              </span>
            )}
            {grade && (
              <span
                className="px-1.5 py-0.5 rounded-sm"
                style={{
                  background: grade.bg,
                  color: grade.fg,
                  border: `1px solid ${grade.border}`,
                }}
              >
                {grade.label}
              </span>
            )}
            {payload.category && (
              <span
                className="px-1.5 py-0.5 rounded-sm"
                style={{
                  background: "rgba(136,136,160,0.10)",
                  color: "var(--rex-text-muted)",
                  border: "1px solid rgba(136,136,160,0.35)",
                }}
              >
                {payload.category}
              </span>
            )}
            {dateLabel && (
              <span
                style={{ color: "var(--rex-text-dim)" }}
                className="ml-auto"
              >
                {dateLabel}
              </span>
            )}
          </div>

          <h1 className="font-display text-3xl md:text-4xl font-semibold tracking-tight text-[var(--rex-text)] mb-3 leading-tight">
            {payload.headline}
          </h1>

          {payload.dek && (
            <p
              className="text-base md:text-lg leading-relaxed mb-6"
              style={{ color: "var(--rex-text-muted)" }}
            >
              {payload.dek}
            </p>
          )}

          <IntelHero payload={payload} publicId={realId} />

          {/* `bodyForRender` is the truncated teaser when an incident is
              clearance-gated, otherwise the full markdown / plaintext body.
              Forcing the gated rows to "plain" keeps the cut-off teaser from
              breaking mid-table or mid-codeblock. */}
          <IntelArticleBody
            body={bodyForRender}
            format={isGated ? "plain" : payload.bodyFormat ?? "plain"}
            className={`mb-6 ${requiresClearance ? "gated-body" : ""}`}
          />

          {isGated && (
            <ClearanceWall
              required="contributor"
              current={currentTier}
              reason="Connect a wallet to read the full incident report."
            />
          )}

          {!isGated && payload.media && payload.media.length > 0 && (
            <IntelMediaGallery media={payload.media} />
          )}

          {payload.links && payload.links.length > 0 && (
            <Section label="Links">
              <ul className="space-y-1.5 font-mono text-xs">
                {payload.links.map((l, i) => (
                  <li key={i}>
                    <a
                      href={l}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[var(--rex-accent)] hover:underline break-all"
                    >
                      {l}
                    </a>
                  </li>
                ))}
              </ul>
            </Section>
          )}

          {payload.sources && payload.sources.length > 0 && (
            <Section label="Sources">
              <ul className="space-y-1.5 font-mono text-xs text-[var(--rex-text-muted)]">
                {payload.sources.map((l, i) => (
                  <li key={i} className="break-all">
                    {l}
                  </li>
                ))}
              </ul>
            </Section>
          )}

          {payload.archiveUrl && (
            <Section label="Archive">
              <a
                href={payload.archiveUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="font-mono text-xs text-[var(--rex-accent)] hover:underline break-all"
              >
                {payload.archiveUrl}
              </a>
              <p
                className="text-[11px] mt-1.5"
                style={{ color: "var(--rex-text-dim)" }}
              >
                Snapshot preserved against link-rot.
              </p>
            </Section>
          )}

          {miniGraph && !isGated && (
            <Section label="Address graph">
              <IntelMiniGraph data={miniGraph} />
              <p
                className="text-[10px] mt-3 font-mono leading-relaxed"
                style={{ color: "var(--rex-text-dim)" }}
              >
                Every node aggregates into the public address graph at{" "}
                <Link
                  href="/graph"
                  className="text-[var(--rex-accent)] hover:underline"
                >
                  /graph
                </Link>
                . Co-incidents are other approved RexIntel stories that
                share at least one of these addresses.
              </p>
            </Section>
          )}

          {linkedAddresses.length > 0 && (
            <Section label="Addresses">
              <ul className="space-y-2 font-mono text-xs">
                {linkedAddresses.map((a, i) => {
                  const explorer = explorerUrl(a.chain, a.address);
                  const entityHref = `/intel/address/${a.chain}/${a.address}`;
                  return (
                    <li key={i} className="flex flex-wrap items-baseline gap-2">
                      <span className="uppercase tracking-widest text-[10px] text-[var(--rex-text-dim)]">
                        {a.chain}
                      </span>
                      <Link
                        href={entityHref}
                        className="text-[var(--rex-accent)] hover:underline break-all"
                      >
                        {a.address}
                      </Link>
                      <span
                        className="text-[10px] uppercase tracking-widest px-1.5 py-0.5 rounded-sm"
                        style={{
                          background: "rgba(136,136,160,0.08)",
                          color: "var(--rex-text-muted)",
                          border: "1px solid rgba(136,136,160,0.25)",
                        }}
                      >
                        {ROLE_LABEL[a.role]}
                      </span>
                      {a.label && (
                        <span className="text-[var(--rex-text-dim)] text-[11px] italic">
                          — {a.label}
                        </span>
                      )}
                      {explorer && (
                        <a
                          href={explorer}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[10px] uppercase tracking-widest text-[var(--rex-text-dim)] hover:text-[var(--rex-accent)] transition-colors ml-auto"
                          aria-label={`Open on ${a.chain} explorer`}
                        >
                          Explorer ↗
                        </a>
                      )}
                    </li>
                  );
                })}
              </ul>
            </Section>
          )}

          <div
            className="mt-8 pt-5 border-t flex items-center justify-between"
            style={{ borderColor: "var(--rex-border-subtle)" }}
          >
            <span
              className="text-[11px] font-mono"
              style={{ color: "var(--rex-text-dim)" }}
            >
              Source:{" "}
              {row.submitterSlug && !payload.anonymous ? (
                <Link
                  href={`/contributors/${row.submitterSlug}`}
                  className="text-[var(--rex-accent)] hover:underline"
                >
                  {sourceLabel}
                </Link>
              ) : (
                <span className="text-[var(--rex-text-muted)]">
                  {sourceLabel}
                </span>
              )}
            </span>
            <Link
              href="/submit"
              className="text-[11px] font-mono uppercase tracking-widest text-[var(--rex-accent)] hover:text-[var(--rex-text)] transition-colors"
            >
              Drop your own intel ▸
            </Link>
          </div>
        </article>

        {/* Conversion stack: prize-pool context → vote → share + subscribe →
           related incidents. Built around the assumption that SEO landers
           (someone googling "[protocol] hack timeline") finish reading the
           article and would otherwise leave — every block below this comment
           exists to convert that exit into a deeper session. */}
        <div className="mt-8 space-y-6">
          <PrizePoolBanner />
          <VoteButton
            publicId={realId}
            initialCount={row.voteCount}
            initialVoted={alreadyVoted}
          />
          <ShareAndSubscribe
            url={absoluteUrl(detailHref("/intel", realId, payload.headline))}
            headline={payload.headline}
          />
          <RelatedIntel items={relatedIntel} />
        </div>
      </main>
    </PublicShell>
  );
}

/**
 * Lightweight share-to-X + inline subscribe row. Sits between the vote button
 * and the related-incidents grid so anyone who isn't ready to vote still has
 * a one-tap escape hatch to either share or subscribe.
 */
function ShareAndSubscribe({ url, headline }: { url: string; headline: string }) {
  const shareText = `${headline} — Rex Intel Services`;
  const xHref = `https://x.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(url)}`;
  return (
    <div className="rex-card-flat p-5 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-3">
        <a
          href={xHref}
          target="_blank"
          rel="noopener noreferrer"
          className="rex-btn whitespace-nowrap"
          aria-label="Share to X"
        >
          Share to X ↗
        </a>
        <span
          className="text-[11px] font-mono uppercase tracking-widest"
          style={{ color: "var(--rex-text-dim)" }}
        >
          Or get the next one delivered ▾
        </span>
      </div>
      <FooterSubscribe source="intel-detail" />
    </div>
  );
}

function RelatedIntel({ items }: { items: RelatedIntel[] }) {
  if (items.length === 0) return null;
  return (
    <section>
      <div
        className="text-[10px] font-mono uppercase tracking-widest mb-3"
        style={{ color: "var(--rex-text-dim)" }}
      >
        Related intel
      </div>
      <ul className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {items.map((item) => {
          const href = detailHref("/intel", item.publicId, item.payload.headline);
          const kind = item.payload.kind ?? "tip";
          return (
            <li key={item.publicId}>
              <Link
                href={href}
                className="rex-card-flat p-4 block h-full hover:bg-[var(--rex-surface-2)] transition-colors"
              >
                <div className="flex items-center gap-2 mb-2 text-[10px] font-mono uppercase tracking-widest">
                  <span
                    className="px-1.5 py-0.5 rounded-sm"
                    style={{
                      background:
                        kind === "incident"
                          ? "rgba(248,113,113,0.10)"
                          : kind === "original"
                            ? "rgba(95,185,31,0.10)"
                            : "rgba(136,136,160,0.10)",
                      color:
                        kind === "incident"
                          ? "#f87171"
                          : kind === "original"
                            ? "var(--rex-accent)"
                            : "var(--rex-text-muted)",
                      border: `1px solid ${
                        kind === "incident"
                          ? "rgba(248,113,113,0.30)"
                          : kind === "original"
                            ? "rgba(95,185,31,0.30)"
                            : "rgba(136,136,160,0.25)"
                      }`,
                    }}
                  >
                    {kind}
                  </span>
                  {item.voteCount > 0 && (
                    <span style={{ color: "var(--rex-text-dim)" }}>
                      ▲ {item.voteCount}
                    </span>
                  )}
                </div>
                <div className="text-sm text-[var(--rex-text)] leading-snug line-clamp-3">
                  {item.payload.headline}
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function Section({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className="border-t pt-5 mt-5"
      style={{ borderColor: "var(--rex-border-subtle)" }}
    >
      <div
        className="text-[10px] font-mono uppercase tracking-widest mb-2"
        style={{ color: "var(--rex-text-dim)" }}
      >
        {label}
      </div>
      {children}
    </div>
  );
}
