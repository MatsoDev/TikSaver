import Link from "next/link";
import { isGitHubConfigured } from "@/lib/github";
import { listJobs } from "@/lib/jobs";
import { sendNowAction, toggleJobAction } from "./actions";

export const dynamic = "force-dynamic";

function statusStyle(status: string | null): string {
  switch (status) {
    case "success":
    case "manual_dispatched":
      return "bg-emerald-500/10 text-emerald-400";
    case "failed":
    case "dispatch_failed":
      return "bg-red-500/10 text-red-300";
    case "session_expired":
      return "bg-amber-500/10 text-amber-300";
    case "retrying":
      return "bg-sky-500/10 text-sky-300";
    default:
      return "bg-zinc-800 text-zinc-400";
  }
}

function statusLabel(status: string | null): string {
  if (status === "queued_local") return "queued for the PC";
  return status ? status.replaceAll("_", " ") : "never run";
}

export default async function DashboardPage() {
  const jobs = await listJobs();
  const githubReady = isGitHubConfigured();

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">Jobs</h1>
          <p className="text-sm text-zinc-400">
            {jobs.length === 0
              ? "No jobs yet."
              : `${jobs.filter((job) => job.enabled).length} of ${jobs.length} active.`}
          </p>
          <p className="text-xs text-zinc-500">Sends once per day when the PC starts.</p>
        </div>
        <Link
          href="/dashboard/jobs/new"
          className="rounded-xl bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-emerald-950 transition hover:bg-emerald-400"
        >
          New job
        </Link>
      </header>

      {!githubReady ? (
        <p className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
          GitHub dispatch is not configured. Set GITHUB_TOKEN and GITHUB_REPO
          before relying on scheduled sends.
        </p>
      ) : null}

      {jobs.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-zinc-800 px-6 py-16 text-center">
          <p className="text-sm text-zinc-400">
            Create your first job to start keeping a streak alive.
          </p>
        </div>
      ) : (
        <ul className="flex flex-col gap-4">
          {jobs.map((job) => (
            <li
              key={job.id}
              className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-5"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex min-w-0 flex-col gap-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="truncate text-base font-semibold">
                      @{job.targetUsername}
                    </h2>
                    <span
                      className={
                        job.enabled
                          ? "rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-xs font-medium text-emerald-400"
                          : "rounded-full bg-zinc-800 px-2.5 py-0.5 text-xs font-medium text-zinc-400"
                      }
                    >
                      {job.enabled ? "active" : "paused"}
                    </span>
                  </div>
                  <p className="text-sm text-zinc-400">
                    {job.sendTime} · {job.timezone} · jitter ±{job.jitterMinutes}m
                  </p>
                </div>

                <span
                  className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${statusStyle(job.lastStatus)}`}
                >
                  {statusLabel(job.lastStatus)}
                </span>
              </div>

              <p className="mt-4 line-clamp-2 whitespace-pre-wrap break-words text-sm text-zinc-300">
                {job.message}
              </p>

              <div className="mt-4 flex flex-wrap items-center gap-2">
                <form action={sendNowAction}>
                  <input type="hidden" name="id" value={job.id} />
                  <button
                    type="submit"
                    className="rounded-lg border border-zinc-700 px-3 py-1.5 text-xs font-medium text-zinc-200 transition hover:bg-zinc-800"
                  >
                    Send now
                  </button>
                </form>

                <form action={toggleJobAction}>
                  <input type="hidden" name="id" value={job.id} />
                  <button
                    type="submit"
                    className="rounded-lg border border-zinc-800 px-3 py-1.5 text-xs font-medium text-zinc-400 transition hover:bg-zinc-800 hover:text-zinc-200"
                  >
                    {job.enabled ? "Pause" : "Resume"}
                  </button>
                </form>

                <Link
                  href={`/dashboard/jobs/${job.id}`}
                  className="rounded-lg px-3 py-1.5 text-xs font-medium text-zinc-400 transition hover:bg-zinc-800 hover:text-zinc-200"
                >
                  Edit
                </Link>

                <span className="ms-auto text-xs text-zinc-500">
                  {job.lastRunDate
                    ? `last sent: ${job.lastRunDate}`
                    : "not run yet"}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
