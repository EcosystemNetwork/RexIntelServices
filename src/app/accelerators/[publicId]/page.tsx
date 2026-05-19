import Link from "next/link";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { cache } from "react";
import { and, eq } from "drizzle-orm";
import { db, submissions } from "@/lib/db";
import type { AcceleratorPayload } from "@/lib/db/schema";
import { PublicShell } from "@/components/public-shell";
import { JsonLd } from "@/components/json-ld";
import { ProgramHero } from "@/components/program-hero";
import { absoluteUrl } from "@/lib/site-url";
import { parsePublicId, detailSegment, detailHref } from "@/lib/slug";
import { SubmissionVoteStack } from "@/components/submission-vote-stack";

export const dynamic = "force-dynamic";

const loadAccelerator = cache(async (publicId: string) => {
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
        eq(submissions.type, "accelerator"),
        eq(submissions.status, "approved"),
      ),
    )
    .limit(1);
  if (!row) return undefined;
  return { ...row, payload: row.payload as AcceleratorPayload };
});

export async function generateMetadata({
  params,
}: {
  params: { publicId: string };
}): Promise<Metadata> {
  const realId = parsePublicId(params.publicId);
  if (!realId) return { title: "Accelerator not found — Rex Intel Services" };
  const row = await loadAccelerator(realId);
  if (!row) return { title: "Accelerator not found — Rex Intel Services" };
  const p = row.payload;
  const desc = p.description.replace(/\s+/g, " ").trim().slice(0, 200);
  const title = `${p.name} — ${p.organization} — Rex Intel Services`;
  return {
    title,
    description: desc,
    openGraph: { title, description: desc, type: "article", images: p.imageUrl ? [p.imageUrl] : undefined },
    twitter: { card: p.imageUrl ? "summary_large_image" : "summary", title, description: desc },
  };
}

export default async function AcceleratorDetailPage({
  params,
}: {
  params: { publicId: string };
}) {
  const realId = parsePublicId(params.publicId);
  if (!realId) notFound();
  const row = await loadAccelerator(realId);
  if (!row) notFound();
  const p = row.payload;
  const canonical = detailSegment(realId, p.name);
  if (params.publicId !== canonical) {
    redirect(detailHref("/accelerators", realId, p.name));
  }

  const deadlineLabel = p.nextDeadline
    ? new Date(p.nextDeadline).toLocaleDateString(undefined, {
        weekday: "short",
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : p.rolling
      ? "Rolling — accepting applications continuously"
      : null;

  const jsonLd: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "EducationalOccupationalProgram",
    name: p.name,
    description: p.description,
    url: absoluteUrl(detailHref("/accelerators", realId, p.name)),
    provider: {
      "@type": "Organization",
      name: p.organization,
      url: p.organizationUrl,
    },
    timeToComplete: p.duration,
    educationalProgramMode: p.location?.toLowerCase().includes("remote") ? "online" : "onsite",
  };

  return (
    <PublicShell classification={[{ text: "● Open Channel // Accelerator Detail" }]}>
      <JsonLd data={jsonLd} />
      <main className="max-w-3xl mx-auto px-6 pt-8 md:pt-12 pb-24">
        <Link
          href="/intel?lane=accelerators"
          className="mono-label hover:text-[var(--rex-text)] transition-colors inline-flex items-center gap-1.5 mb-6"
        >
          <span>←</span>
          <span>All accelerators</span>
        </Link>

        <ProgramHero imageUrl={p.imageUrl} alt={`${p.name} — ${p.organization}`} />

        <article className="rex-card p-8">
          <div className="text-[11px] font-mono uppercase tracking-widest mb-2" style={{ color: "var(--rex-text-dim)" }}>
            {p.organizationUrl ? (
              <a href={p.organizationUrl} target="_blank" rel="noopener noreferrer" className="hover:text-[var(--rex-accent)]">
                {p.organization}
              </a>
            ) : (
              p.organization
            )}
          </div>

          <h1 className="font-display text-3xl md:text-4xl font-semibold tracking-tight text-[var(--rex-text)] mb-4 leading-tight">
            {p.name}
          </h1>

          <div className="flex flex-wrap gap-2 mb-6 text-[10px] font-mono uppercase tracking-widest">
            {p.investment && <Chip>{p.investment}</Chip>}
            {p.duration && <Chip>{p.duration}</Chip>}
            {p.location && <Chip>{p.location}</Chip>}
            {p.focus && <Chip>{p.focus}</Chip>}
            {deadlineLabel && <Chip accent>{deadlineLabel}</Chip>}
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

        <SubmissionVoteStack submissionId={row.id} publicId={realId} />
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
