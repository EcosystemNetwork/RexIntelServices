import Link from "next/link";
import type { Metadata } from "next";
import { and, desc, eq } from "drizzle-orm";
import { db, submissions } from "@/lib/db";
import type { GrantPayload } from "@/lib/db/schema";
import { ResourceListShell, EmptyState } from "@/components/resource-shell";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Grants — Rex Intel Services",
  description:
    "Active grant programs funding crypto builders: protocols, foundations, public-goods initiatives. Curated by RexIntel.",
  openGraph: {
    title: "Grants — Rex Intel Services",
    description:
      "Active grant programs funding crypto builders: protocols, foundations, public-goods initiatives.",
    type: "website",
  },
};

export default async function GrantsPage() {
  const rows = await db
    .select({
      id: submissions.id,
      publicId: submissions.publicId,
      payload: submissions.payload,
      publishedAt: submissions.publishedAt,
      featured: submissions.featured,
    })
    .from(submissions)
    .where(and(eq(submissions.type, "grant"), eq(submissions.status, "approved")))
    .orderBy(desc(submissions.featured), desc(submissions.publishedAt))
    .limit(200);

  const visible = rows.map((r) => ({ ...r, payload: r.payload as GrantPayload }));

  return (
    <ResourceListShell
      classification={[
        { text: "● Open Channel // Capital Allocation" },
        { text: "Active Grant Programs", show: "sm" },
      ]}
      kicker="▸ Grants"
      title="Capital for builders."
      subtitle="Active grant programs from protocols, foundations, and public-goods initiatives. Curated by RexIntel."
      submitHref="/submit?type=grant"
      submitLabel="+ Add Grant ▸"
      pasteHint={
        <>
          Running a grant program?{" "}
          <Link
            href="/submit?type=grant"
            className="text-[var(--rex-accent)] hover:text-white transition-colors underline decoration-dotted underline-offset-2"
          >
            Submit it
          </Link>{" "}
          — programs from ethereum.org, optimism.io, gitcoin.co and similar trusted hosts publish instantly.
        </>
      }
    >
      {visible.length === 0 ? (
        <EmptyState>No grant programs on file yet.</EmptyState>
      ) : (
        <div className="space-y-2">
          {visible.map((g) => (
            <GrantCard
              key={g.id}
              publicId={g.publicId}
              payload={g.payload}
              featured={g.featured}
            />
          ))}
        </div>
      )}
    </ResourceListShell>
  );
}

function GrantCard({
  publicId,
  payload,
  featured = false,
}: {
  publicId: string;
  payload: GrantPayload;
  featured?: boolean;
}) {
  const deadlineLabel = payload.deadline
    ? new Date(payload.deadline).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : payload.rolling
      ? "Rolling"
      : null;

  return (
    <Link
      href={`/grants/${publicId}`}
      className="rex-card block p-5 hover:bg-[var(--rex-surface-2)] transition-colors group"
      style={
        featured
          ? {
              borderColor: "rgba(95,185,31,0.45)",
              background:
                "linear-gradient(135deg, rgba(95,185,31,0.05) 0%, rgba(31,168,224,0.03) 100%)",
            }
          : undefined
      }
    >
      <div className="flex items-center gap-2 mb-2 text-[10px] font-mono uppercase tracking-widest">
        {featured && (
          <span
            className="px-1.5 py-0.5 rounded-sm"
            style={{
              background: "rgba(95,185,31,0.12)",
              color: "var(--rex-accent)",
              border: "1px solid rgba(95,185,31,0.45)",
            }}
          >
            ★ Featured
          </span>
        )}
        <span style={{ color: "var(--rex-text-dim)" }}>
          {payload.organization}
        </span>
        {payload.amount && (
          <span style={{ color: "var(--rex-text-muted)" }}>
            · {payload.amount}
          </span>
        )}
        {deadlineLabel && (
          <span
            className="ml-auto"
            style={{ color: "var(--rex-text-dim)" }}
          >
            Deadline: {deadlineLabel}
          </span>
        )}
      </div>

      <h3 className="font-display text-lg text-white mb-1.5 group-hover:text-[var(--rex-accent)] transition-colors">
        {payload.name}
      </h3>

      <p className="text-sm text-[var(--rex-text-muted)] line-clamp-2 leading-relaxed">
        {payload.description}
      </p>

      {payload.focus && (
        <div
          className="mt-3 text-[10px] font-mono"
          style={{ color: "var(--rex-text-dim)" }}
        >
          Focus: <span className="text-[var(--rex-text-muted)]">{payload.focus}</span>
        </div>
      )}
    </Link>
  );
}
