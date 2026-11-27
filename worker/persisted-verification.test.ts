import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { chromium } from "playwright";
import { verifyPersistedMessage } from "./tiktok";

test("an optimistic local bubble cannot pass a fresh-session server check", async () => {
  let persistedTime = "23:30";
  const server = createServer((_request, response) => {
    response.setHeader("Content-Type", "text/html; charset=utf-8");
    response.setHeader("Cache-Control", "no-store");
    response.end(`<div><time data-e2e="dm-new-time-separator">${persistedTime}</time>
      <div data-e2e="dm-new-chat-item"><p data-e2e="dm-new-message-text" style="position:absolute;left:1000px;top:100px">fixture</p></div></div>`);
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
      document.body.insertAdjacentHTML("beforeend", '<div><time data-e2e="dm-new-time-separator">00:00</time><div data-e2e="dm-new-chat-item"><p data-e2e="dm-new-message-text" style="position:absolute;left:1000px;top:150px">fixture</p></div></div>');
    });
    const load = async (fresh: import("playwright").Page) => {
      await fresh.goto(url);
      assert.equal(await fresh.evaluate(() => localStorage.getItem("optimistic-message")), null);
    };
    const job = { id: "verification-fixture", targetUsername: "fixture", message: "fixture", timezone: "Africa/Cairo" };
    assert.equal(await verifyPersistedMessage(page, job, "00:00", load), false);
    persistedTime = "00:00";
    // The fresh context loads just one message, even though the sender saw two.
    assert.equal(await verifyPersistedMessage(page, job, "00:00", load), true);
  } finally {
    await browser.close();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
