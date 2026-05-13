import { cache } from "react";
import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db, submissions, addresses, intelAddresses } from "@/lib/db";
import type { IntelPayload, AddressRole } from "@/lib/db/schema";
import { PublicShell } from "@/components/public-shell";
import { JsonLd } from "@/components/json-ld";
import { explorerUrl } from "@/lib/chains";
import { absoluteUrl } from "@/lib/site-url";

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
  publishedAt: Date | null;
  addresses: LinkedAddress[];
};

const loadIntel = cache(
  async (publicId: string): Promise<LoadedIntel | undefined> => {
    const [row] = await db
      .select({
        id: submissions.id,
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
    if (!row) return undefined;

    const addrRows = await db
      .select({
        chain: addresses.chain,
        address: addresses.address,
        label: addresses.label,
        role: intelAddresses.role,
      })
      .from(intelAddresses)
      .innerJoin(addresses, eq(intelAddresses.addressId, addresses.id))
      .where(eq(intelAddresses.submissionId, row.id));

    return {
      id: row.id,
      payload: row.payload as IntelPayload,
      submitterHandle: row.submitterHandle,
      publishedAt: row.publishedAt,
      addresses: addrRows,
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
  const row = await loadIntel(params.publicId);
  if (!row) {
    return { title: "Intel not found — Rex Intel Services" };
  }
  const p = row.payload;
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

  const payload = row.payload;
  const linkedAddresses = row.addresses;
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

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: payload.headline,
    description: payload.body.slice(0, 300),
    datePublished: row.publishedAt?.toISOString(),
    author: {
      "@type": payload.anonymous ? "Organization" : "Person",
      name: payload.anonymous ? "Rex Intel Services (Anonymous source)" : sourceLabel,
    },
    publisher: {
      "@type": "Organization",
      name: "Rex Intel Services",
      url: absoluteUrl("/"),
    },
    mainEntityOfPage: absoluteUrl(`/intel/${params.publicId}`),
  };

  return (
    <PublicShell
      classification={[{ text: "● Open Channel // Intel Wire Detail" }]}
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

          {linkedAddresses.length > 0 && (
            <Section label="Addresses">
              <ul className="space-y-2 font-mono text-xs">
                {linkedAddresses.map((a, i) => {
                  const explorer = explorerUrl(a.chain, a.address);
                  const addressNode = explorer ? (
                    <a
                      href={explorer}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[var(--rex-accent)] hover:underline break-all"
                    >
                      {a.address}
                    </a>
                  ) : (
                    <span className="break-all text-[var(--rex-text-muted)]">
                      {a.address}
                    </span>
                  );
                  return (
                    <li key={i} className="flex flex-wrap items-baseline gap-2">
                      <span className="uppercase tracking-widest text-[10px] text-[var(--rex-text-dim)]">
                        {a.chain}
                      </span>
                      {addressNode}
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
