import { desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { sessions } from "@/db/schema";
import { decrypt, encrypt } from "./crypto";

export type SessionInfo = {
  id: string;
  updatedAt: Date;
  cookieCount: number;
  source: string;
};

type CookieRecord = Record<string, unknown> & { name: string; value: string };

function isCookie(value: unknown): value is CookieRecord {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as CookieRecord).name === "string" &&
    typeof (value as CookieRecord).value === "string"
  );
}

export function parseCookies(raw: string): CookieRecord[] | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }

  const list =
    Array.isArray(parsed) || !parsed || typeof parsed !== "object"
      ? parsed
      : (parsed as { cookies?: unknown }).cookies;

  if (!Array.isArray(list)) return null;

  const cookies = list.filter(isCookie);
  return cookies.length > 0 ? cookies : null;
}

async function latestSession() {
  const rows = await getDb()
    .select()
    .from(sessions)
    .orderBy(desc(sessions.updatedAt))
    .limit(1);
  return rows[0] ?? null;
}

export async function saveSession(raw: string, source = "manual"): Promise<SessionInfo> {
  const cookies = parseCookies(raw);
  if (!cookies) {
    throw new Error(
      "Could not find a cookies array. Paste the exported JSON array, or a Playwright storage state.",
    );
  }

  const encrypted = encrypt(JSON.stringify({ cookies }));
  const existing = await latestSession();
  const now = new Date();

  if (existing) {
    await getDb()
      .update(sessions)
      .set({ cookiesEncrypted: encrypted, updatedAt: now, source })
      .where(eq(sessions.id, existing.id));
    return { id: existing.id, updatedAt: now, cookieCount: cookies.length, source };
  }

  const inserted = await getDb()
    .insert(sessions)
    .values({ cookiesEncrypted: encrypted, updatedAt: now })
    .returning();

  return {
    id: inserted[0].id,
    updatedAt: now,
    cookieCount: cookies.length,
    source,
  };
}

export async function getSessionInfo(): Promise<SessionInfo | null> {
  const row = await latestSession();
  if (!row) return null;

  try {
    const cookies = parseCookies(decrypt(row.cookiesEncrypted));
    return {
      id: row.id,
      updatedAt: row.updatedAt,
      cookieCount: cookies?.length ?? 0,
      source: row.source,
    };
  } catch {
    return { id: row.id, updatedAt: row.updatedAt, cookieCount: 0, source: row.source };
  }
}

export async function getSessionCookies(): Promise<CookieRecord[] | null> {
  const row = await latestSession();
  if (!row) return null;

  try {
    return parseCookies(decrypt(row.cookiesEncrypted));
  } catch {
    return null;
  }
}

export async function deleteSession(): Promise<void> {
  await getDb().delete(sessions);
}
