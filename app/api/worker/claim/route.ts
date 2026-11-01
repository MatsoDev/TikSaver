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

  for (const job of enabledJobs) {
    const zoned = getZonedTime(now, job.timezone);
    const sendMinutes = minutesFromTime(job.sendTime);
    if (sendMinutes === null) continue;
    const due = job.nextRetryAt
      ? job.nextRetryAt.getTime() <= now.getTime()
      : (job.lastRunDate === null || job.lastRunDate !== zoned.date) &&
        zoned.minutes >= sendMinutes + deterministicJitter(job.id, zoned.date, job.jitterMinutes);
    if (!due) continue;

    const claimed = await getDb()
      .update(jobs)
      .set({ lastRunDate: zoned.date, lastStatus: "claimed", retryCount: 0, nextRetryAt: null })
      .where(and(
        eq(jobs.id, job.id),
        eq(jobs.enabled, true),
        job.nextRetryAt
          ? and(isNotNull(jobs.nextRetryAt), lte(jobs.nextRetryAt, now))
          : or(isNull(jobs.lastRunDate), ne(jobs.lastRunDate, zoned.date)),
      ))
      .returning({ id: jobs.id });
    if (claimed.length) claimedIds.push(job.id);
  }

  return NextResponse.json({ claimed: claimedIds });
}
