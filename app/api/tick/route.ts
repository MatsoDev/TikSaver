import { and, eq, isNotNull, isNull, lte, ne, or } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { jobs } from "@/db/schema";
import { timingSafeEqualString } from "@/lib/auth";
import { dispatchWorkflow } from "@/lib/github";
import { addLog } from "@/lib/logs";
import {
  deterministicJitter,
  getZonedTime,
  minutesFromTime,
} from "@/lib/time";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function authorized(request: Request): boolean {
  const expected = process.env.CRON_SECRET?.trim();
  const provided = request.headers.get("x-cron-secret")?.trim() ?? "";
  if (!expected) return false;
  return timingSafeEqualString(provided, expected);
}

export async function GET(request: Request) {
  if (!process.env.CRON_SECRET) {
    return NextResponse.json(
      { error: "CRON_SECRET is not configured" },
      { status: 500 },
    );
  }

  if (!authorized(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const enabledJobs = await getDb()
    .select()
    .from(jobs)
    .where(eq(jobs.enabled, true));

  let dispatched = 0;
  let failed = 0;

  for (const job of enabledJobs) {
    if (job.nextRetryAt && job.nextRetryAt.getTime() <= now.getTime()) {
      const claimedRetry = await getDb()
        .update(jobs)
        .set({ nextRetryAt: null, lastStatus: "retrying" })
        .where(
          and(
            eq(jobs.id, job.id),
            eq(jobs.enabled, true),
            isNotNull(jobs.nextRetryAt),
            lte(jobs.nextRetryAt, now),
          ),
        )
        .returning({ id: jobs.id });

      if (claimedRetry.length > 0) {
        const retryResult = await dispatchWorkflow(job.id);
        if (retryResult.ok) {
          dispatched += 1;
          await addLog({
            jobId: job.id,
            status: "dispatched",
            detail: "Retry dispatched to the worker.",
          });
        } else {
          failed += 1;
          await getDb()
            .update(jobs)
            .set({ lastStatus: "dispatch_failed" })
            .where(eq(jobs.id, job.id));
          await addLog({
            jobId: job.id,
            status: "dispatch_failed",
            detail: retryResult.detail ?? "Could not dispatch the retry.",
          });
        }
        continue;
      }
    }

    const sendMinutes = minutesFromTime(job.sendTime);
    if (sendMinutes === null) continue;

    let today: string;
    let currentMinutes: number;
    try {
      const zoned = getZonedTime(now, job.timezone);
      today = zoned.date;
      currentMinutes = zoned.minutes;
    } catch {
      await addLog({
        jobId: job.id,
        status: "failed",
        detail: `Invalid timezone: ${job.timezone}`,
      });
      failed += 1;
      continue;
    }

    const target =
      sendMinutes +
      deterministicJitter(job.id, today, job.jitterMinutes);

    if (currentMinutes < target) continue;

    const claimed = await getDb()
      .update(jobs)
      .set({
        lastRunDate: today,
        lastStatus: "dispatching",
        retryCount: 0,
        nextRetryAt: null,
      })
      .where(
        and(
          eq(jobs.id, job.id),
          eq(jobs.enabled, true),
          or(isNull(jobs.lastRunDate), ne(jobs.lastRunDate, today)),
        ),
      )
      .returning({ id: jobs.id });

    if (claimed.length === 0) continue;

    const result = await dispatchWorkflow(job.id);
    if (result.ok) {
      dispatched += 1;
      await addLog({
        jobId: job.id,
        status: "dispatched",
        detail: "Scheduled send dispatched to the worker.",
      });
    } else {
      failed += 1;
      await getDb()
        .update(jobs)
        .set({ lastStatus: "dispatch_failed" })
        .where(eq(jobs.id, job.id));
      await addLog({
        jobId: job.id,
        status: "dispatch_failed",
        detail: result.detail ?? "Could not dispatch the worker.",
      });
    }
  }

  return NextResponse.json({
    ok: true,
    checked: enabledJobs.length,
    dispatched,
    failed,
  });
}
