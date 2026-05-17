import { cache } from "react";
import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { and, desc, eq, isNotNull, sql } from "drizzle-orm";
import { db, submissions, submitters } from "@/lib/db";
import type { SubmissionPayload } from "@/lib/db/schema";
import { PublicShell } from "@/components/public-shell";
import { JsonLd } from "@/components/json-ld";
import { detailHref } from "@/lib/slug";
import { absoluteUrl } from "@/lib/site-url";

export const dynamic = "force-dynamic";

type ContributorRow = {
  id: string;
  displayHandle: string;
  slug: string;
  bio: string | null;
  createdAt: Date;
};

type Counts = {
  total: number;
  approved: number;
  featured: number;
};

type RecentSubmission = {
  publicId: string;
  type: string;
  payload: SubmissionPayload;
  publishedAt: Date | null;
  featured: boolean;
};

const SURFACE_PATH: Record<string, string> = {
  intel: "/intel",
  event: "/events",
  job: "/jobs",
  grant: "/grants",
  accelerator: "/accelerators",
  popup_city: "/pop-up-cities",
  hackathon: "/hackathons",
  capital: "/capital",
  residency: "/pop-up-cities",
  perks: "/perks",
};

const SURFACE_LABEL: Record<string, string> = {
  intel: "Intel",
  event: "Event",
  job: "Job",
  grant: "Grant",
  accelerator: "Accelerator",
  popup_city: "Pop-Up City",
  hackathon: "Hackathon",
  capital: "Capital",
  residency: "Residency",
  perks: "Perks",
};

function payloadTitle(type: string, payload: SubmissionPayload): string {
  const p = payload as Record<string, unknown>;
  if (type === "intel") return (p.headline as string) ?? "(untitled)";
  if (type === "job") return (p.title as string) ?? "(untitled)";
  return (p.name as string) ?? "(untitled)";
}

const loadContributor = cache(
  async (
    slug: string,
  ): Promise<
    | {
        contributor: ContributorRow;
        counts: Counts;
        recent: RecentSubmission[];
      }
    | undefined
  > => {
    const [row] = await db
      .select({
        id: submitters.id,
        displayHandle: submitters.displayHandle,
        slug: submitters.slug,
        bio: submitters.bio,
        createdAt: submitters.createdAt,
      })
      .from(submitters)
      .where(eq(submitters.slug, slug))
      .limit(1);
    if (!row) return undefined;

    const [[countsRow], recent] = await Promise.all([
      db
        .select({
          total: sql<number>`count(*)::int`,
          approved: sql<number>`count(*) FILTER (WHERE ${submissions.status} = 'approved')::int`,
          featured: sql<number>`count(*) FILTER (WHERE ${submissions.status} = 'approved' AND ${submissions.featured} = true)::int`,
        })
        .from(submissions)
        .where(eq(submissions.submitterId, row.id)),
      db
        .select({
          publicId: submissions.publicId,
          type: submissions.type,
          payload: submissions.payload,
          publishedAt: submissions.publishedAt,
          featured: submissions.featured,
        })
        .from(submissions)
        .where(
          and(
            eq(submissions.submitterId, row.id),
            eq(submissions.status, "approved"),
            isNotNull(submissions.publishedAt),
          ),
        )
        .orderBy(desc(submissions.publishedAt))
        .limit(50),
    ]);

    return {
      contributor: row,
      counts: countsRow ?? { total: 0, approved: 0, featured: 0 },
      recent: recent.map((r) => ({ ...r, payload: r.payload as SubmissionPayload })),
    };
  },
);

export async function generateMetadata({
  params,
}: {
  params: { slug: string };
}): Promise<Metadata> {
  const loaded = await loadContributor(params.slug);
  if (!loaded) {
    return { title: "Contributor not found — Rex Intel Services" };
  }
  const { contributor, counts } = loaded;
  return {
    title: `@${contributor.displayHandle} — Contributor · Rex Intel Services`,
    description: `${counts.approved} approved ${
      counts.approved === 1 ? "submission" : "submissions"
    } to Rex Intel Services. ${counts.featured} featured in the weekly digest.`,
    alternates: { canonical: `/contributors/${contributor.slug}` },
  };
}

