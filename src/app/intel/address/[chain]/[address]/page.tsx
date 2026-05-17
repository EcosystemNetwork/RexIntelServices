import { cache } from "react";
import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { and, desc, eq, sql } from "drizzle-orm";
import {
  db,
  submissions,
  addresses,
  intelAddresses,
} from "@/lib/db";
import type { IntelPayload, AddressRole } from "@/lib/db/schema";
import { PublicShell } from "@/components/public-shell";
import { JsonLd } from "@/components/json-ld";
import { CHAIN_SLUG_SET, explorerUrl, SUPPORTED_CHAINS } from "@/lib/chains";
import { absoluteUrl } from "@/lib/site-url";
import { detailHref } from "@/lib/slug";

export const dynamic = "force-dynamic";

type LinkedIntel = {
  publicId: string;
  payload: IntelPayload;
  role: AddressRole;
  publishedAt: Date | null;
  submitterHandle: string | null;
};

type LoadedEntity = {
  id: string;
  chain: string;
  address: string;
  label: string | null;
  notes: string | null;
  intel: LinkedIntel[];
};

const loadEntity = cache(
  async (chain: string, address: string): Promise<LoadedEntity | undefined> => {
    if (!CHAIN_SLUG_SET.has(chain)) return undefined;
    const [row] = await db
      .select({
        id: addresses.id,
        chain: addresses.chain,
        address: addresses.address,
        label: addresses.label,
        notes: addresses.notes,
      })
      .from(addresses)
      .where(
        and(
          eq(addresses.chain, chain),
          sql`lower(${addresses.address}) = lower(${address})`,
        ),
      )
      .limit(1);
    if (!row) return undefined;

    const intelRows = await db
      .select({
        publicId: submissions.publicId,
        payload: submissions.payload,
        role: intelAddresses.role,
        publishedAt: submissions.publishedAt,
        submitterHandle: submissions.submitterHandle,
      })
      .from(intelAddresses)
      .innerJoin(submissions, eq(intelAddresses.submissionId, submissions.id))
      .where(
        and(
          eq(intelAddresses.addressId, row.id),
          eq(submissions.status, "approved"),
          eq(submissions.type, "intel"),
        ),
      )
      .orderBy(desc(submissions.publishedAt))
      .limit(200);

    return {
      ...row,
      intel: intelRows.map((r) => ({
        publicId: r.publicId,
        payload: r.payload as IntelPayload,
        role: r.role,
        publishedAt: r.publishedAt,
        submitterHandle: r.submitterHandle,
      })),
    };
  },
);

const ROLE_LABEL: Record<AddressRole, string> = {
  subject: "Subject",
  counterparty: "Counterparty",
  observed: "Observed",
};

const ROLE_TONE: Record<AddressRole, { bg: string; fg: string; border: string }> = {
  subject: {
    bg: "rgba(248,113,113,0.10)",
    fg: "#f87171",
    border: "rgba(248,113,113,0.30)",
  },
  counterparty: {
    bg: "rgba(251,191,36,0.10)",
    fg: "var(--rex-warning)",
    border: "rgba(251,191,36,0.30)",
  },
  observed: {
    bg: "rgba(136,136,160,0.10)",
    fg: "var(--rex-text-muted)",
    border: "rgba(136,136,160,0.25)",
  },
};

function chainLabel(slug: string): string {
  return SUPPORTED_CHAINS.find((c) => c.slug === slug)?.label ?? slug;
}

function truncateAddress(addr: string, head = 8, tail = 6): string {
  if (addr.length <= head + tail + 3) return addr;
  return `${addr.slice(0, head)}…${addr.slice(-tail)}`;
}

export async function generateMetadata({
  params,
}: {
  params: { chain: string; address: string };
}): Promise<Metadata> {
  const entity = await loadEntity(params.chain, params.address);
  if (!entity) {
    return { title: "Entity not found — Rex Intel Services" };
  }
  const ref = entity.label
    ? `${entity.label} (${chainLabel(entity.chain)})`
    : `${chainLabel(entity.chain)} ${truncateAddress(entity.address)}`;
  return {
    title: `${ref} — Rex Intel Services`,
    description: `${entity.intel.length} intel ${
      entity.intel.length === 1 ? "report" : "reports"
    } reference this address on Rex Intel Services.`,
    alternates: { canonical: `/intel/address/${entity.chain}/${entity.address}` },
  };
}

