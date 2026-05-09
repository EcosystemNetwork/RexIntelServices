import Link from "next/link";

export function PublicHeader() {
  return (
    <nav className="relative z-10 flex items-center justify-between px-6 md:px-12 py-5 max-w-5xl mx-auto">
      <Link href="/" className="flex items-center gap-3">
        <div
          className="w-7 h-7 rounded-lg flex items-center justify-center text-white font-bold text-xs"
          style={{
            background:
              "linear-gradient(135deg, var(--rex-accent), var(--rex-accent-2))",
          }}
        >
          R
        </div>
        <span className="font-display text-lg font-semibold tracking-tight text-white">
          Rex Intel Services
        </span>
      </Link>
      <div className="flex items-center gap-5 text-xs font-mono uppercase tracking-widest">
        <PublicNavLink href="/intel">Intel</PublicNavLink>
        <PublicNavLink href="/events">Events</PublicNavLink>
        <PublicNavLink href="/submit">Submit</PublicNavLink>
      </div>
    </nav>
  );
}

function PublicNavLink({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="hover:text-white transition-colors"
      style={{ color: "var(--rex-text-dim)" }}
    >
      {children}
    </Link>
  );
}
