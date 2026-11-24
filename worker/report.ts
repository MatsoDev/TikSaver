import { mkdir, readdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { join, resolve } from "node:path";
import type { WorkerStatus } from "./types";

export type PendingResult = {
  resultId: string;
  jobId: string;
  claimId: string | null;
  status: WorkerStatus;
  detail: string;
  screenshotUrl?: string;
};

export class ResultOutbox {
  constructor(
    private directory = resolve("logs", "pending-results"),
    private request: typeof fetch = fetch,
  ) {}

  async store(result: PendingResult): Promise<string> {
    await mkdir(this.directory, { recursive: true });
    const path = join(this.directory, `${result.resultId}.json`);
    await writeFile(`${path}.tmp`, JSON.stringify(result), { mode: 0o600 });
    await rename(`${path}.tmp`, path);
    return path;
  }

  private async deliver(appUrl: string, secret: string, result: PendingResult): Promise<boolean> {
    try {
      const response = await this.request(`${appUrl}/api/worker/result`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-cron-secret": secret },
        body: JSON.stringify(result),
        signal: AbortSignal.timeout(20_000),
      });
      if (!response.ok) return false;
      return (await response.json()).ok === true;
    } catch {
      return false;
    }
  }

  async send(appUrl: string, secret: string, result: PendingResult): Promise<boolean> {
    // Persist before HTTP so a disconnect or restart cannot lose the outcome.
    const path = await this.store(result);
    if (!(await this.deliver(appUrl, secret, result))) return false;
    await rm(path);
    return true;
  }

  async flush(appUrl: string, secret: string): Promise<boolean> {
    await mkdir(this.directory, { recursive: true });
    for (const name of (await readdir(this.directory)).filter((name) => name.endsWith(".json")).sort()) {
      const path = join(this.directory, name);
      const result = JSON.parse(await readFile(path, "utf8")) as PendingResult;
      if (!(await this.deliver(appUrl, secret, result))) return false;
      await rm(path);
    }
    return true;
  }
}

export async function postResult(
  appUrl: string,
  cronSecret: string,
  jobId: string,
  status: WorkerStatus,
  detail: string,
  screenshotUrl?: string,
): Promise<void> {
  const delivered = await new ResultOutbox().send(appUrl, cronSecret, {
    resultId: randomUUID(), jobId, claimId: process.env.CLAIM_ID ?? null,
    status, detail,
    ...(status !== "network_wait" && screenshotUrl ? { screenshotUrl } : {}),
  });
  console.log(delivered ? `result-posted status=${status}` : `result-queued status=${status}`);
}
