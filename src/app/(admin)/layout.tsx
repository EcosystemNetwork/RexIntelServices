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
    <div className="min-h-screen flex" style={{ background: "var(--rex-bg)" }}>
      {/* Sidebar */}
      <aside
        className="w-60 flex flex-col border-r"
        style={{
          background: "var(--rex-surface)",
          borderColor: "var(--rex-border-subtle)",
        }}
      >
        {/* Logo */}
        <div
          className="p-5 border-b"
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
            <span className="font-display text-lg font-semibold tracking-tight text-white">
              RexIntel
            </span>
          </Link>
        </div>

        {/* Nav */}
        <nav className="p-3 flex flex-col gap-0.5 text-sm flex-1">
          <NavLink href="/dashboard" icon="◈">
            Dashboard
          </NavLink>
          <NavLink href="/subscribers" icon="◉">
            Subscribers
          </NavLink>
          <NavLink href="/campaigns" icon="◆">
            Campaigns
          </NavLink>
        </nav>

        {/* Footer */}
        <div
          className="p-4 border-t text-xs flex items-center justify-between"
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
      <main className="flex-1 overflow-auto">{children}</main>
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
