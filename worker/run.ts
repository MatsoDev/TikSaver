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

function errorInfo(error: unknown): { name: string; message: string; stack: string } {
  if (error instanceof Error) {
    return {
      name: error.name || "Error",
      message: error.message || "Unknown worker error",
      stack: error.stack ?? "",
    };
  }
  return { name: "Error", message: "Unknown worker error", stack: "" };
}

function errorDetail(error: unknown): string {
  const info = errorInfo(error);
  return `${info.name}: ${info.message}`.slice(0, 200);
}

function logError(error: unknown): void {
  const info = errorInfo(error);
  const stack = info.stack.split("\n").slice(0, 5).join("\n");
  console.error(`[worker error] ${info.name}: ${info.message}`);
  if (stack) console.error(stack);
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

async function isSessionExpired(page: Page): Promise<boolean> {
  try {
    const path = new URL(page.url()).pathname.toLowerCase();
    if (path === "/login" || path.startsWith("/login/")) return true;
    return await page
      .locator('input[type="password"], [data-e2e*="captcha"], iframe[src*="captcha"], [class*="captcha" i]')
      .filter({ visible: true })
      .count()
      .then((count) => count > 0);
  } catch {
    return false;
  }
}

async function main(): Promise<void> {
  let step = "startup";
  const mark = (name: string) => { step = name; console.log(name); };
  const appUrl = requireEnv("APP_URL").replace(/\/+$/, "");
  const cronSecret = requireEnv("CRON_SECRET");
  const jobId = process.env.JOB_ID ?? process.argv[2];

  if (!jobId) throw new Error("JOB_ID is required");

  const response = await fetch(`${appUrl}/api/worker/job/${jobId}`, {
    headers: { "x-cron-secret": cronSecret },
  });
  mark("job-fetched");

  if (!response.ok) {
    const reason =
      response.status === 409
        ? "No TikTok session is stored."
        : `Could not load the job (status ${response.status}).`;
    await report(appUrl, cronSecret, jobId, "failed", reason);
    return;
  }

  const payload = (await response.json()) as JobPayload;
  mark("cookies-loaded");
  const job = {
    ...payload.job,
    message: process.env.MESSAGE_OVERRIDE ?? payload.job.message,
  };
  let browser: Browser | undefined;
  let page: Page | undefined;
  let context: Awaited<ReturnType<typeof newContext>> | undefined;

  try {
    browser = await launchBrowser();
    mark("browser-launched");
    context = await newContext(browser, payload.job.timezone);
    await context.addCookies(normalizeCookies(payload.cookies));
    page = await context.newPage();
    page.on("framenavigated", (frame) => {
      if (frame !== page?.mainFrame()) return;
      try {
        console.error(`[navigation] ${new URL(frame.url()).pathname}`);
      } catch {
        console.error("[navigation] invalid URL");
      }
    });

    const result = await sendMessage(page, job);
    if (result.status === "success" && context) {
      const cookies = (await context.cookies("https://www.tiktok.com")).filter((cookie) =>
        cookie.domain.replace(/^\./, "").endsWith("tiktok.com"),
      );
      await fetch(`${appUrl}/api/worker/session`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-cron-secret": cronSecret },
        body: JSON.stringify({ cookies }),
      });
    }
    await report(
      appUrl,
      cronSecret,
      jobId,
      result.status,
      result.detail,
      page,
    );
    if (result.status !== "success") process.exitCode = 1;
  } catch (error) {
    const info = errorInfo(error);
    console.error(`[failed-step] ${step} ${info.name}: ${info.message.slice(0, 200)}`);
    console.error(info.stack.split("\n").slice(0, 5).join("\n"));
    logError(error);
    let screenshotUrl: string | undefined;
    if (page) {
      try {
        screenshotUrl = await captureScreenshot(page, jobId);
        console.error(`[screenshot] ${screenshotUrl ? "captured" : "not captured"}`);
      } catch (screenshotError) {
        logError(screenshotError);
        console.error("[screenshot] failed");
      }
    } else {
      console.error("[screenshot] no page");
    }
    try {
      const sessionExpired = Boolean(page && (await isSessionExpired(page)));
      const detail = sessionExpired ? "session_expired" : errorDetail(error);
      await postResult(appUrl, cronSecret, jobId, sessionExpired ? "session_expired" : "failed", detail, screenshotUrl);
    } catch (reportError) {
      logError(reportError);
    }
    process.exitCode = 1;
  } finally {
    await browser?.close();
  }
}

main().catch((error) => {
  logError(error);
  process.exit(1);
});
