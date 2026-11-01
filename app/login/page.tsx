import { redirect } from "next/navigation";
import { isAuthenticated } from "@/lib/server-auth";

export const dynamic = "force-dynamic";

function safeNext(value: string | undefined): string {
  if (!value || !value.startsWith("/") || value.startsWith("//")) {
    return "/dashboard";
  }
  return value;
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: { error?: string; next?: string };
}) {
  if (await isAuthenticated()) {
    redirect(safeNext(searchParams.next));
  }

  const next = safeNext(searchParams.next);

  return (
    <main className="flex min-h-screen items-center justify-center bg-zinc-950 px-6 text-zinc-100">
      <div className="w-full max-w-sm">
        <p className="text-sm font-medium uppercase tracking-[0.2em] text-emerald-400">
          Tiksave
        </p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight">
          Sign in
        </h1>
        <p className="mt-2 text-sm text-zinc-400">
          Enter the admin password to manage your streak saver.
        </p>

        <form
          action="/api/auth/login"
          method="post"
          className="mt-8 flex flex-col gap-4"
        >
          <input type="hidden" name="next" value={next} />
          <label className="flex flex-col gap-2 text-sm">
            <span className="text-zinc-300">Password</span>
            <input
              type="password"
              name="password"
              autoComplete="current-password"
              required
              autoFocus
              className="rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-3 text-zinc-100 outline-none transition focus:border-emerald-500"
            />
          </label>

          {searchParams.error ? (
            <p className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
              Wrong password, or the server is not configured.
            </p>
          ) : null}

          <button
            type="submit"
            className="rounded-xl bg-emerald-500 px-4 py-3 text-sm font-semibold text-emerald-950 transition hover:bg-emerald-400"
          >
            Continue
          </button>
        </form>
      </div>
    </main>
  );
}
