import { cache } from "react";
import Link from "next/link";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db, submissions } from "@/lib/db";
import type { EventPayload } from "@/lib/db/schema";
import { PublicShell } from "@/components/public-shell";
import { JsonLd } from "@/components/json-ld";
import { ProxiedImage } from "@/components/proxied-image";
import { absoluteUrl } from "@/lib/site-url";
import { parsePublicId, detailSegment, detailHref } from "@/lib/slug";

export const dynamic = "force-dynamic";

const loadEvent = cache(async (publicId: string) => {
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
        eq(submissions.type, "event"),
        eq(submissions.status, "approved"),
      ),
    )
    .limit(1);
  return row;
});

export async function generateMetadata({
  params,
}: {
  params: { publicId: string };
}): Promise<Metadata> {
  const realId = parsePublicId(params.publicId);
  if (!realId) return { title: "Event not found — Rex Intel Services" };
  const row = await loadEvent(realId);
  if (!row) {
    return { title: "Event not found — Rex Intel Services" };
  }
  const p = row.payload as EventPayload;
  const startLabel = new Date(p.startsAt).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  const location = [p.city, p.country].filter(Boolean).join(", ");
  const desc = [
    startLabel,
    location,
    p.eventType,
    p.description?.slice(0, 140),
  ]
    .filter(Boolean)
    .join(" · ");
  const title = `${p.name} — Rex Intel Services`;
  const images = p.imageUrl ? [{ url: p.imageUrl }] : undefined;
  return {
    title,
    description: desc || `Event listing on Rex Intel Services.`,
    openGraph: { title, description: desc, type: "article", images },
    twitter: {
      card: p.imageUrl ? "summary_large_image" : "summary",
      title,
      description: desc,
      images: p.imageUrl ? [p.imageUrl] : undefined,
    },
  };
}

export default async function EventDetailPage({
  params,
}: {
  params: { publicId: string };
}) {
  const realId = parsePublicId(params.publicId);
  if (!realId) notFound();
  const row = await loadEvent(realId);
  if (!row) notFound();

  const payload = row.payload as EventPayload;
  // Canonicalize: anyone hitting the bare publicId or a stale/mismatched slug
  // gets a 301 to the slug-prefixed URL.
  const canonical = detailSegment(realId, payload.name);
  if (params.publicId !== canonical) {
    redirect(detailHref("/events", realId, payload.name));
  }

  const start = new Date(payload.startsAt);
  const end = payload.endsAt ? new Date(payload.endsAt) : null;

  const isOnline = !payload.city && !payload.venue && !payload.country;
  const jsonLd: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Event",
    name: payload.name,
    startDate: payload.startsAt,
    endDate: payload.endsAt,
    description: payload.description,
    url: absoluteUrl(detailHref("/events", realId, payload.name)),
    eventAttendanceMode: isOnline
      ? "https://schema.org/OnlineEventAttendanceMode"
      : "https://schema.org/OfflineEventAttendanceMode",
    eventStatus: "https://schema.org/EventScheduled",
    isAccessibleForFree: payload.priceTier === "free" ? true : undefined,
    image: payload.imageUrl ? [payload.imageUrl] : undefined,
    location: isOnline
      ? {
          "@type": "VirtualLocation",
          url: payload.url ?? absoluteUrl(detailHref("/events", realId, payload.name)),
        }
      : {
          "@type": "Place",
          name: payload.venue ?? [payload.city, payload.country].filter(Boolean).join(", "),
          address: {
            "@type": "PostalAddress",
            addressLocality: payload.city,
            addressCountry: payload.country,
            streetAddress: payload.venue,
          },
        },
    organizer: payload.url
      ? { "@type": "Organization", name: payload.name, url: payload.url }
      : undefined,
  };

  return (
    <PublicShell
      classification={[{ text: "● Open Channel // Field Calendar Detail" }]}
    >
      <JsonLd data={jsonLd} />
      <main className="max-w-3xl mx-auto px-6 pt-8 md:pt-12 pb-24">
        <Link
          href="/events"
          className="mono-label hover:text-white transition-colors inline-flex items-center gap-1.5 mb-6"
        >
          <span>←</span>
          <span>All events</span>
        </Link>

        <div className="rex-card overflow-hidden">
          {payload.imageUrl && (
            <div
              className="relative w-full border-b"
              style={{
                borderColor: "var(--rex-border-subtle)",
                aspectRatio: "1200 / 630",
                background: "var(--rex-bg)",
              }}
            >
              <ProxiedImage
                src={payload.imageUrl}
                alt={payload.name}
                width={1200}
                height={630}
                className="absolute inset-0 w-full h-full object-cover"
                priority
              />
            </div>
          )}
          <div className="p-8">
          <div className="flex items-center gap-2 mb-3">
            {payload.eventType && (
              <span
                className="text-[10px] font-mono uppercase tracking-widest px-2 py-0.5 rounded-sm"
                style={{
                  background: "rgba(31,168,224,0.1)",
                  color: "var(--rex-accent-2)",
                  border: "1px solid rgba(31,168,224,0.25)",
                }}
              >
                {payload.eventType}
              </span>
            )}
            {payload.priceTier && (
              <span
                className="text-[10px] font-mono uppercase tracking-widest"
                style={{ color: "var(--rex-text-dim)" }}
              >
                · {payload.priceTier}
              </span>
            )}
          </div>

          <h1 className="font-display text-3xl md:text-4xl font-semibold tracking-tight text-white mb-6">
            {payload.name}
          </h1>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 mb-6">
            <DetailField label="Starts">
              {start.toLocaleString(undefined, {
                weekday: "short",
                month: "short",
                day: "numeric",
                year: "numeric",
                hour: "numeric",
                minute: "2-digit",
              })}
            </DetailField>
            {end && (
              <DetailField label="Ends">
                {end.toLocaleString(undefined, {
                  weekday: "short",
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                  hour: "numeric",
                  minute: "2-digit",
                })}
              </DetailField>
            )}
            {(payload.venue || payload.city || payload.country) && (
              <DetailField label="Location">
                {[payload.venue, payload.city, payload.country]
                  .filter(Boolean)
                  .join(", ")}
              </DetailField>
            )}
            {payload.url && (
              <DetailField label="Link">
                <a
                  href={payload.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[var(--rex-accent)] hover:underline font-mono text-xs break-all"
                >
                  {payload.url}
                </a>
              </DetailField>
            )}
          </div>

          {payload.description && (
            <div
              className="border-t pt-5"
              style={{ borderColor: "var(--rex-border-subtle)" }}
            >
              <p className="text-[var(--rex-text-muted)] leading-relaxed whitespace-pre-wrap">
                {payload.description}
              </p>
            </div>
          )}

          {payload.url && (
            <div className="mt-6">
              <a
                href={payload.url}
                target="_blank"
                rel="noopener noreferrer"
                className="rex-btn"
              >
                Visit event ▸
              </a>
            </div>
          )}
          </div>
        </div>

        {row.submitterHandle && (
          <p
            className="text-[11px] font-mono mt-4 text-center"
            style={{ color: "var(--rex-text-dim)" }}
          >
            Submitted by @{row.submitterHandle}
          </p>
        )}
      </main>
    </PublicShell>
  );
}

function DetailField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div
        className="text-[10px] font-mono uppercase tracking-widest mb-1"
        style={{ color: "var(--rex-text-dim)" }}
      >
        {label}
      </div>
      <div className="text-white text-sm">{children}</div>
    </div>
  );
}
