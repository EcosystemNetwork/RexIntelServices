import Link from "next/link";
import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  if (!session) redirect("/login");

  return (
    <div
      className="min-h-screen flex flex-col md:flex-row"
      style={{ background: "var(--rex-bg)" }}
    >
      {/* Sidebar: top bar on mobile, fixed left rail on md+ */}
      <aside
        className="flex md:w-60 md:flex-col md:flex-shrink-0 border-b md:border-b-0 md:border-r"
        style={{
          background: "var(--rex-surface)",
          borderColor: "var(--rex-border-subtle)",
        }}
      >
        {/* Logo */}
        <div
          className="p-3 md:p-5 md:border-b flex-shrink-0"
          style={{ borderColor: "var(--rex-border-subtle)" }}
        >
          <Link href="/dashboard" className="flex items-center gap-2.5">
            <div
              className="w-7 h-7 rounded-lg flex items-center justify-center text-white font-bold text-xs"
              style={{
                background:
                  "linear-gradient(135deg, var(--rex-accent), var(--rex-accent-2))",
              }}
            >
              R
            </div>
            <span className="font-display text-base md:text-lg font-semibold tracking-tight text-white whitespace-nowrap">
              Rex Intel Services
            </span>
          </Link>
        </div>

        {/* Nav: scrollable horizontal row on mobile, vertical column on md+ */}
        <nav className="flex md:flex-col gap-0.5 text-sm flex-1 md:p-3 px-2 py-2 overflow-x-auto md:overflow-x-visible">
          <NavLink href="/dashboard" icon="◈">
            Dashboard
          </NavLink>
          <NavLink href="/subscribers" icon="◉">
            Subscribers
          </NavLink>
          <NavLink href="/users" icon="◐">
            Contributors
          </NavLink>
          <NavLink href="/tags" icon="◇">
            Tags
          </NavLink>
          <NavLink href="/campaigns" icon="◆">
            Campaigns
          </NavLink>
          <NavLink href="/submissions" icon="▣">
            Submissions
          </NavLink>
          <NavLink href="/bounty-claims" icon="✦">
            Bounties
          </NavLink>
          <NavLink href="/suppressions" icon="⊘">
            Suppressions
          </NavLink>
        </nav>

        {/* Footer: hidden on mobile (logout reachable via desktop), shown md+ */}
        <div
          className="hidden md:flex p-4 border-t text-xs items-center justify-between"
          style={{
            borderColor: "var(--rex-border-subtle)",
            color: "var(--rex-text-dim)",
          }}
        >
          <span className="truncate max-w-[140px]">{session.email}</span>
          <LogoutButton />
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 min-w-0 overflow-auto">{children}</main>
    </div>
  );
}

function NavLink({
  href,
  icon,
  children,
}: {
  href: string;
  icon: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="px-3 py-2 rounded-lg flex items-center gap-2.5 hover:bg-[var(--rex-surface-2)] transition-colors"
      style={{ color: "var(--rex-text-muted)" }}
    >
      <span className="text-xs opacity-60">{icon}</span>
      {children}
    </Link>
  );
}

function LogoutButton() {
  return (
    <form
      action={async () => {
        "use server";
        const { destroySession } = await import("@/lib/auth");
        await destroySession();
        const { redirect } = await import("next/navigation");
        redirect("/login");
      }}
    >
      <button
        type="submit"
        className="text-xs hover:text-white transition-colors"
        style={{ color: "var(--rex-text-dim)" }}
      >
        Logout
      </button>
    </form>
  );
}
