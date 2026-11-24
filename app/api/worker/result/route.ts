import { eq, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { logs } from "@/db/schema";
import { timingSafeEqualString } from "@/lib/auth";
import { getJob } from "@/lib/jobs";
import { networkRetryDelay } from "@/lib/worker-recovery";
import { sendTelegram } from "@/lib/telegram";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STATUSES = new Set(["success", "failed", "session_expired", "network_wait"]);
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 10 * 60 * 1000;

function authorized(request: Request): boolean {
  const expected = process.env.CRON_SECRET?.trim();
  const provided = request.headers.get("x-cron-secret")?.trim() ?? "";
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
    claimId?: unknown;
    resultId?: unknown;
  } | null;

  const jobId = typeof body?.jobId === "string" ? body.jobId : "";
  const status = typeof body?.status === "string" ? body.status : "";
  const detail =
    typeof body?.detail === "string" ? body.detail.slice(0, 2000) : null;
  const screenshotUrl = validScreenshot(body?.screenshotUrl);
  const claimId = typeof body?.claimId === "string" ? body.claimId : null;
  const resultId = typeof body?.resultId === "string" ? body.resultId : randomUUID();

  if (!UUID_PATTERN.test(jobId) || !STATUSES.has(status) || !UUID_PATTERN.test(resultId) ||
      (claimId !== null && !UUID_PATTERN.test(claimId))) {
    return NextResponse.json({ error: "invalid payload" }, { status: 400 });
  }

  const job = await getJob(jobId);
  if (!job) {
    return NextResponse.json({ error: "job not found" }, { status: 404 });
  }
  if (job.claimId !== claimId) return NextResponse.json({ ok: true, ignored: "stale_claim" });

  let retryCount = job.retryCount;
  let nextRetryAt: Date | null = null;
  let retryScheduled = false;

  if (status === "network_wait") {
    nextRetryAt = new Date(Date.now() + networkRetryDelay(job.retryCount));
    retryCount = job.retryCount + 1;
    retryScheduled = true;
  } else if (status === "success" || status === "session_expired") {
    retryCount = 0;
  } else if (job.submissionStartedAt || detail?.includes("Message was submitted but could not be verified")) {
    // Enter was already pressed. Retrying can deliver the same message twice.
    retryCount = 0;
  } else if (job.retryCount < MAX_RETRIES) {
    retryCount = job.retryCount + 1;
    nextRetryAt = new Date(Date.now() + RETRY_DELAY_MS);
    retryScheduled = true;
  }

  // Save the outcome and its receipt in one statement. Replaying a local
  // outbox entry after a lost HTTP response cannot schedule another retry.
  const recorded = await getDb().execute(sql`
    WITH accepted AS (
      UPDATE jobs SET last_status = ${status}, retry_count = ${retryCount}, next_retry_at = ${nextRetryAt?.toISOString() ?? null}::timestamptz,
        submission_started_at = CASE WHEN ${status} = 'network_wait' THEN NULL ELSE submission_started_at END
      WHERE id = ${jobId}::uuid AND claim_id IS NOT DISTINCT FROM ${claimId}::uuid
        AND NOT (last_status = 'success' AND ${status} <> 'success')
        AND NOT EXISTS (SELECT 1 FROM logs WHERE id = ${resultId}::uuid)
      RETURNING id
    )
    INSERT INTO logs (id, job_id, status, detail, screenshot_url)
      SELECT ${resultId}::uuid, id, ${status}, ${detail}, ${screenshotUrl} FROM accepted
      ON CONFLICT (id) DO NOTHING RETURNING id
  `);
  if (!recorded.rows.length) return NextResponse.json({ ok: true, duplicate: true });

  const label =
    status === "success"
      ? "sent"
      : status === "session_expired"
        ? "session expired"
        : status === "network_wait" ? "waiting for connection" : "failed";

  const lines = [`Tiksave: ${label} for @${job.targetUsername}`];
  if (detail) lines.push(detail);
  if (status === "network_wait") {
    lines.push("No message was submitted. Recovery is automatic when the connection improves.");
  } else if (retryScheduled) {
    lines.push(`Retry ${retryCount}/${MAX_RETRIES} scheduled in 10 minutes.`);
  } else if (status === "failed" && retryCount >= MAX_RETRIES) {
    lines.push("No retries left.");
  }

  const telegram = status === "network_wait" && job.retryCount > 0
    ? { httpStatus: 0, ok: false, errorCode: undefined, description: "Repeated network-wait notification suppressed." }
    : await sendTelegram(lines.join("\n"));
  const telegramDetail = `Telegram HTTP ${telegram.httpStatus} ok=${telegram.ok}` +
    (telegram.errorCode !== undefined ? ` error_code=${telegram.errorCode}` : "") +
    (telegram.description ? ` description=${telegram.description}` : "");
  await getDb().update(logs).set({
    detail: [detail, telegramDetail].filter(Boolean).join(" | ").slice(0, 2000),
  }).where(eq(logs.id, resultId));

  return NextResponse.json({ ok: true, retryScheduled, telegram });
}
