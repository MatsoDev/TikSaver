import Link from "next/link";
import { requireAuth } from "@/lib/server-auth";

export const dynamic = "force-dynamic";

const navLink =
  "rounded-lg px-3 py-1.5 text-sm text-zinc-400 transition hover:bg-zinc-900 hover:text-zinc-100";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireAuth();

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <header className="sticky top-0 z-10 border-b border-zinc-800 bg-zinc-950/90 backdrop-blur">
        <div className="mx-auto flex w-full max-w-3xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <Link href="/dashboard" className="text-lg font-semibold tracking-tight">
            Tiksave
          </Link>
          <nav className="flex flex-wrap items-center gap-1">
            <Link className={navLink} href="/dashboard">
              Jobs
            </Link>
            <Link className={navLink} href="/dashboard/logs">
              Logs
            </Link>
            <Link className={navLink} href="/dashboard/session">
              Session
            </Link>
            <form action="/api/auth/logout" method="post">
              <button
                type="submit"
                className="rounded-lg px-3 py-1.5 text-sm text-zinc-500 transition hover:bg-zinc-900 hover:text-zinc-200"
              >
                Sign out
              </button>
            </form>
          </nav>
        </div>
      </header>
      <main className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6">
        {children}
      </main>
    </div>
  );
}
