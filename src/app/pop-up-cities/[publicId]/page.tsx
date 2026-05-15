import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";
import { and, eq, inArray } from "drizzle-orm";
import { db, submissions } from "@/lib/db";
import type { PopupCityPayload } from "@/lib/db/schema";
import { PublicShell } from "@/components/public-shell";
import { JsonLd } from "@/components/json-ld";
import { ProxiedImage } from "@/components/proxied-image";
import { absoluteUrl } from "@/lib/site-url";

export const dynamic = "force-dynamic";

const loadCity = cache(async (publicId: string) => {
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
        // Residencies share this detail page since both types have the same
        // (name, multi-week dates, location, apply URL) shape — keeps the
        // residency lane working without forking the renderer. If they
        // diverge later, split into /residencies/[publicId] then.
        inArray(submissions.type, ["popup_city", "residency"]),
        eq(submissions.status, "approved"),
      ),
    )
    .limit(1);
  if (!row) return undefined;
  return { ...row, payload: row.payload as PopupCityPayload };
});

export async function generateMetadata({
  params,
}: {
  params: { publicId: string };
}): Promise<Metadata> {
  const row = await loadCity(params.publicId);
  if (!row) return { title: "Pop-up city not found — Rex Intel Services" };
  const p = row.payload;
  const desc = p.description.replace(/\s+/g, " ").trim().slice(0, 200);
  const title = `${p.name} — Rex Intel Services`;
  return {
    title,
    description: desc,
    openGraph: { title, description: desc, type: "article", images: p.imageUrl ? [p.imageUrl] : undefined },
    twitter: { card: p.imageUrl ? "summary_large_image" : "summary", title, description: desc },
  };
}

export default async function PopUpCityDetailPage({
  params,
}: {
  params: { publicId: string };
}) {
  const row = await loadCity(params.publicId);
  if (!row) notFound();
  const p = row.payload;

  const start = new Date(p.startsAt);
  const end = new Date(p.endsAt);
  const range = formatRange(start, end);
  const location = [p.city, p.country].filter(Boolean).join(", ");
  const applyDeadline = p.applicationDeadline
    ? new Date(p.applicationDeadline).toLocaleDateString(undefined, {
        weekday: "short",
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : null;

  const jsonLd: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Event",
    name: p.name,
    startDate: p.startsAt,
    endDate: p.endsAt,
    description: p.description,
    url: absoluteUrl(`/pop-up-cities/${params.publicId}`),
    eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
    eventStatus: "https://schema.org/EventScheduled",
    image: p.imageUrl ? [p.imageUrl] : undefined,
    location: {
      "@type": "Place",
      name: p.venue ?? [p.city, p.country].filter(Boolean).join(", "),
      address: {
        "@type": "PostalAddress",
        addressLocality: p.city,
        addressCountry: p.country,
        streetAddress: p.venue,
      },
    },
    organizer: p.organization
      ? { "@type": "Organization", name: p.organization, url: p.organizationUrl }
      : undefined,
  };

  return (
    <PublicShell classification={[{ text: "● Open Channel // Pop-Up City Detail" }]}>
      <JsonLd data={jsonLd} />
      <main className="max-w-3xl mx-auto px-6 pt-8 md:pt-12 pb-24">
        <Link
          href="/intel?lane=cities"
          className="mono-label hover:text-white transition-colors inline-flex items-center gap-1.5 mb-6"
        >
          <span>←</span>
          <span>All pop-up cities</span>
        </Link>

        {p.imageUrl && (
          <ProxiedImage
            src={p.imageUrl}
            alt=""
            width={1200}
            height={384}
            className="w-full h-48 object-cover rounded-lg mb-4 border border-[var(--rex-border-subtle)]"
            priority
          />
        )}

        <article className="rex-card p-8">
          {p.organization && (
            <div className="text-[11px] font-mono uppercase tracking-widest mb-2" style={{ color: "var(--rex-text-dim)" }}>
              {p.organizationUrl ? (
                <a href={p.organizationUrl} target="_blank" rel="noopener noreferrer" className="hover:text-[var(--rex-accent)]">
                  {p.organization}
                </a>
              ) : (
                p.organization
              )}
            </div>
          )}

          <h1 className="font-display text-3xl md:text-4xl font-semibold tracking-tight text-white mb-4 leading-tight">
            {p.name}
          </h1>

          <div className="flex flex-wrap gap-2 mb-6 text-[10px] font-mono uppercase tracking-widest">
            <Chip accent>{range}</Chip>
            {location && <Chip>{location}</Chip>}
            {p.venue && <Chip>{p.venue}</Chip>}
            {p.focus && <Chip>{p.focus}</Chip>}
            {applyDeadline && <Chip accent>Apply by {applyDeadline}</Chip>}
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

          <div className="flex flex-wrap gap-3">
            {p.applyUrl && (
              <a href={p.applyUrl} target="_blank" rel="noopener noreferrer" className="rex-btn">
                Apply ▸
              </a>
            )}
            {p.url && (
              <a
                href={p.url}
                target="_blank"
                rel="noopener noreferrer"
                className="rex-btn-ghost"
              >
                Event page ▸
              </a>
            )}
          </div>
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

function formatRange(start: Date, end: Date): string {
  const sameMonth = start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear();
  const startLabel = start.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  const endLabel = sameMonth
    ? end.toLocaleDateString(undefined, { day: "numeric", year: "numeric" })
    : end.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  return `${startLabel}–${endLabel}`;
}
