import { and, eq, getTableColumns, isNotNull, isNull, lte, ne, or, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { getDb } from "@/db";
import { jobs } from "@/db/schema";
import { deterministicJitter, getZonedTime, minutesFromTime } from "@/lib/time";
import { CLAIM_LEASE_MS } from "@/lib/worker-recovery";

export async function claimDueJobs(now: Date, sendMode: string, onlyJobId?: string) {
  const enabledJobs = await getDb().select({
    ...getTableColumns(jobs), lastRunDate: sql<string | null>`${jobs.lastRunDate}::text`,
  }).from(jobs).where(and(eq(jobs.enabled, true), onlyJobId ? eq(jobs.id, onlyJobId) : undefined));
  const claimedIds: string[] = [];
  const claims: Array<{ id: string; claimId: string }> = [];
  const leaseCutoff = new Date(now.getTime() - CLAIM_LEASE_MS);
  const debugJobs: Array<{ idSuffix: string; due: boolean; reason: string }> = [];

  for (const job of enabledJobs) {
    const zoned = getZonedTime(now, job.timezone);
    const sendMinutes = minutesFromTime(job.sendTime);
    const manual = job.runRequestedAt !== null;
    const abandoned = job.lastStatus === "claimed" && job.claimedAt !== null &&
      job.claimedAt <= leaseCutoff && job.submissionStartedAt === null;
    if (sendMinutes === null) {
      debugJobs.push({ idSuffix: job.id.slice(-8), due: false, reason: "invalid_send_time" });
      continue;
    }
    const retryWait = Boolean(job.nextRetryAt && job.nextRetryAt.getTime() > now.getTime());
    const retryDue = Boolean(job.nextRetryAt && job.nextRetryAt.getTime() <= now.getTime());
    const alreadyRan = !manual && job.lastRunDate !== null && job.lastRunDate === zoned.date;
    const pcStartDue = sendMode === "on_pc_start" && !job.nextRetryAt && !alreadyRan;
    const due = manual || abandoned || retryDue || pcStartDue || (!job.nextRetryAt && !alreadyRan &&
      (job.lastRunDate === null || job.lastRunDate !== zoned.date) &&
      zoned.minutes >= sendMinutes + deterministicJitter(job.id, zoned.date, job.jitterMinutes));
    {
      const reason = manual ? "run_requested" : abandoned ? "recovering_abandoned_claim" : retryWait ? "retry_wait" : alreadyRan ? "already_ran_today" : due ? "due" : "not_due_yet";
      debugJobs.push({ idSuffix: job.id.slice(-8), due, reason });
    }
    if (!due) continue;

    const claimId = randomUUID();
    const claimed = await getDb()
      .update(jobs)
      .set({ lastRunDate: zoned.date, lastStatus: "claimed", retryCount: retryDue && !manual ? job.retryCount : 0,
        nextRetryAt: null, runRequestedAt: null, claimId, claimedAt: now, submissionStartedAt: null })
      .where(and(
        eq(jobs.id, job.id),
        eq(jobs.enabled, true),
        manual
          ? isNotNull(jobs.runRequestedAt)
          : abandoned
            ? and(eq(jobs.lastStatus, "claimed"), lte(jobs.claimedAt, leaseCutoff), isNull(jobs.submissionStartedAt))
          : job.nextRetryAt
            ? and(isNotNull(jobs.nextRetryAt), lte(jobs.nextRetryAt, now))
            : and(isNull(jobs.nextRetryAt), or(isNull(jobs.lastRunDate), ne(jobs.lastRunDate, zoned.date))),
      ))
      .returning({ id: jobs.id });
    if (claimed.length) { claimedIds.push(job.id); claims.push({ id: job.id, claimId }); }
  }

  return { claimed: claimedIds, claims, jobs: debugJobs };
}
