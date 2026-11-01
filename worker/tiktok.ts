import type { Locator, Page } from "playwright";
import { humanType, sleep } from "./browser";
import { MESSAGES_URL, SELECTORS } from "./selectors";
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

async function openConversation(page: Page, username: string): Promise<void> {
  const search = await firstVisible(page, SELECTORS.searchInput);
  if (search) {
    await search.click();
    await search.fill(username);
    await sleep(1800);
  }

  const byName = page.getByText(username, { exact: false }).first();
  if (await byName.isVisible().catch(() => false)) {
    await byName.click();
    await sleep(1500);
    return;
  }

  const firstChat = await firstVisible(page, SELECTORS.conversationItem);
  if (firstChat) {
    await firstChat.click();
    await sleep(1500);
    return;
  }

  throw new Error("Could not find the conversation");
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
  await page.goto(MESSAGES_URL, {
    waitUntil: "domcontentloaded",
    timeout: 45_000,
  });
  await sleep(2500);

  if (await detectSessionExpired(page)) {
    return {
      status: "session_expired",
      detail: "TikTok asked for a login or captcha. Update the session.",
    };
  }

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
