import { sleep } from "./browser";
import type { WorkerStatus } from "./types";

export async function postResult(
  appUrl: string,
  cronSecret: string,
  jobId: string,
  status: WorkerStatus,
  detail: string,
  screenshotUrl?: string,
): Promise<void> {
  const body = JSON.stringify({ jobId, status, detail, screenshotUrl });

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(`${appUrl}/api/worker/result`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-cron-secret": cronSecret,
        },
        body,
      });

      if (response.ok) return;
      console.error(`Result post failed with status ${response.status}`);
    } catch {
      console.error("Result post failed with a network error");
    }

    await sleep(2000 * attempt);
  }

  throw new Error("Could not report the worker result");
}
