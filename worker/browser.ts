import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { chromium, type Browser, type Page } from "playwright";

export const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

export type PlaywrightCookie = {
  name: string;
  value: string;
  domain?: string;
  path?: string;
  expires?: number;
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: "Strict" | "Lax" | "None";
};

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function randomBetween(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export async function launchBrowser(): Promise<Browser> {
  return chromium.launch({ headless: true });
}

export async function newContext(browser: Browser, timezone: string) {
  return browser.newContext({
    userAgent: USER_AGENT,
    viewport: { width: 1280, height: 800 },
    locale: "en-US",
    timezoneId: timezone,
  });
}

function mapSameSite(value: unknown): "Strict" | "Lax" | "None" | undefined {
  if (typeof value !== "string") return undefined;
  switch (value.toLowerCase()) {
    case "strict":
      return "Strict";
    case "lax":
      return "Lax";
    case "none":
    case "no_restriction":
      return "None";
    default:
      return undefined;
  }
}

export function normalizeCookies(raw: unknown[]): PlaywrightCookie[] {
  const cookies: PlaywrightCookie[] = [];

  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const cookie = item as Record<string, unknown>;
    if (typeof cookie.name !== "string" || typeof cookie.value !== "string") {
      continue;
    }

    const sameSite = mapSameSite(cookie.sameSite);
    const expiresValue =
      typeof cookie.expires === "number"
        ? cookie.expires
        : typeof cookie.expirationDate === "number"
          ? cookie.expirationDate
          : -1;

    cookies.push({
      name: cookie.name,
      value: cookie.value,
      domain:
        typeof cookie.domain === "string" ? cookie.domain : ".tiktok.com",
      path: typeof cookie.path === "string" ? cookie.path : "/",
      expires: expiresValue > 0 ? expiresValue : -1,
      httpOnly: Boolean(cookie.httpOnly),
      secure: sameSite === "None" ? true : Boolean(cookie.secure),
      sameSite,
    });
  }

  return cookies;
}

export async function humanType(page: Page, text: string): Promise<void> {
  for (const char of text) {
    await page.keyboard.type(char);
    await sleep(randomBetween(25, 90));
  }
}

export async function captureScreenshot(
  page: Page,
  jobId: string,
): Promise<string | undefined> {
  const buffer = await page
    .screenshot({ type: "jpeg", quality: 50 })
    .catch(() => null);

  if (!buffer) return undefined;

  try {
    const dir = join(process.cwd(), "screenshots");
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, `${jobId}-${Date.now()}.jpg`), buffer);
  } catch {
    // Local saving is best effort; the inline copy is what matters.
  }

  if (buffer.length > 1_500_000) return undefined;
  return `data:image/jpeg;base64,${buffer.toString("base64")}`;
}