export default async function EntityPage({
  params,
}: {
  params: { chain: string; address: string };
}) {
  const entity = await loadEntity(params.chain, params.address);
  if (!entity) notFound();

  const explorer = explorerUrl(entity.chain, entity.address);
  const counts = entity.intel.reduce(
    (acc, r) => {
      acc[r.role] = (acc[r.role] ?? 0) + 1;
      return acc;
    },
    { subject: 0, counterparty: 0, observed: 0 } as Record<AddressRole, number>,
  );

  const canonicalUrl = absoluteUrl(
    `/intel/address/${entity.chain}/${entity.address}`,
  );

  const jsonLd: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Thing",
    name: entity.label ?? `${entity.chain}:${entity.address}`,
    identifier: `${entity.chain}:${entity.address}`,
    description: entity.notes ?? undefined,
    url: canonicalUrl,
    sameAs: explorer ? [explorer] : undefined,
    subjectOf: entity.intel.length
      ? entity.intel.map((r) => ({
          "@type": "NewsArticle",
          headline: r.payload.headline,
          url: absoluteUrl(detailHref("/intel", r.publicId, r.payload.headline)),
          datePublished: r.publishedAt?.toISOString(),
        }))
      : undefined,
  };

  return (
    <PublicShell
      classification={[{ text: "● Open Channel // Entity Graph" }]}
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

        <article className="rex-card p-8">
          <div className="flex items-center gap-2 mb-3 text-[10px] font-mono uppercase tracking-widest">
            <span
              className="px-2 py-0.5 rounded-sm"
              style={{
                background: "rgba(31,168,224,0.10)",
                color: "var(--rex-accent-2)",
                border: "1px solid rgba(31,168,224,0.25)",
              }}
            >
              {chainLabel(entity.chain)}
            </span>
            <span style={{ color: "var(--rex-text-dim)" }}>
              {entity.intel.length}{" "}
              {entity.intel.length === 1 ? "mention" : "mentions"} on file
            </span>
          </div>

          <h1 className="font-display text-2xl md:text-3xl font-semibold tracking-tight text-white mb-3 leading-tight break-all">
            {entity.label ?? truncateAddress(entity.address, 12, 10)}
          </h1>

          <div
            className="font-mono text-xs break-all mb-5"
            style={{ color: "var(--rex-text-muted)" }}
          >
            {explorer ? (
              <a
                href={explorer}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[var(--rex-accent)] hover:underline"
              >
                {entity.address}
              </a>
            ) : (
              entity.address
            )}
          </div>

          {entity.notes && (
            <p
              className="text-sm leading-relaxed"
              style={{ color: "var(--rex-text-muted)" }}
            >
              {entity.notes}
            </p>
          )}

          <div className="mt-6 flex flex-wrap gap-3 text-[10px] font-mono uppercase tracking-widest">
            {(["subject", "counterparty", "observed"] as const).map((role) => {
              if (counts[role] === 0) return null;
              const tone = ROLE_TONE[role];
              return (
                <span
                  key={role}
                  className="px-2 py-0.5 rounded-sm"
                  style={{
                    background: tone.bg,
                    color: tone.fg,
                    border: `1px solid ${tone.border}`,
                  }}
                >
                  {counts[role]} × {ROLE_LABEL[role]}
                </span>
              );
            })}
          </div>
        </article>

        <section className="mt-8">
          <h2
            className="text-[10px] font-mono uppercase tracking-widest mb-3"
            style={{ color: "var(--rex-text-dim)" }}
          >
            Intel referencing this address
          </h2>
          {entity.intel.length === 0 ? (
            <div
              className="rex-card-flat p-6 text-sm"
              style={{ color: "var(--rex-text-dim)" }}
            >
              No approved intel mentions this address yet.
            </div>
          ) : (
            <ul className="space-y-2">
              {entity.intel.map((r) => {
                const tone = ROLE_TONE[r.role];
                const dateLabel = r.publishedAt
                  ? new Date(r.publishedAt).toLocaleDateString(undefined, {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })
                  : "";
                const handle = r.payload.anonymous ? null : r.submitterHandle;
                return (
                  <li key={r.publicId}>
                    <Link
                      href={detailHref("/intel", r.publicId, r.payload.headline)}
                      className="rex-card block p-4 hover:bg-[var(--rex-surface-2)] transition-colors group"
                    >
                      <div className="flex items-center gap-2 mb-1.5 text-[10px] font-mono uppercase tracking-widest">
                        <span
                          className="px-1.5 py-0.5 rounded-sm"
                          style={{
                            background: tone.bg,
                            color: tone.fg,
                            border: `1px solid ${tone.border}`,
                          }}
                        >
                          {ROLE_LABEL[r.role]}
                        </span>
                        {r.payload.kind === "incident" && (
                          <span style={{ color: "#f87171" }}>Incident</span>
                        )}
                        {r.payload.kind === "original" && (
                          <span style={{ color: "var(--rex-accent)" }}>
                            Original
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
                      <div className="font-display text-base text-white group-hover:text-[var(--rex-accent)] transition-colors mb-1">
                        {r.payload.headline}
                      </div>
                      <p className="text-xs text-[var(--rex-text-muted)] line-clamp-2 leading-relaxed">
                        {r.payload.body}
                      </p>
                      <div
                        className="text-[10px] font-mono mt-2"
                        style={{ color: "var(--rex-text-dim)" }}
                      >
                        Source:{" "}
                        <span style={{ color: "var(--rex-text-muted)" }}>
                          {handle ? `@${handle}` : "Anonymous"}
                        </span>
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
