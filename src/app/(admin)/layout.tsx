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
    <div className="min-h-screen flex bg-neutral-50">
      <aside className="w-56 border-r border-neutral-200 bg-white flex flex-col">
        <div className="p-6 border-b border-neutral-100">
          <Link href="/" className="font-display text-xl font-semibold tracking-tight">
            ⌗ Newsletter
          </Link>
        </div>
        <nav className="p-3 flex flex-col gap-0.5 text-sm flex-1">
          <NavLink href="/">Dashboard</NavLink>
          <NavLink href="/subscribers">Subscribers</NavLink>
          <NavLink href="/campaigns">Campaigns</NavLink>
        </nav>
        <div className="p-3 border-t border-neutral-100 text-xs text-neutral-500">
          {session.email}
        </div>
      </aside>
      <main className="flex-1 overflow-auto">{children}</main>
    </div>
  );
}

function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="px-3 py-2 rounded-md hover:bg-neutral-100 text-neutral-700 hover:text-neutral-900 transition-colors"
    >
      {children}
    </Link>
  );
}
