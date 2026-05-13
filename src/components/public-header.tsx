import Image from "next/image";
import Link from "next/link";

export function PublicHeader({
  // When the hero animation is present it already paints the wordmark, so we
  // suppress the duplicate brand text and keep the header to mascot + nav.
  brandInScene = false,
}: {
  brandInScene?: boolean;
} = {}) {
  return (
    <nav className="relative z-10 flex items-center justify-between gap-3 px-4 sm:px-6 md:px-12 py-5 max-w-7xl mx-auto">
      <Link href="/" className="flex items-center gap-2 sm:gap-3 min-w-0">
        <div className="w-9 h-9 shrink-0 rounded-sm overflow-hidden bg-white/95 ring-1 ring-[var(--rex-accent)]/40 flex items-center justify-center">
          <Image
            src="/rex-mascot.jpg"
            alt={brandInScene ? "Rex Intel Services" : ""}
            width={80}
            height={80}
            priority
            className="w-full h-full object-cover object-top"
          />
        </div>
        {!brandInScene && (
          <div className="flex flex-col leading-none min-w-0">
            <span className="font-display text-base sm:text-lg font-semibold tracking-tight text-white truncate">
              Rex Intel Services
            </span>
            <span className="mono-label mt-0.5 text-[9.5px] hidden sm:inline truncate">
              Crypto Intelligence ／ DIV-001
            </span>
          </div>
        )}
      </Link>
      <div className="flex items-center gap-2.5 sm:gap-4 text-[10px] sm:text-[11px] font-mono uppercase tracking-widest shrink-0">
        <PublicNavLink href="/intel">Intel</PublicNavLink>
        <PublicNavLink href="/events">Events</PublicNavLink>
        <PublicNavLink href="/hackathons">Hacks</PublicNavLink>
        <PublicNavLink href="/submit" accent>
          Submit ▸
        </PublicNavLink>
      </div>
    </nav>
  );
}

function PublicNavLink({
  href,
  accent,
  children,
}: {
  href: string;
  accent?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="hover:text-white transition-colors"
      style={{
        color: accent ? "var(--rex-accent)" : "var(--rex-text-dim)",
      }}
    >
      {children}
    </Link>
  );
}
