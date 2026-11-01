import Link from "next/link";
import type { Job } from "@/db/schema";
import { COMMON_TIMEZONES, DEFAULT_TIMEZONE } from "@/lib/time";

const fieldClass =
  "w-full rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-3 text-sm text-zinc-100 outline-none transition focus:border-emerald-500";
const labelClass = "flex flex-col gap-2 text-sm text-zinc-300";

export function JobForm({
  action,
  job,
  submitLabel,
  error,
}: {
  action: (formData: FormData) => void | Promise<void>;
  job?: Job;
  submitLabel: string;
  error?: string;
}) {
  return (
    <form action={action} className="flex flex-col gap-5">
      {job ? <input type="hidden" name="id" value={job.id} /> : null}

      {error ? (
        <p className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {error}
        </p>
      ) : null}

      <label className={labelClass}>
        <span>TikTok username</span>
        <input
          className={fieldClass}
          name="targetUsername"
          defaultValue={job?.targetUsername ?? ""}
          placeholder="username (without @)"
          maxLength={24}
          required
        />
      </label>

      <label className={labelClass}>
        <span>Message</span>
        <textarea
          className={`${fieldClass} min-h-28 resize-y`}
          name="message"
          defaultValue={job?.message ?? ""}
          placeholder="The message to send every day"
          maxLength={2000}
          required
        />
        <span className="text-xs text-zinc-500">
          Message content is only sent to TikTok and is never written to logs.
        </span>
      </label>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className={labelClass}>
          <span>Send time</span>
          <input
            className={fieldClass}
            type="time"
            name="sendTime"
            defaultValue={job?.sendTime ?? "20:00"}
            required
          />
        </label>

        <label className={labelClass}>
          <span>Jitter (minutes)</span>
          <input
            className={fieldClass}
            type="number"
            name="jitterMinutes"
            min={0}
            max={60}
            step={1}
            defaultValue={job?.jitterMinutes ?? 5}
            required
          />
        </label>
      </div>

      <label className={labelClass}>
        <span>Timezone</span>
        <input
          className={fieldClass}
          name="timezone"
          list="timezone-options"
          defaultValue={job?.timezone ?? DEFAULT_TIMEZONE}
          placeholder={DEFAULT_TIMEZONE}
          required
        />
        <datalist id="timezone-options">
          {COMMON_TIMEZONES.map((zone) => (
            <option key={zone} value={zone} />
          ))}
        </datalist>
        <span className="text-xs text-zinc-500">
          IANA timezone, for example Africa/Cairo.
        </span>
      </label>

      <div className="flex flex-wrap items-center gap-3 pt-2">
        <button
          type="submit"
          className="rounded-xl bg-emerald-500 px-5 py-3 text-sm font-semibold text-emerald-950 transition hover:bg-emerald-400"
        >
          {submitLabel}
        </button>
        <Link
          href="/dashboard"
          className="rounded-xl border border-zinc-800 px-5 py-3 text-sm text-zinc-300 transition hover:bg-zinc-900"
        >
          Cancel
        </Link>
      </div>
    </form>
  );
}
