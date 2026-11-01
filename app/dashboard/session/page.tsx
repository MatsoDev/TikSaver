import { formatTimestamp } from "@/lib/time";
import { getSessionInfo } from "@/lib/session-store";
import { deleteSessionAction, saveSessionAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function SessionPage({
  searchParams,
}: {
  searchParams: { error?: string; saved?: string; deleted?: string };
}) {
  const info = await getSessionInfo();

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">
          TikTok session
        </h1>
        <p className="text-sm text-zinc-400">
          Paste exported cookies so the worker can act as you. Cookies are
          encrypted at rest and never shown again.
        </p>
      </header>

      {info ? (
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-5">
          <p className="text-sm text-zinc-300">
            Session stored · {info.cookieCount} cookies
          </p>
          <p className="mt-1 text-xs text-zinc-500">
            Updated {formatTimestamp(info.updatedAt)} · Source {info.source}
          </p>
        </div>
      ) : (
        <p className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
          No session stored yet. Sends will fail until you add cookies.
        </p>
      )}

      {searchParams.saved ? (
        <p className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300">
          Session saved.
        </p>
      ) : null}

      {searchParams.deleted ? (
        <p className="rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-3 text-sm text-zinc-300">
          Session removed.
        </p>
      ) : null}

      {searchParams.error ? (
        <p className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {searchParams.error}
        </p>
      ) : null}

      <form action={saveSessionAction} className="flex flex-col gap-4">
        <label className="flex flex-col gap-2 text-sm text-zinc-300">
          <span>Cookies JSON</span>
          <textarea
            name="cookies"
            rows={10}
            required
            spellCheck={false}
            placeholder={'[{"name":"sessionid","value":"...","domain":".tiktok.com",...}]'}
            className="w-full resize-y rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-3 font-mono text-xs text-zinc-100 outline-none transition focus:border-emerald-500"
          />
          <span className="text-xs text-zinc-500">
            Accepts a cookies array or a Playwright storage state file. Only the
            cookies array is stored.
          </span>
        </label>

        <button
          type="submit"
          className="self-start rounded-xl bg-emerald-500 px-5 py-3 text-sm font-semibold text-emerald-950 transition hover:bg-emerald-400"
        >
          {info ? "Replace session" : "Save session"}
        </button>
      </form>

      {info ? (
        <form
          action={deleteSessionAction}
          className="border-t border-zinc-800 pt-6"
        >
          <button
            type="submit"
            className="rounded-xl border border-red-500/30 px-5 py-3 text-sm text-red-300 transition hover:bg-red-500/10"
          >
            Remove stored session
          </button>
        </form>
      ) : null}
    </div>
  );
}
