import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { chromium } from "playwright";
import { verifyPersistedMessage } from "./tiktok";

test("an optimistic local bubble cannot pass a fresh-session server check", async () => {
  let persistedCount = 1;
  const server = createServer((_request, response) => {
    response.setHeader("Content-Type", "text/html; charset=utf-8");
    response.setHeader("Cache-Control", "no-store");
    response.end(Array.from({ length: persistedCount }, (_, i) =>
      `<div style="position:absolute;left:1000px;top:${100 + 50 * i}px">fixture</div>`,
    ).join(""));
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const url = `http://127.0.0.1:${address.port}/`;
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
    await page.goto(url);
    await page.evaluate(() => {
      localStorage.setItem("optimistic-message", "fixture");
      document.body.insertAdjacentHTML("beforeend", '<div style="position:absolute;left:1000px;top:150px">fixture</div>');
    });
    const load = async (fresh: import("playwright").Page) => {
      await fresh.goto(url);
      assert.equal(await fresh.evaluate(() => localStorage.getItem("optimistic-message")), null);
    };
    const job = { id: "verification-fixture", targetUsername: "fixture", message: "fixture", timezone: "Africa/Cairo" };
    const before = { count: 1, lastText: "fixture", lastTimestamp: "" };
    assert.equal(await verifyPersistedMessage(page, job, before, load), false);
    persistedCount = 2;
    assert.equal(await verifyPersistedMessage(page, job, before, load), true);
  } finally {
    await browser.close();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
