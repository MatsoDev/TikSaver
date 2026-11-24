import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { getDb } from "../db";
import { jobs, logs } from "../db/schema";
import { claimDueJobs } from "../lib/worker-claims";
import { POST as submit } from "../app/api/worker/submission/route";
import { POST as result } from "../app/api/worker/result/route";

test("database recovery: expired lease, cooldown, duplicate receipt, stale attempt and verified success", {
  skip: process.env.RECOVERY_DB_TEST !== "1",
}, async () => {
  // Explicit opt-in only. One temporary fixture; no browser or TikTok send.
  // Disable Telegram inside this test process, never in the deployed app.
  process.env.TELEGRAM_BOT_TOKEN = "";
  process.env.TELEGRAM_CHAT_ID = "";
  process.env.CRON_SECRET = randomUUID();
  const db = getDb();
  const jobId = randomUUID();
  const oldClaim = randomUUID();
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const request = (path: string, body: object) => new Request(`https://example.test${path}`, {
    method: "POST", headers: { "Content-Type": "application/json", "x-cron-secret": process.env.CRON_SECRET! },
    body: JSON.stringify(body),
  });
  try {
    await db.insert(jobs).values({
      id: jobId, targetUsername: "recovery_fixture", message: "fixture", sendTime: "00:00", timezone: "UTC",
      enabled: true, lastRunDate: today, lastStatus: "claimed", claimId: oldClaim,
      claimedAt: new Date(now.getTime() - 21 * 60_000),
      reminderSentDate: today, lateReminderSentDate: today,
    });
    const recovered = await claimDueJobs(now, "on_pc_start", jobId);
    assert.deepEqual(recovered.claimed, [jobId]);
    const firstClaim = recovered.claims[0].claimId;
    assert.equal((await claimDueJobs(now, "on_pc_start", jobId)).claimed.length, 0);
    assert.equal((await submit(request("/submission", { jobId, claimId: oldClaim }))).status, 409);
    assert.equal((await submit(request("/submission", { jobId, claimId: firstClaim }))).status, 200);
    assert.equal((await submit(request("/submission", { jobId, claimId: firstClaim }))).status, 409);
    assert.equal((await claimDueJobs(new Date(now.getTime() + 21 * 60_000), "on_pc_start", jobId)).claimed.length, 0);

    // Submission-checkpoint response lost, so the worker never pressed Enter.
    const waiting = { resultId: randomUUID(), jobId, claimId: firstClaim, status: "network_wait", detail: "network_unavailable_before_send" };
    assert.equal((await result(request("/result", waiting))).status, 200);
    assert.equal((await (await result(request("/result", waiting))).json()).duplicate, true);
    let [job] = await db.select().from(jobs).where(eq(jobs.id, jobId));
    assert.equal(job.retryCount, 1);
    assert.equal(job.submissionStartedAt, null);
    assert.ok(job.nextRetryAt);
    assert.equal((await claimDueJobs(new Date(job.nextRetryAt.getTime() - 1000), "on_pc_start", jobId)).claimed.length, 0);
    const retry = await claimDueJobs(new Date(job.nextRetryAt.getTime() + 1000), "on_pc_start", jobId);
    assert.deepEqual(retry.claimed, [jobId]);
    [job] = await db.select().from(jobs).where(eq(jobs.id, jobId));
    assert.equal(job.retryCount, 1);
    assert.equal((await (await result(request("/result", waiting))).json()).ignored, "stale_claim");
    const claimId = retry.claims[0].claimId;
    assert.equal((await submit(request("/submission", { jobId, claimId }))).status, 200);
    const success = { resultId: randomUUID(), jobId, claimId, status: "success", detail: "Verified fixture result; no TikTok send." };
    assert.equal((await result(request("/result", success))).status, 200);
    assert.equal((await (await result(request("/result", success))).json()).duplicate, true);
    await result(request("/result", { ...success, resultId: randomUUID(), status: "failed" }));
    [job] = await db.select().from(jobs).where(eq(jobs.id, jobId));
    assert.equal(job.lastStatus, "success");
    assert.equal(job.nextRetryAt, null);
    assert.equal((await db.select().from(logs).where(eq(logs.jobId, jobId))).length, 2);
    assert.equal((await claimDueJobs(new Date(now.getTime() + 30 * 60_000), "on_pc_start", jobId)).claimed.length, 0);
  } finally {
    await db.delete(jobs).where(eq(jobs.id, jobId));
  }
});
