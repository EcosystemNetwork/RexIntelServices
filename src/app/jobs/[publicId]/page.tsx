import Link from "next/link";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { cache } from "react";
import { and, eq } from "drizzle-orm";
import { db, submissions } from "@/lib/db";
import type { JobPayload } from "@/lib/db/schema";
import { PublicShell } from "@/components/public-shell";
import { JsonLd } from "@/components/json-ld";
import { ProgramHero } from "@/components/program-hero";
import { absoluteUrl } from "@/lib/site-url";
import { parsePublicId, detailSegment, detailHref } from "@/lib/slug";

export const dynamic = "force-dynamic";

const loadJob = cache(async (publicId: string) => {
  const [row] = await db
    .select({
      id: submissions.id,
      payload: submissions.payload,
      publishedAt: submissions.publishedAt,
    })
    .from(submissions)
    .where(
      and(
        eq(submissions.publicId, publicId),
        eq(submissions.type, "job"),
        eq(submissions.status, "approved"),
      ),
    )
    .limit(1);
  if (!row) return undefined;
  return { ...row, payload: row.payload as JobPayload };
});

export async function generateMetadata({
  params,
}: {
  params: { publicId: string };
}): Promise<Metadata> {
  const realId = parsePublicId(params.publicId);
  if (!realId) return { title: "Job not found — Rex Intel Services" };
  const row = await loadJob(realId);
  if (!row) return { title: "Job not found — Rex Intel Services" };
  const p = row.payload;
  const desc = p.description.replace(/\s+/g, " ").trim().slice(0, 200);
  const title = `${p.title} at ${p.company} — Rex Intel Services`;
  return {
    title,
    description: desc,
    openGraph: { title, description: desc, type: "article", images: p.imageUrl ? [p.imageUrl] : undefined },
    twitter: { card: p.imageUrl ? "summary_large_image" : "summary", title, description: desc },
  };
}

export default async function JobDetailPage({
  params,
}: {
  params: { publicId: string };
}) {
  const realId = parsePublicId(params.publicId);
  if (!realId) notFound();
  const row = await loadJob(realId);
  if (!row) notFound();
  const p = row.payload;
  const canonical = detailSegment(realId, p.title);
  if (params.publicId !== canonical) {
    redirect(detailHref("/jobs", realId, p.title));
  }

  const jsonLd: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "JobPosting",
    title: p.title,
    description: p.description,
    datePosted: row.publishedAt?.toISOString(),
    validThrough: p.expiresAt,
    employmentType: p.employmentType,
    hiringOrganization: {
      "@type": "Organization",
      name: p.company,
      url: p.companyUrl,
    },
    jobLocationType: p.remote ? "TELECOMMUTE" : undefined,
    jobLocation: p.location
      ? {
          "@type": "Place",
          address: { "@type": "PostalAddress", addressLocality: p.location },
        }
      : undefined,
    applicantLocationRequirements: p.remote
      ? { "@type": "Country", name: "Anywhere" }
      : undefined,
    directApply: p.applyUrl ? true : undefined,
    url: absoluteUrl(detailHref("/jobs", realId, p.title)),
  };

  return (
    <PublicShell classification={[{ text: "● Open Channel // Job Detail" }]}>
      <JsonLd data={jsonLd} />
      <main className="max-w-3xl mx-auto px-6 pt-8 md:pt-12 pb-24">
        <Link
          href="/jobs"
          className="mono-label hover:text-white transition-colors inline-flex items-center gap-1.5 mb-6"
        >
          <span>←</span>
          <span>All jobs</span>
        </Link>

        <ProgramHero imageUrl={p.imageUrl} alt={`${p.title} — ${p.company}`} />

        <article className="rex-card p-8">
          <div className="text-[11px] font-mono uppercase tracking-widest mb-2" style={{ color: "var(--rex-text-dim)" }}>
            {p.companyUrl ? (
              <a href={p.companyUrl} target="_blank" rel="noopener noreferrer" className="hover:text-[var(--rex-accent)]">
                {p.company}
              </a>
            ) : (
              p.company
            )}
          </div>

          <h1 className="font-display text-3xl md:text-4xl font-semibold tracking-tight text-white mb-4 leading-tight">
            {p.title}
          </h1>

          <div className="flex flex-wrap gap-2 mb-6 text-[10px] font-mono uppercase tracking-widest">
            {p.location && <Chip>{p.location}</Chip>}
            {p.remote && <Chip accent>Remote</Chip>}
            {p.employmentType && <Chip>{p.employmentType}</Chip>}
            {p.seniority && <Chip>{p.seniority}</Chip>}
            {p.compensation && <Chip>{p.compensation}</Chip>}
          </div>

          <div
            className="text-[var(--rex-text-muted)] leading-relaxed whitespace-pre-wrap mb-6"
            style={{ fontSize: "15px" }}
          >
            {p.description}
          </div>

          {p.tags && p.tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-6">
              {p.tags.map((t) => (
                <span
                  key={t}
                  className="text-[10px] font-mono uppercase tracking-widest px-1.5 py-0.5 rounded-sm"
                  style={{
                    background: "rgba(136,136,160,0.08)",
                    color: "var(--rex-text-muted)",
                    border: "1px solid rgba(136,136,160,0.20)",
                  }}
                >
                  {t}
                </span>
              ))}
            </div>
          )}

          {p.applyUrl && (
            <a href={p.applyUrl} target="_blank" rel="noopener noreferrer" className="rex-btn">
              Apply ▸
            </a>
          )}
        </article>
      </main>
    </PublicShell>
  );
}

function Chip({ children, accent }: { children: React.ReactNode; accent?: boolean }) {
  return (
    <span
      className="px-2 py-0.5 rounded-sm"
      style={{
        background: accent ? "rgba(95,185,31,0.10)" : "rgba(136,136,160,0.08)",
        color: accent ? "var(--rex-accent)" : "var(--rex-text-muted)",
        border: `1px solid ${accent ? "rgba(95,185,31,0.30)" : "rgba(136,136,160,0.25)"}`,
      }}
    >
      {children}
    </span>
  );
}
