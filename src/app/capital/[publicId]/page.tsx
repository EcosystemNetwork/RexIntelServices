import Link from "next/link";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { cache } from "react";
import { and, eq } from "drizzle-orm";
import { db, submissions } from "@/lib/db";
import type { CapitalPayload } from "@/lib/db/schema";
import { PublicShell } from "@/components/public-shell";
import { JsonLd } from "@/components/json-ld";
import { ProgramHero } from "@/components/program-hero";
import { absoluteUrl } from "@/lib/site-url";
import { parsePublicId, detailSegment, detailHref } from "@/lib/slug";

export const dynamic = "force-dynamic";

const loadFund = cache(async (publicId: string) => {
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
        eq(submissions.type, "capital"),
        eq(submissions.status, "approved"),
      ),
    )
    .limit(1);
  if (!row) return undefined;
  return { ...row, payload: row.payload as CapitalPayload };
});

export async function generateMetadata({
  params,
}: {
  params: { publicId: string };
}): Promise<Metadata> {
  const realId = parsePublicId(params.publicId);
  if (!realId) return { title: "Fund not found — Rex Intel Services" };
  const row = await loadFund(realId);
  if (!row) return { title: "Fund not found — Rex Intel Services" };
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

export default async function CapitalDetailPage({
  params,
}: {
  params: { publicId: string };
}) {
  const realId = parsePublicId(params.publicId);
  if (!realId) notFound();
  const row = await loadFund(realId);
  if (!row) notFound();
  const p = row.payload;
  const canonical = detailSegment(realId, p.name);
  if (params.publicId !== canonical) {
    redirect(detailHref("/capital", realId, p.name));
  }

  const jsonLd: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: p.name,
    description: p.description,
    url: absoluteUrl(detailHref("/capital", realId, p.name)),
    sameAs: p.organizationUrl ? [p.organizationUrl] : undefined,
  };

  return (
    <PublicShell classification={[{ text: "● Open Channel // Capital Detail" }]}>
      <JsonLd data={jsonLd} />
      <main className="max-w-3xl mx-auto px-6 pt-8 md:pt-12 pb-24">
        <Link
          href="/intel?lane=capital"
          className="mono-label hover:text-[var(--rex-text)] transition-colors inline-flex items-center gap-1.5 mb-6"
        >
          <span>←</span>
          <span>All funds</span>
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
            {p.stage && <Chip>{p.stage}</Chip>}
            {p.checkSize && <Chip>{p.checkSize}</Chip>}
            {p.location && <Chip>{p.location}</Chip>}
            {p.focus && <Chip>{p.focus}</Chip>}
            {p.decisionWindow && <Chip accent>{p.decisionWindow}</Chip>}
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

          {p.pitchUrl && (
            <a href={p.pitchUrl} target="_blank" rel="noopener noreferrer" className="rex-btn">
              Pitch ▸
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
