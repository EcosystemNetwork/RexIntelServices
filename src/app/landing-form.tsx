import Link from "next/link";
import { MarketIcon, SignalIcon, ShieldIcon } from "@/components/icons";
import { PublicShell } from "@/components/public-shell";
import { SubscribeWidget } from "./subscribe-widget";

export default function LandingForm() {
  const year = new Date().getFullYear();
  const transmissionId = `RX-${year}-${String(new Date().getMonth() + 1).padStart(2, "0")}`;

  return (
    <PublicShell
      sceneHeight="100vh"
      classification={[
        { text: "● Classified // Eyes Only" },
        { text: "Crypto Intelligence Division", show: "sm" },
        { text: `Transmission ${transmissionId}`, show: "md" },
      ]}
    >
      <main className="max-w-3xl mx-auto px-6 pt-12 sm:pt-16 md:pt-24 pb-24 text-center">
        <p className="font-display italic text-base sm:text-lg md:text-xl text-[var(--rex-text-muted)]/80 tracking-tight mb-5 animate-fade-in animate-fade-in-delay-1">
          We stay deep in the trenches so you don&apos;t have to...
        </p>

        <h1 className="font-display text-3xl sm:text-4xl md:text-5xl font-semibold tracking-tight text-white mb-4 animate-fade-in animate-fade-in-delay-2">
          Intelligence,{" "}
          <span
            style={{
              background:
                "linear-gradient(135deg, var(--rex-accent), var(--rex-accent-2))",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
            }}
          >
            delivered.
          </span>
        </h1>

        <p className="text-sm sm:text-base md:text-lg text-[var(--rex-text-muted)] leading-relaxed max-w-xl mx-auto mb-10 animate-fade-in animate-fade-in-delay-3">
          Crypto market intel, on-chain signals, and the events, grants,
          accelerators and pop-up cities the field is moving through — one
          weekly briefing, plus live boards.
        </p>

        <div className="animate-fade-in animate-fade-in-delay-3">
          <SubscribeWidget transmissionId={transmissionId} />
        </div>

        <div className="mt-16 animate-fade-in animate-fade-in-delay-4">
          <div className="rex-divider mb-8">
            <span>Intelligence Divisions</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-left">
            <DivisionCard
              code="DIV-01"
              href="/intel"
              icon={<MarketIcon className="w-5 h-5" />}
              title="Intel Wire"
              desc="Tips, sightings, and analyst-flagged signals on the digital asset complex."
            />
            <DivisionCard
              code="DIV-02"
              href="/events"
              icon={<SignalIcon className="w-5 h-5" />}
              title="Field Calendar"
              desc="Conferences, hackathons, happy hours and closed-door sessions worth tracking."
            />
            <DivisionCard
              code="DIV-03"
              href="/intel?lane=cities"
              icon={<ShieldIcon className="w-5 h-5" />}
              title="Pop-Up Cities"
              desc="Multi-week residencies — Zuzalu-style gatherings for builders and researchers."
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-left mt-3">
            <DivisionCard
              code="DIV-04"
              href="/intel?lane=grants"
              icon={<MarketIcon className="w-5 h-5" />}
              title="Grants"
              desc="Active funding programs from protocols, foundations, and public-goods initiatives."
            />
            <DivisionCard
              code="DIV-05"
              href="/intel?lane=accelerators"
              icon={<SignalIcon className="w-5 h-5" />}
              title="Accelerators"
              desc="Accelerators and incubators currently accepting applications — crypto-native and broader founder programs."
            />
          </div>
        </div>
      </main>
    </PublicShell>
  );
}

function DivisionCard({
  code,
  href,
  icon,
  title,
  desc,
}: {
  code: string;
  href?: string;
  icon: React.ReactNode;
  title: string;
  desc: string;
}) {
  const body = (
    <>
      <div className="flex items-center justify-between mb-4">
        <div className="inline-flex items-center justify-center w-9 h-9 rounded-sm bg-[var(--rex-bg)] border border-[var(--rex-border-subtle)] text-[var(--rex-accent)] group-hover:border-[var(--rex-accent)] transition-all">
          {icon}
        </div>
        <span className="mono-label-accent text-[10px]">{code}</span>
      </div>
      <h3 className="font-display text-lg font-semibold text-white mb-1.5 tracking-tight">
        {title}
      </h3>
      <p className="text-[13px] text-[var(--rex-text-muted)] leading-relaxed">
        {desc}
      </p>
    </>
  );

  if (href) {
    return (
      <Link href={href} className="rex-card-flat p-5 group block hover:bg-[var(--rex-surface-2)]">
        {body}
      </Link>
    );
  }
  return <div className="rex-card-flat p-5 group cursor-default">{body}</div>;
}
