import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { ResultOutbox, type PendingResult } from "./report";
import { canRetryNetwork } from "./recovery";
import { networkRetryDelay } from "../lib/worker-recovery";

test("network failure is recoverable before Enter, never after Enter", () => {
  const error = new Error("page.goto: net::ERR_TIMED_OUT");
  assert.equal(canRetryNetwork(error, false), true);
  assert.equal(canRetryNetwork(error, true), false);
  assert.equal(canRetryNetwork(new Error("session_expired"), false), false);
  assert.equal(canRetryNetwork(new Error("conversation_not_found"), false), false);
  assert.deepEqual([0, 1, 2, 3, 99].map(networkRetryDelay), [5, 10, 20, 30, 30].map((n) => n * 60_000));
});

test("disconnection preserves success and a restarted process replays the same receipt", async () => {
  const dir = await mkdtemp(join(tmpdir(), "tiksave-outbox-"));
  const result: PendingResult = { resultId: randomUUID(), jobId: randomUUID(), claimId: randomUUID(), status: "success", detail: "Message sent and verified." };
  const receipts = new Set<string>();
  let offline = true;
  const request = (async (_url, init) => {
    const body = JSON.parse(String(init?.body));
    receipts.add(body.resultId);
    // The server committed the result but the HTTP acknowledgement was lost.
    if (offline) throw new TypeError("fetch failed");
    return Response.json({ ok: true });
  }) as typeof fetch;
  try {
    assert.equal(await new ResultOutbox(dir, request).send("https://example.test", "test", result), false);
    const stored = JSON.parse(await readFile(join(dir, `${result.resultId}.json`), "utf8"));
    assert.equal(stored.status, "success");
    assert.equal(stored.resultId, result.resultId);
    assert.equal(await new ResultOutbox(dir, request).flush("https://example.test", "test"), false);
    offline = false;
    assert.equal(await new ResultOutbox(dir, request).flush("https://example.test", "test"), true);
    assert.equal(receipts.size, 1);
    assert.deepEqual(await readdir(dir), []);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
