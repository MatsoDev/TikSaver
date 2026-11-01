import type { Browser, Page } from "playwright";
import {
  captureScreenshot,
  launchBrowser,
  newContext,
  normalizeCookies,
} from "./browser";
import { postResult } from "./report";
import { sendMessage } from "./tiktok";
import type { JobPayload, WorkerStatus } from "./types";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set`);
  return value;
}

function errorDetail(error: unknown): string {
  const message =
    error instanceof Error ? error.message : "Unknown worker error";
  return message.slice(0, 500);
}

async function report(
  appUrl: string,
  cronSecret: string,
  jobId: string,
  status: WorkerStatus,
  detail: string,
  page?: Page,
): Promise<void> {
  let screenshotUrl: string | undefined;
  if (status !== "success" && page) {
    screenshotUrl = await captureScreenshot(page, jobId);
  }

  await postResult(appUrl, cronSecret, jobId, status, detail, screenshotUrl);
}

async function main(): Promise<void> {
  const appUrl = requireEnv("APP_URL").replace(/\/+$/, "");
  const cronSecret = requireEnv("CRON_SECRET");
  const jobId = process.env.JOB_ID ?? process.argv[2];

  if (!jobId) throw new Error("JOB_ID is required");

  const response = await fetch(`${appUrl}/api/worker/job/${jobId}`, {
    headers: { "x-cron-secret": cronSecret },
  });

  if (!response.ok) {
    const reason =
      response.status === 409
        ? "No TikTok session is stored."
        : `Could not load the job (status ${response.status}).`;
    await report(appUrl, cronSecret, jobId, "failed", reason);
    return;
  }

  const payload = (await response.json()) as JobPayload;
  let browser: Browser | undefined;
  let page: Page | undefined;

  try {
    browser = await launchBrowser();
    const context = await newContext(browser, payload.job.timezone);
    await context.addCookies(normalizeCookies(payload.cookies));
    page = await context.newPage();

    const result = await sendMessage(page, payload.job);
    await report(
      appUrl,
      cronSecret,
      jobId,
      result.status,
      result.detail,
      page,
    );
  } catch (error) {
    await report(
      appUrl,
      cronSecret,
      jobId,
      "failed",
      errorDetail(error),
      page,
    );
    process.exitCode = 1;
  } finally {
    await browser?.close();
  }
}

main().catch((error) => {
  console.error(errorDetail(error));
  process.exit(1);
});
