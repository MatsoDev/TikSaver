import { and, eq, isNotNull, isNull, lte, ne, or } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { jobs } from "@/db/schema";
import { timingSafeEqualString } from "@/lib/auth";
import { deterministicJitter, getZonedTime, minutesFromTime } from "@/lib/time";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const expected = process.env.CRON_SECRET?.trim();
  const provided = request.headers.get("x-cron-secret")?.trim() ?? "";
  if (!expected || !timingSafeEqualString(provided, expected)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const enabledJobs = await getDb().select().from(jobs).where(eq(jobs.enabled, true));
  const claimedIds: string[] = [];
  const sendMode = process.env.SEND_MODE?.trim() || (process.env.EXECUTOR?.trim() === "local" ? "on_pc_start" : "scheduled");
  const debug = request.headers.get("x-debug") === "1";
  const debugJobs: Array<{ idSuffix: string; due: boolean; reason: string }> = [];

  for (const job of enabledJobs) {
    const zoned = getZonedTime(now, job.timezone);
    const sendMinutes = minutesFromTime(job.sendTime);
    const manual = job.runRequestedAt !== null;
    if (sendMinutes === null) {
      if (debug) debugJobs.push({ idSuffix: job.id.slice(-8), due: false, reason: "invalid_send_time" });
      continue;
    }
    const retryWait = Boolean(job.nextRetryAt && job.nextRetryAt.getTime() > now.getTime());
    const retryDue = Boolean(job.nextRetryAt && job.nextRetryAt.getTime() <= now.getTime());
    const alreadyRan = !manual && job.lastRunDate !== null && job.lastRunDate === zoned.date;
    const pcStartDue = sendMode === "on_pc_start" && !job.nextRetryAt && !alreadyRan;
    const due = manual || retryDue || pcStartDue || (!job.nextRetryAt && !alreadyRan &&
      (job.lastRunDate === null || job.lastRunDate !== zoned.date) &&
      zoned.minutes >= sendMinutes + deterministicJitter(job.id, zoned.date, job.jitterMinutes));
    if (debug) {
      const reason = manual ? "run_requested" : retryWait ? "retry_wait" : alreadyRan ? "already_ran_today" : due ? "due" : "not_due_yet";
      debugJobs.push({ idSuffix: job.id.slice(-8), due, reason });
    }
    if (!due) continue;

    const claimed = await getDb()
      .update(jobs)
      .set({ lastRunDate: zoned.date, lastStatus: "claimed", retryCount: 0, nextRetryAt: null, runRequestedAt: null })
      .where(and(
        eq(jobs.id, job.id),
        eq(jobs.enabled, true),
        manual
          ? isNotNull(jobs.runRequestedAt)
          : job.nextRetryAt
            ? and(isNotNull(jobs.nextRetryAt), lte(jobs.nextRetryAt, now))
            : and(isNull(jobs.nextRetryAt), or(isNull(jobs.lastRunDate), ne(jobs.lastRunDate, zoned.date))),
      ))
      .returning({ id: jobs.id });
    if (claimed.length) claimedIds.push(job.id);
  }

  return NextResponse.json(debug ? { claimed: claimedIds, jobs: debugJobs } : { claimed: claimedIds });
}
