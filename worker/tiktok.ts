import type { Locator, Page } from "playwright";
import { humanType, sleep } from "./browser";
import { MESSAGES_URL, PROFILE_URL, SELECTORS } from "./selectors";
import type { SendResult, WorkerJob } from "./types";

type OutgoingState = { count: number; lastText: string; lastTimestamp: string };

async function marked<T>(name: string, action: () => Promise<T>): Promise<T> {
  try {
    const value = await action();
    console.log(name);
    return value;
  } catch (error) {
    const e = error instanceof Error ? error : new Error("Unknown error");
    console.error(`[failed-step] ${name} ${e.name}: ${e.message.slice(0, 200)}`);
    console.error((e.stack ?? "").split("\n").slice(0, 5).join("\n"));
    throw error;
  }
}

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
  console.log("list-loaded");

  for (let index = 0; index < Math.min(await items.count().catch(() => 0), 15); index += 1) {
    items = page.locator(SELECTORS.conversationItem.join(","));
    const item = items.nth(index);
    if (!(await item.isVisible().catch(() => false))) continue;
    await item.click({ timeout: 5_000, force: true }).catch(() => undefined);
    for (let wait = 0; wait < 10; wait += 1) {
      const exactHandle = page.getByText(`@${target}`, { exact: true });
      if (await exactHandle.isVisible().catch(() => false)) {
        console.log("conversation-opened");
        return;
      }
      const header = await page.locator("header").innerText().catch(() => "");
      const heading = await page.locator("h1,h2,[role=heading]").allInnerTexts().catch(() => []);
      const identity = `${header} ${heading.join(" ")}`;
      const match = identity.match(/@[A-Za-z0-9._-]+/);
      if (match?.[0].slice(1).toLowerCase() === target) {
        console.log("conversation-opened");
        return;
      }
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
  console.log("messages-opened");
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

async function outgoingState(page: Page): Promise<OutgoingState> {
  const rows = await page.locator(SELECTORS.outgoingMessage.join(",")).evaluateAll((elements) =>
    elements.map((element) => ({
      text: (element.textContent ?? "").trim(),
      timestamp:
        element.getAttribute("data-timestamp") ??
        element.querySelector("time")?.getAttribute("datetime") ??
        element.querySelector("time")?.textContent?.trim() ?? "",
    })),
  ).catch(() => [] as { text: string; timestamp: string }[]);
  const last = rows.at(-1);
  return { count: rows.length, lastText: last?.text ?? "", lastTimestamp: last?.timestamp ?? `observed-${rows.length}` };
}

async function submitMessage(page: Page, message: string): Promise<void> {
  console.error("[step] finding composer");
  const input = await firstVisible(page, SELECTORS.messageInput);
  if (!input) throw new Error("Could not find the message box");

  await input.click();
  console.log("composer-clicked");
  await sleep(400);
  await humanType(page, message);
  console.log("typed");
  await sleep(500);

  await page.screenshot({ path: "screenshots/before-send.png" });
  await page.keyboard.press("Enter");
  console.log("sent");
  await page.screenshot({ path: "screenshots/after-send.png" });
}

async function verifyMessage(page: Page, message: string, before: OutgoingState): Promise<boolean> {
  const expected = message.trim();
  for (let wait = 0; wait < 10; wait += 1) {
    const after = await outgoingState(page);
    if (
      after.count === before.count + 1 &&
      after.lastText.includes(expected) &&
      after.lastTimestamp !== before.lastTimestamp
    ) return true;
    await sleep(500);
  }
  return false;
}

export async function sendMessage(
  page: Page,
  job: WorkerJob,
): Promise<SendResult> {
  await marked("conversation-opened", () => openConversation(page, job.targetUsername));

  if (await detectSessionExpired(page)) {
    return {
      status: "session_expired",
      detail: "TikTok asked for a login or captcha. Update the session.",
    };
  }

  const before = await outgoingState(page);
  console.error(`[step] outgoing-before=${before.count}`);
  await submitMessage(page, job.message);

  if (await detectSessionExpired(page)) {
    return {
      status: "session_expired",
      detail: "TikTok asked for a login or captcha. Update the session.",
    };
  }

  if (await verifyMessage(page, job.message, before)) {
    console.log("verified");
    return { status: "success", detail: "Message sent and verified." };
  }

  return {
    status: "failed",
    detail: "Message was submitted but could not be verified in the chat.",
  };
}
