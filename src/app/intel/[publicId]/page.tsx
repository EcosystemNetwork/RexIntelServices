import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db, submissions } from "@/lib/db";
import type { IntelPayload } from "@/lib/db/schema";
import { PublicShell } from "@/components/public-shell";

export const dynamic = "force-dynamic";

async function loadIntel(publicId: string) {
  const [row] = await db
    .select({
      payload: submissions.payload,
      submitterHandle: submissions.submitterHandle,
      publishedAt: submissions.publishedAt,
    })
    .from(submissions)
    .where(
      and(
        eq(submissions.publicId, publicId),
        eq(submissions.type, "intel"),
        eq(submissions.status, "approved"),
      ),
    )
    .limit(1);
  return row;
}

export async function generateMetadata({
  params,
}: {
  params: { publicId: string };
}): Promise<Metadata> {
  const row = await loadIntel(params.publicId);
  if (!row) {
    return { title: "Intel not found — Rex Intel Services" };
  }
  const p = row.payload as IntelPayload;
  const desc = p.body.replace(/\s+/g, " ").trim().slice(0, 200);
  const title = `${p.headline} — Rex Intel Services`;
  return {
    title,
    description: desc,
    openGraph: { title, description: desc, type: "article" },
    twitter: { card: "summary", title, description: desc },
  };
}

const SEVERITY_TONE: Record<
  NonNullable<IntelPayload["severity"]>,
  { bg: string; fg: string; border: string }
> = {
  low: {
    bg: "rgba(136,136,160,0.08)",
    fg: "var(--rex-text-muted)",
    border: "rgba(136,136,160,0.25)",
  },
  medium: {
    bg: "rgba(96,165,250,0.10)",
    fg: "var(--rex-info)",
    border: "rgba(96,165,250,0.30)",
  },
  high: {
    bg: "rgba(251,191,36,0.10)",
    fg: "var(--rex-warning)",
    border: "rgba(251,191,36,0.30)",
  },
  critical: {
    bg: "rgba(248,113,113,0.10)",
    fg: "var(--rex-danger)",
    border: "rgba(248,113,113,0.30)",
  },
};

export default async function IntelDetailPage({
  params,
}: {
  params: { publicId: string };
}) {
  const row = await loadIntel(params.publicId);
  if (!row) notFound();

  const payload = row.payload as IntelPayload;
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

  return (
    <PublicShell
      sceneHeight="360px"
      classification={[{ text: "● Open Channel // Intel Wire Detail" }]}
    >
      <main className="max-w-3xl mx-auto px-6 pt-8 md:pt-12 pb-24">
        <Link
          href="/intel"
          className="mono-label hover:text-white transition-colors inline-flex items-center gap-1.5 mb-6"
        >
          <span>←</span>
          <span>All intel</span>
        </Link>

        <article className="rex-card p-8">
          <div className="flex items-center gap-2 mb-3 text-[10px] font-mono uppercase tracking-widest">
            {payload.severity && tone && (
              <span
                className="px-2 py-0.5 rounded-sm"
                style={{
                  background: tone.bg,
                  color: tone.fg,
                  border: `1px solid ${tone.border}`,
                }}
              >
                {payload.severity}
              </span>
            )}
            {payload.category && (
              <span style={{ color: "var(--rex-text-dim)" }}>
                · {payload.category}
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

          <h1 className="font-display text-3xl md:text-4xl font-semibold tracking-tight text-white mb-6 leading-tight">
            {payload.headline}
          </h1>

          <div
            className="text-[var(--rex-text-muted)] leading-relaxed whitespace-pre-wrap mb-6"
            style={{ fontSize: "15px" }}
          >
            {payload.body}
          </div>

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

          <div
            className="mt-8 pt-5 border-t flex items-center justify-between"
            style={{ borderColor: "var(--rex-border-subtle)" }}
          >
            <span
              className="text-[11px] font-mono"
              style={{ color: "var(--rex-text-dim)" }}
            >
              Source:{" "}
              <span className="text-[var(--rex-text-muted)]">
                {sourceLabel}
              </span>
            </span>
            <Link
              href="/submit"
              className="text-[11px] font-mono uppercase tracking-widest text-[var(--rex-accent)] hover:text-white transition-colors"
            >
              Drop your own intel ▸
            </Link>
          </div>
        </article>
      </main>
    </PublicShell>
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
