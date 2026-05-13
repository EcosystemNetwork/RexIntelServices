import Link from "next/link";
import { PublicShell } from "@/components/public-shell";

/**
 * App-wide 404 — rendered by Next when a route returns notFound() or no
 * route matches. Stays on-brand with the classification-bar shell so the
 * miss feels like a deliberate part of the system, not a stack trace.
 */
export default function NotFound() {
  return (
    <PublicShell
      classification={[
        { text: "● No Signal // Channel 404" },
        { text: "Transmission Lost", show: "sm" },
      ]}
    >
      <main className="max-w-2xl mx-auto px-6 pt-16 md:pt-24 pb-24 text-center">
        <p
          className="text-xs uppercase tracking-widest mb-3"
          style={{ color: "var(--rex-text-dim)" }}
        >
          ▸ Status: Off-Grid
        </p>
        <h1 className="font-display text-5xl md:text-6xl font-semibold tracking-tight text-white mb-4">
          Channel not found.
        </h1>
        <p className="text-sm md:text-base text-[var(--rex-text-muted)] max-w-md mx-auto leading-relaxed mb-10">
          That transmission ID isn&apos;t in our logs — either the asset was
          revoked, the path is mistyped, or the source pulled the signal.
          Pick a known channel and we&apos;ll re-route.
        </p>

        <div className="flex flex-wrap items-center justify-center gap-2 text-xs font-mono uppercase tracking-widest">
          <ChannelLink href="/intel">Intel</ChannelLink>
          <ChannelLink href="/events">Events</ChannelLink>
          <ChannelLink href="/hackathons">Hacks</ChannelLink>
          <ChannelLink href="/intel?lane=cities">Cities</ChannelLink>
          <ChannelLink href="/intel?lane=grants">Grants</ChannelLink>
          <ChannelLink href="/intel?lane=accelerators">Accel</ChannelLink>
        </div>

        <div className="mt-10">
          <Link href="/" className="rex-btn">
            Return to Briefing Room ▸
          </Link>
        </div>
      </main>
    </PublicShell>
  );
}

function ChannelLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="px-3 py-1.5 rounded-sm transition-all border"
      style={{
        color: "var(--rex-text-dim)",
        borderColor: "var(--rex-border-subtle)",
      }}
    >
      {children}
    </Link>
  );
}
