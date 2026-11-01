import type { Locator, Page } from "playwright";
import { humanType, sleep } from "./browser";
import { MESSAGES_URL, PROFILE_URL, SELECTORS } from "./selectors";
import type { SendResult, WorkerJob } from "./types";

async function firstVisible(
  page: Page,
  selectors: string[],
): Promise<Locator | null> {
  for (const selector of selectors) {
    const locator = page.locator(selector).last();
    if (await locator.isVisible().catch(() => false)) return locator;
  }
  return null;
}

export async function detectSessionExpired(page: Page): Promise<boolean> {
  if (/\/login/i.test(page.url())) return true;

  for (const selector of [...SELECTORS.loginWall, ...SELECTORS.captcha]) {
    const visible = await page
      .locator(selector)
      .first()
      .isVisible()
      .catch(() => false);
    if (visible) return true;
  }

  return false;
}

async function openConversationFallback(page: Page, username: string): Promise<void> {
  await page.goto(MESSAGES_URL, {
    waitUntil: "domcontentloaded",
    timeout: 45_000,
  });
  await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => undefined);
  const target = username.replace(/^@/, "").toLowerCase();
  let items = page.locator(SELECTORS.conversationItem.join(","));
  for (let wait = 0; wait < 15 && (await items.count().catch(() => 0)) === 0; wait += 1) {
    await sleep(1000);
    items = page.locator(SELECTORS.conversationItem.join(","));
  }

  for (let index = 0; index < Math.min(await items.count().catch(() => 0), 15); index += 1) {
    items = page.locator(SELECTORS.conversationItem.join(","));
    await items.nth(index).scrollIntoViewIfNeeded().catch(() => undefined);
    await items.nth(index).click().catch(() => undefined);
    for (let wait = 0; wait < 10; wait += 1) {
      const header = await page.locator("header").innerText().catch(() => "");
      const heading = await page.locator("h1,h2,[role=heading]").allInnerTexts().catch(() => []);
      const identity = `${header} ${heading.join(" ")}`;
      const match = identity.match(/@[A-Za-z0-9._-]+/);
      if (match?.[0].slice(1).toLowerCase() === target) return;
      await sleep(500);
    }
    await page.goto(MESSAGES_URL, { waitUntil: "domcontentloaded", timeout: 45_000 });
    await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => undefined);
  }

  throw new Error("message button not found");
}

async function openConversation(page: Page, username: string): Promise<void> {
  await page.goto(MESSAGES_URL, {
    waitUntil: "domcontentloaded",
    timeout: 45_000,
  });
  await openConversationFallback(page, username).catch(async () => {
    await page.goto(`${PROFILE_URL}${encodeURIComponent(username.replace(/^@/, ""))}`, {
      waitUntil: "domcontentloaded",
      timeout: 45_000,
    });
    await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => undefined);
    for (let wait = 0; wait < 15; wait += 1) {
      const messageButton = await firstVisible(page, SELECTORS.profileMessageButton);
      if (messageButton) {
        await messageButton.click();
        await sleep(1200);
        return;
      }
      await sleep(1000);
    }
    throw new Error("message button not found");
  });
}

async function submitMessage(page: Page, message: string): Promise<void> {
  const input = await firstVisible(page, SELECTORS.messageInput);
  if (!input) throw new Error("Could not find the message box");

  await input.click();
  await sleep(400);
  await humanType(page, message);
  await sleep(500);

  const sendButton = await firstVisible(page, SELECTORS.sendButton);
  if (sendButton) {
    await sendButton.click();
  } else {
    await page.keyboard.press("Enter");
  }
}

async function verifyMessage(page: Page, message: string): Promise<boolean> {
  const snippet = message.trim().slice(0, 40);
  if (!snippet) return false;

  await sleep(2500);

  for (const selector of SELECTORS.messageBubble) {
    const bubbles = page.locator(selector);
    const count = await bubbles.count().catch(() => 0);
    const start = Math.max(0, count - 8);

    for (let index = start; index < count; index += 1) {
      const text = await bubbles
        .nth(index)
        .innerText()
        .catch(() => "");
      if (text.includes(snippet)) return true;
    }
  }

  return false;
}

export async function sendMessage(
  page: Page,
  job: WorkerJob,
): Promise<SendResult> {
  await openConversation(page, job.targetUsername);

  if (await detectSessionExpired(page)) {
    return {
      status: "session_expired",
      detail: "TikTok asked for a login or captcha. Update the session.",
    };
  }

  await submitMessage(page, job.message);

  if (await detectSessionExpired(page)) {
    return {
      status: "session_expired",
      detail: "TikTok asked for a login or captcha. Update the session.",
    };
  }

  if (await verifyMessage(page, job.message)) {
    return { status: "success", detail: "Message sent and verified." };
  }

  return {
    status: "failed",
    detail: "Message was submitted but could not be verified in the chat.",
  };
}
