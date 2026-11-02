import type { Locator, Page } from "playwright";
import { humanType, sleep } from "./browser";
import { MESSAGES_URL, SELECTORS } from "./selectors";
import type { SendResult, WorkerJob } from "./types";

type OutgoingState = { count: number; lastText: string; lastTimestamp: string };

function normalizeMessageText(value: string): string {
  return value
    .normalize("NFKC")
    .replace(/[\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

async function marked<T>(name: string, action: () => Promise<T>): Promise<T> {
  try {
    const value = await action();
    console.log(name);
    return value;
  } catch (error) {
    const e = error instanceof Error ? error : new Error("Unknown error");
    console.error(`[failed-step] ${name} ${e.name}: ${e.message.slice(0, 200)}`);
    const diagnostic = error as Error & { listItemCount?: number; displayNames?: string[] };
    if (diagnostic.listItemCount !== undefined) {
      console.error(`[conversation-list] items=${diagnostic.listItemCount} names=${JSON.stringify(diagnostic.displayNames ?? [])}`);
    }
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
  await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => undefined);
  const target = username.replace(/^@/, "").toLowerCase();
  const itemSelector = SELECTORS.conversationName.join(",");
  let items = page.locator(itemSelector);
  const displayName = async (item: Locator) => {
    const name = (await item.innerText().catch(() => "")).trim();
    return name && name.length <= 80 && !/^(loading|\.\.\.|—)$/i.test(name) ? name : "";
  };
  const hasNamedItem = async () => {
    const count = Math.min(await items.count().catch(() => 0), 20);
    for (let i = 0; i < count; i += 1) {
      if (await displayName(items.nth(i))) return true;
    }
    return false;
  };
  for (let wait = 0; wait < 20 && !(await hasNamedItem()); wait += 1) {
    await sleep(1000);
    items = page.locator(itemSelector);
  }
  items = page.locator(itemSelector);
  const itemCount = await items.count().catch(() => 0);
  const displayNames: string[] = [];
  for (let i = 0; i < Math.min(itemCount, 15); i += 1) {
    const name = await displayName(items.nth(i));
    if (name) displayNames.push(name.slice(0, 80));
  }
  console.log("list-loaded");
  await page.screenshot({ path: "screenshots/list.png" }).catch(() => undefined);
  const listContainer = items.first();
  await listContainer.evaluate((el) => {
    let node: HTMLElement | null = el as HTMLElement;
    while (node && node.scrollHeight <= node.clientHeight) node = node.parentElement;
    if (node) { node.scrollTop = node.scrollHeight; node.scrollTop = 0; }
  }).catch(() => undefined);

  for (let index = 0; index < Math.min(itemCount, 20); index += 1) {
    items = page.locator(itemSelector);
    const item = items.nth(index);
    if (!(await item.isVisible().catch(() => false))) continue;
    await item.click({ timeout: 5_000, force: true }).catch(() => undefined);
    for (let wait = 0; wait < 10; wait += 1) {
      const exactHandle = page.getByText(`@${target}`, { exact: true });
      if (await exactHandle.isVisible().catch(() => false)) {
        console.log("conversation-opened");
        return;
      }
      const headers = await page.locator("header").allInnerTexts().catch(() => []);
      const heading = await page.locator("h1,h2,[role=heading]").allInnerTexts().catch(() => []);
      const identity = `${headers.join(" ")} ${heading.join(" ")}`;
      const match = identity.match(/@[A-Za-z0-9._-]+/);
      if (match?.[0].slice(1).toLowerCase() === target) {
        console.log("conversation-opened");
        return;
      }
      await sleep(500);
    }
  }

  const error = new Error(itemCount === 0 ? "no_existing_conversation" : "conversation_not_found: no_existing_conversation");
  Object.assign(error, { listItemCount: itemCount, displayNames });
  throw error;
}

async function openConversation(page: Page, username: string): Promise<void> {
  await page.goto(MESSAGES_URL, {
    waitUntil: "domcontentloaded",
    timeout: 45_000,
  });
  console.log("messages-opened");
  await openConversationFallback(page, username);
}

async function findComposer(page: Page): Promise<Locator | null> {
  const candidates = [
    page.getByPlaceholder("Send a message...", { exact: true }),
    page.locator('main [contenteditable="true"], [role="main"] [contenteditable="true"]'),
    page.getByRole("textbox"),
    page.locator("textarea"),
  ];
  for (const candidate of candidates) {
    for (let wait = 0; wait < 10; wait += 1) {
      const visible = candidate.last();
      if (await visible.isVisible().catch(() => false)) return visible;
      await sleep(1000);
    }
  }
  const panels = page.locator('main, [role="main"]').last();
  await panels.evaluate((el) => (el.scrollTop = el.scrollHeight)).catch(() => undefined);
  for (const candidate of candidates) {
    const visible = candidate.last();
    if (await visible.isVisible().catch(() => false)) return visible;
  }
  await page.screenshot({ path: "screenshots/composer-missing.png" }).catch(() => undefined);
  const candidatesAtBottom = await page.locator("body *").evaluateAll((elements) =>
    elements.filter((el) => {
      const r = el.getBoundingClientRect();
      return r.bottom > window.innerHeight - 150 && r.top < window.innerHeight;
    }).slice(-15).map((el) => ({
      tag: el.tagName,
      role: el.getAttribute("role") ?? "",
      placeholder: el.getAttribute("placeholder") ?? "",
      aria: el.getAttribute("aria-label") ?? "",
      contenteditable: el.getAttribute("contenteditable") ?? "",
    })),
  ).catch(() => []);
  console.error(`[composer-candidates] ${JSON.stringify(candidatesAtBottom)}`);
  return null;
}

async function outgoingState(page: Page, message: string): Promise<OutgoingState> {
  const bubbleSelector = [...SELECTORS.outgoingMessage, ...SELECTORS.messageBubble].join(",");
  const rows = await page.locator(bubbleSelector).evaluateAll((elements) => {
    const candidates = elements.flatMap((element) => {
      const rect = element.getBoundingClientRect();
      const style = window.getComputedStyle(element);
      const text = (element as HTMLElement).innerText?.trim() ?? "";
      const visible = rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
      if (!visible || !text || rect.left <= window.innerWidth / 2) return [];
      return [{
        text,
        top: Math.round(rect.top),
        bottom: Math.round(rect.bottom),
        timestamp:
          element.getAttribute("data-timestamp") ??
          element.querySelector("time")?.getAttribute("datetime") ??
          element.querySelector("time")?.textContent?.trim() ?? "",
      }];
    });
    const unique = new Map<string, (typeof candidates)[number]>();
    for (const candidate of candidates) {
      const key = `${candidate.top}:${candidate.text}`;
      const previous = unique.get(key);
      if (!previous || candidate.bottom - candidate.top < previous.bottom - previous.top) {
        unique.set(key, candidate);
      }
    }
    return [...unique.values()].sort((a, b) => a.bottom - b.bottom);
  }).catch(() => [] as { text: string; top: number; bottom: number; timestamp: string }[]);
  const last = rows.at(-1);
  return {
    count: rows.length,
    lastText: last?.text ?? "",
    lastTimestamp: last?.timestamp ?? (last ? `observed-${rows.length}` : ""),
  };
}

async function submitMessage(page: Page, message: string): Promise<void> {
  console.error("[step] finding composer");
  const input = await findComposer(page);
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
  await sleep(2500);
  await page.locator('main, [role="main"]').last().evaluate((el) => (el.scrollTop = el.scrollHeight)).catch(() => undefined);
  await page.screenshot({ path: "screenshots/after-send.png" });
}

async function verifyMessage(page: Page, message: string, before: OutgoingState): Promise<boolean> {
  const expected = normalizeMessageText(message);
  for (let wait = 0; wait < 10; wait += 1) {
    const after = await outgoingState(page, message);
    console.log(`verify-state before=${before.count} after=${after.count} text-match=${normalizeMessageText(after.lastText) === expected ? "yes" : "no"}`);
    if (
      after.count === before.count + 1 &&
      normalizeMessageText(after.lastText) === expected
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

  const before = await outgoingState(page, job.message);
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
