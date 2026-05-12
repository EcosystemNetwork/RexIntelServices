import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";
import { and, desc, eq, sql } from "drizzle-orm";
import { db, submissions, addresses, intelAddresses } from "@/lib/db";
import type { IntelPayload, AddressRole } from "@/lib/db/schema";
import { PublicShell } from "@/components/public-shell";
import { CHAIN_SLUG_SET, chainLabel, explorerUrl } from "@/lib/chains";

export const dynamic = "force-dynamic";

/**
 * Canonical public page for a single (chain, address) pair. Surfaces every
 * approved intel item that mentions the address along with the role the
 * address played in each (subject / counterparty / observed). This is the
 * moat: every approved submission compounds into an indexable, link-bait
 * SEO surface — "what does RexIntel know about 0x…?"
 *
 * 404s if:
 *   - the chain isn't in our allow-list (keeps the URL space tight)
 *   - the address isn't in the addresses table at all
 *   - no approved intel mentions it (we don't surface dangling addresses)
 */

type Loaded = {
  chain: string;
  address: string;
  label: string | null;
  notes: string | null;
  intel: Array<{
    publicId: string;
    payload: IntelPayload;
    publishedAt: Date | null;
    role: AddressRole;
  }>;
};

const ROLE_TONE: Record<
  AddressRole,
  { bg: string; fg: string; border: string }
> = {
  subject: {
    bg: "rgba(248,113,113,0.10)",
    fg: "var(--rex-danger)",
    border: "rgba(248,113,113,0.30)",
  },
  counterparty: {
    bg: "rgba(251,191,36,0.10)",
    fg: "var(--rex-warning)",
    border: "rgba(251,191,36,0.30)",
  },
  observed: {
    bg: "rgba(136,136,160,0.08)",
    fg: "var(--rex-text-muted)",
    border: "rgba(136,136,160,0.25)",
  },
};

const loadAddress = cache(
  async (chain: string, address: string): Promise<Loaded | undefined> => {
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

    const intel = await db
      .select({
        publicId: submissions.publicId,
        payload: submissions.payload,
        publishedAt: submissions.publishedAt,
        role: intelAddresses.role,
      })
      .from(intelAddresses)
      .innerJoin(submissions, eq(intelAddresses.submissionId, submissions.id))
      .where(
        and(
          eq(intelAddresses.addressId, row.id),
          eq(submissions.type, "intel"),
          eq(submissions.status, "approved"),
        ),
      )
      .orderBy(desc(submissions.publishedAt));

    if (intel.length === 0) return undefined; // see comment block above

    return {
      chain: row.chain,
      address: row.address,
      label: row.label,
      notes: row.notes,
      intel: intel.map((i) => ({
        publicId: i.publicId,
        payload: i.payload as IntelPayload,
        publishedAt: i.publishedAt,
        role: i.role,
      })),
    };
  },
);

export async function generateMetadata({
  params,
}: {
  params: { chain: string; address: string };
}): Promise<Metadata> {
  const row = await loadAddress(params.chain, params.address);
  if (!row) return { title: "Address not found — Rex Intel Services" };
  const labelPart = row.label ? `${row.label} · ` : "";
  const title = `${labelPart}${truncateAddr(row.address)} (${chainLabel(row.chain)}) — Rex Intel Services`;
  const desc = `${row.intel.length} approved intel ${row.intel.length === 1 ? "item" : "items"} mention this address. RexIntel maintains an analyst-reviewed graph of crypto addresses tied to ongoing investigations.`;
  return {
    title,
    description: desc,
    openGraph: { title, description: desc, type: "article" },
    twitter: { card: "summary", title, description: desc },
  };
}

