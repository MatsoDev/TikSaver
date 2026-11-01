import { listLogs } from "@/lib/logs";
import { formatTimestamp } from "@/lib/time";

export const dynamic = "force-dynamic";

function statusStyle(status: string): string {
  switch (status) {
    case "success":
    case "dispatched":
    case "manual_dispatched":
      return "bg-emerald-500/10 text-emerald-400";
    case "failed":
    case "dispatch_failed":
      return "bg-red-500/10 text-red-300";
    case "session_expired":
      return "bg-amber-500/10 text-amber-300";
    default:
      return "bg-zinc-800 text-zinc-400";
  }
}

export default async function LogsPage() {
  const logs = await listLogs(100);

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Logs</h1>
        <p className="text-sm text-zinc-400">
          The last {logs.length} events. Cookies and message contents are never
          recorded.
        </p>
      </header>

      {logs.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-zinc-800 px-6 py-16 text-center text-sm text-zinc-400">
          Nothing has run yet.
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {logs.map((log) => (
            <li
              key={log.id}
              className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4"
            >
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${statusStyle(log.status)}`}
                >
                  {log.status.replaceAll("_", " ")}
                </span>
                <span className="text-sm text-zinc-300">
                  {log.targetUsername ? `@${log.targetUsername}` : "unknown job"}
                </span>
                <span className="ms-auto text-xs text-zinc-500">
                  {formatTimestamp(log.createdAt)}
                </span>
              </div>

              {log.detail ? (
                <p className="mt-2 whitespace-pre-wrap break-words text-sm text-zinc-400">
                  {log.detail}
                </p>
              ) : null}

              {log.screenshotUrl ? (
                <a
                  href={`/api/logs/${log.id}/screenshot`}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-2 inline-block text-xs font-medium text-sky-400 hover:text-sky-300"
                >
                  View screenshot
                </a>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
