import { launchBrowser, newContext, normalizeCookies } from "./browser";
import { openConversation, outgoingState, latestOutgoingReceipt } from "./tiktok";
import type { JobPayload } from "./types";

// Read-only audit: never types, submits, claims jobs, or reports a success.
async function audit() {
  const jobId = process.argv[2];
  const appUrl = process.env.APP_URL ?? "https://tiksaver-six.vercel.app";
  const secret = process.env.CRON_SECRET?.trim();
  if (!jobId || !secret) throw new Error("Audit configuration missing");
  const response = await fetch(`${appUrl}/api/worker/job/${jobId}`, {
    headers: { "x-cron-secret": secret }, signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw new Error(`Audit job HTTP ${response.status}`);
  const payload = await response.json() as JobPayload;
  const browser = await launchBrowser();
  try {
    const context = await newContext(browser, payload.job.timezone);
    await context.addCookies(normalizeCookies(payload.cookies));
    const page = await context.newPage();
    await openConversation(page, payload.job.targetUsername);
    const state = await outgoingState(page, payload.job.message);
    const expectedTime = process.argv[3];
    if (expectedTime) console.log(`audit-receipt-match=${(await latestOutgoingReceipt(page, payload.job.message)) === expectedTime}`);
    const screenshot = `screenshots/${jobId}-audit-${Date.now()}.png`;
    await page.screenshot({ path: screenshot });
    console.log(`audit-read-only matching=${state.count} path=${new URL(page.url()).pathname}`);
    console.log(`audit-screenshot=${screenshot}`);
  } finally { await browser.close(); }
}
audit().catch((error) => {
  console.error(error instanceof Error ? `${error.name}: ${error.message.slice(0, 160)}` : "Audit failed");
  process.exitCode = 1;
});