export default async function AddressPage({
  params,
}: {
  params: { chain: string; address: string };
}) {
  const row = await loadAddress(params.chain, params.address);
  if (!row) notFound();

  const explorer = explorerUrl(row.chain, row.address);
  const subjectCount = row.intel.filter((i) => i.role === "subject").length;
  const counterpartyCount = row.intel.filter((i) => i.role === "counterparty").length;
  const observedCount = row.intel.filter((i) => i.role === "observed").length;

  return (
    <PublicShell
      classification={[
        { text: "● Open Channel // Address Dossier" },
        { text: chainLabel(row.chain), show: "sm" },
      ]}
    >
      <main className="max-w-3xl mx-auto px-6 pt-8 md:pt-12 pb-24">
        <Link
          href="/addresses"
          className="mono-label hover:text-white transition-colors inline-flex items-center gap-1.5 mb-6"
        >
          <span>←</span>
          <span>All addresses</span>
        </Link>

        <div className="mb-6">
          <p
            className="text-[10px] font-mono uppercase tracking-widest mb-2"
            style={{ color: "var(--rex-text-dim)" }}
          >
            ▸ {chainLabel(row.chain)} Address Dossier
          </p>
          {row.label && (
            <h1 className="font-display text-3xl md:text-4xl font-semibold tracking-tight text-white mb-2 leading-tight">
              {row.label}
            </h1>
          )}
          <div className="font-mono text-sm text-[var(--rex-text-muted)] break-all">
            {row.address}
          </div>
          {explorer && (
            <a
              href={explorer}
              target="_blank"
              rel="noopener noreferrer"
              className="mono-label-accent inline-flex items-center gap-1 mt-2 hover:text-white transition-colors text-[10px]"
            >
              View on block explorer ▸
            </a>
          )}
        </div>

        <div className="grid grid-cols-3 gap-3 mb-8">
          <Stat
            label="As subject"
            value={subjectCount}
            tone="danger"
            hint="The address the intel is about"
          />
          <Stat
            label="As counterparty"
            value={counterpartyCount}
            tone="warning"
            hint="Linked / receiving party"
          />
          <Stat
            label="Observed"
            value={observedCount}
            tone="dim"
            hint="Mentioned but unattributed"
          />
        </div>

        {row.notes && (
          <div
            className="rex-card p-5 mb-8"
            style={{ borderColor: "var(--rex-border-subtle)" }}
          >
            <div
              className="text-[10px] font-mono uppercase tracking-widest mb-2"
              style={{ color: "var(--rex-text-dim)" }}
            >
              Analyst notes
            </div>
            <p className="text-sm text-[var(--rex-text-muted)] whitespace-pre-wrap leading-relaxed">
              {row.notes}
            </p>
          </div>
        )}

        <div className="rex-divider mb-5">
          <span>
            Intel mentioning this address ({row.intel.length})
          </span>
        </div>

        <div className="space-y-3">
          {row.intel.map((i) => {
            const tone = ROLE_TONE[i.role];
            const dateLabel = i.publishedAt
              ? new Date(i.publishedAt).toLocaleDateString(undefined, {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })
              : "";
            return (
              <Link
                key={i.publicId}
                href={`/intel/${i.publicId}`}
                className="rex-card block p-5 hover:bg-[var(--rex-surface-2)] transition-colors group"
              >
                <div className="flex items-center gap-2 mb-2 text-[10px] font-mono uppercase tracking-widest">
                  <span
                    className="px-1.5 py-0.5 rounded-sm"
                    style={{
                      background: tone.bg,
                      color: tone.fg,
                      border: `1px solid ${tone.border}`,
                    }}
                  >
                    {i.role}
                  </span>
                  {i.payload.severity && (
                    <span style={{ color: "var(--rex-text-dim)" }}>
                      · {i.payload.severity}
                    </span>
                  )}
                  {i.payload.category && (
                    <span style={{ color: "var(--rex-text-dim)" }}>
                      · {i.payload.category}
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
                <h3 className="font-display text-lg text-white mb-1.5 group-hover:text-[var(--rex-accent)] transition-colors">
                  {i.payload.headline}
                </h3>
                <p className="text-sm text-[var(--rex-text-muted)] line-clamp-2 leading-relaxed">
                  {i.payload.body}
                </p>
              </Link>
            );
          })}
        </div>

        <div
          className="mt-10 pt-6 border-t flex items-center justify-between"
          style={{ borderColor: "var(--rex-border-subtle)" }}
        >
          <span
            className="text-[11px] font-mono"
            style={{ color: "var(--rex-text-dim)" }}
          >
            Know something about this address?
          </span>
          <Link
            href="/submit?type=intel"
            className="text-[11px] font-mono uppercase tracking-widest text-[var(--rex-accent)] hover:text-white transition-colors"
          >
            Drop intel ▸
          </Link>
        </div>
      </main>
    </PublicShell>
  );
}

function Stat({
  label,
  value,
  tone,
  hint,
}: {
  label: string;
  value: number;
  tone: "danger" | "warning" | "dim";
  hint: string;
}) {
  const colorVar =
    tone === "danger"
      ? "var(--rex-danger)"
      : tone === "warning"
        ? "var(--rex-warning)"
        : "var(--rex-text-muted)";
  return (
    <div
      className="rex-card p-4"
      style={{ borderColor: "var(--rex-border-subtle)" }}
    >
      <div
        className="text-[10px] font-mono uppercase tracking-widest mb-1"
        style={{ color: "var(--rex-text-dim)" }}
      >
        {label}
      </div>
      <div
        className="font-display text-2xl font-semibold tabular-nums"
        style={{ color: colorVar }}
      >
        {value}
      </div>
      <div
        className="text-[10px] font-mono mt-1"
        style={{ color: "var(--rex-text-dim)" }}
      >
        {hint}
      </div>
    </div>
  );
}

function truncateAddr(addr: string): string {
  if (addr.length <= 12) return addr;
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}