export default async function ContributorPage({
  params,
}: {
  params: { slug: string };
}) {
  const loaded = await loadContributor(params.slug);
  if (!loaded) notFound();

  const { contributor, counts, recent } = loaded;
  // Featured / approved. Surfaced verbatim; with small N this is noisy, so
  // we suppress it under five approved submissions (treat as "not enough
  // signal" rather than render 0% / 100% extremes).
  const accuracy =
    counts.approved >= 5
      ? Math.round((counts.featured / counts.approved) * 100)
      : null;

  const joined = contributor.createdAt.toLocaleDateString(undefined, {
    month: "short",
    year: "numeric",
  });

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Person",
    name: `@${contributor.displayHandle}`,
    alternateName: contributor.displayHandle,
    description: contributor.bio ?? undefined,
    url: absoluteUrl(`/contributors/${contributor.slug}`),
  };

  return (
    <PublicShell
      classification={[{ text: "● Open Channel // Contributor Profile" }]}
    >
      <JsonLd data={jsonLd} />
      <main className="max-w-3xl mx-auto px-6 pt-8 md:pt-12 pb-24">
        <Link
          href="/intel"
          className="mono-label hover:text-white transition-colors inline-flex items-center gap-1.5 mb-6"
        >
          <span>←</span>
          <span>All intel</span>
        </Link>

        <article className="rex-card p-8 mb-8">
          <div
            className="text-[10px] font-mono uppercase tracking-widest mb-2"
            style={{ color: "var(--rex-text-dim)" }}
          >
            ▸ Contributor · joined {joined}
          </div>
          <h1 className="font-display text-3xl md:text-4xl font-semibold tracking-tight text-white mb-4 leading-tight">
            @{contributor.displayHandle}
          </h1>

          {contributor.bio && (
            <p
              className="text-sm leading-relaxed mb-6"
              style={{ color: "var(--rex-text-muted)" }}
            >
              {contributor.bio}
            </p>
          )}

          <div className="grid grid-cols-3 gap-4 mt-6">
            <Stat label="Approved" value={counts.approved.toLocaleString()} />
            <Stat label="Featured" value={counts.featured.toLocaleString()} />
            <Stat
              label="Accuracy"
              value={accuracy === null ? "—" : `${accuracy}%`}
              hint={
                accuracy === null
                  ? "Needs ≥5 approved submissions"
                  : "Featured / approved"
              }
            />
          </div>
        </article>

        <section>
          <h2
            className="text-[10px] font-mono uppercase tracking-widest mb-3"
            style={{ color: "var(--rex-text-dim)" }}
          >
            Recent contributions
          </h2>
          {recent.length === 0 ? (
            <div
              className="rex-card-flat p-6 text-sm"
              style={{ color: "var(--rex-text-dim)" }}
            >
              No published submissions yet.
            </div>
          ) : (
            <ul className="space-y-2">
              {recent.map((r) => {
                const path = SURFACE_PATH[r.type] ?? `/${r.type}s`;
                const title = payloadTitle(r.type, r.payload);
                const dateLabel = r.publishedAt
                  ? new Date(r.publishedAt).toLocaleDateString(undefined, {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })
                  : "";
                return (
                  <li key={r.publicId}>
                    <Link
                      href={detailHref(path, r.publicId, title)}
                      className="rex-card block p-4 hover:bg-[var(--rex-surface-2)] transition-colors group"
                    >
                      <div className="flex items-center gap-2 mb-1 text-[10px] font-mono uppercase tracking-widest">
                        <span style={{ color: "var(--rex-accent-2)" }}>
                          {SURFACE_LABEL[r.type] ?? r.type}
                        </span>
                        {r.featured && (
                          <span style={{ color: "var(--rex-accent)" }}>
                            ★ Featured
                          </span>
                        )}
                        {dateLabel && (
                          <span
                            className="ml-auto"
                            style={{ color: "var(--rex-text-dim)" }}
                          >
                            {dateLabel}
                          </span>
                        )}
                      </div>
                      <div className="font-display text-base text-white group-hover:text-[var(--rex-accent)] transition-colors">
                        {title}
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </main>
    </PublicShell>
  );
}

function Stat({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div>
      <div
        className="text-[10px] font-mono uppercase tracking-widest mb-1"
        style={{ color: "var(--rex-text-dim)" }}
      >
        {label}
      </div>
      <div className="font-display text-2xl text-white tabular-nums">
        {value}
      </div>
      {hint && (
        <div
          className="text-[10px] font-mono mt-1"
          style={{ color: "var(--rex-text-dim)" }}
        >
          {hint}
        </div>
      )}
    </div>
  );
}
