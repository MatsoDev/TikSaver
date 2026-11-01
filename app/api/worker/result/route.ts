import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { jobs } from "@/db/schema";
import { timingSafeEqualString } from "@/lib/auth";
import { getJob } from "@/lib/jobs";
import { addLog } from "@/lib/logs";
import { sendTelegram } from "@/lib/telegram";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STATUSES = new Set(["success", "failed", "session_expired"]);
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 10 * 60 * 1000;

function authorized(request: Request): boolean {
  const expected = process.env.CRON_SECRET;
  const provided = request.headers.get("x-cron-secret") ?? "";
  if (!expected) return false;
  return timingSafeEqualString(provided, expected);
}

function validScreenshot(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 3_000_000) return null;
  if (/^data:image\/[a-z0-9.+-]+;base64,/i.test(value)) return value;
  if (/^https?:\/\//i.test(value)) return value;
  return null;
}

export async function POST(request: Request) {
  if (!process.env.CRON_SECRET) {
    return NextResponse.json(
      { error: "CRON_SECRET is not configured" },
      { status: 500 },
    );
  }

  if (!authorized(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as {
    jobId?: unknown;
    status?: unknown;
    detail?: unknown;
    screenshotUrl?: unknown;
  } | null;

  const jobId = typeof body?.jobId === "string" ? body.jobId : "";
  const status = typeof body?.status === "string" ? body.status : "";
  const detail =
    typeof body?.detail === "string" ? body.detail.slice(0, 2000) : null;
  const screenshotUrl = validScreenshot(body?.screenshotUrl);

  if (!UUID_PATTERN.test(jobId) || !STATUSES.has(status)) {
    return NextResponse.json({ error: "invalid payload" }, { status: 400 });
  }

  const job = await getJob(jobId);
  if (!job) {
    return NextResponse.json({ error: "job not found" }, { status: 404 });
  }

  let retryCount = job.retryCount;
  let nextRetryAt: Date | null = null;
  let retryScheduled = false;

  if (status === "success" || status === "session_expired") {
    retryCount = 0;
  } else if (job.retryCount < MAX_RETRIES) {
    retryCount = job.retryCount + 1;
    nextRetryAt = new Date(Date.now() + RETRY_DELAY_MS);
    retryScheduled = true;
  }

  await getDb()
    .update(jobs)
    .set({ lastStatus: status, retryCount, nextRetryAt })
    .where(eq(jobs.id, jobId));

  await addLog({
    jobId,
    status,
    detail,
    screenshotUrl,
  });

  const label =
    status === "success"
      ? "sent"
      : status === "session_expired"
        ? "session expired"
        : "failed";

  const lines = [`Tiksave: ${label} for @${job.targetUsername}`];
  if (detail) lines.push(detail);
  if (retryScheduled) {
    lines.push(`Retry ${retryCount}/${MAX_RETRIES} scheduled in 10 minutes.`);
  } else if (status === "failed" && retryCount >= MAX_RETRIES) {
    lines.push("No retries left.");
  }

  await sendTelegram(lines.join("\n"));

  return NextResponse.json({ ok: true, retryScheduled });
}
