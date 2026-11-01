import { and, desc, eq, isNull, lte, or } from "drizzle-orm";
import { getDb } from "@/db";
import { extensionState, sessions } from "@/db/schema";
import { decrypt, encrypt } from "./crypto";

export type SessionInfo = {
  id: string;
  updatedAt: Date;
  cookieCount: number;
  source: string;
};

export type ExtensionSessionInfo = {
  lastExtensionSyncAt: Date | null;
  lastBackgroundVisitAt: Date | null;
  sessionStatus: string;
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

export async function getExtensionSessionInfo(): Promise<ExtensionSessionInfo | null> {
  const rows = await getDb().select().from(extensionState).where(eq(extensionState.id, "current")).limit(1);
  const row = rows[0];
  return row ? {
    lastExtensionSyncAt: row.lastExtensionSyncAt,
    lastBackgroundVisitAt: row.lastBackgroundVisitAt,
    sessionStatus: row.sessionStatus,
  } : null;
}

export async function recordExtensionSync(backgroundVisitAt?: Date): Promise<void> {
  const now = new Date();
  const update = {
    lastExtensionSyncAt: now,
    sessionStatus: "active",
    ...(backgroundVisitAt ? { lastBackgroundVisitAt: backgroundVisitAt } : {}),
  };
  await getDb().insert(extensionState).values({
    id: "current",
    lastExtensionSyncAt: now,
    lastBackgroundVisitAt: backgroundVisitAt ?? null,
    sessionStatus: "active",
  }).onConflictDoUpdate({ target: extensionState.id, set: update });
}

export async function recordLoggedOutVisit(visitedAt: Date): Promise<boolean> {
  const db = getDb();
  await db.insert(extensionState).values({
    id: "current",
    lastBackgroundVisitAt: visitedAt,
    sessionStatus: "logged_out",
  }).onConflictDoUpdate({
    target: extensionState.id,
    set: { lastBackgroundVisitAt: visitedAt, sessionStatus: "logged_out" },
  });

  const cutoff = new Date(Date.now() - 12 * 60 * 60 * 1000);
  const claimed = await db.update(extensionState).set({ loggedOutAlertAt: new Date() }).where(and(
    eq(extensionState.id, "current"),
    or(isNull(extensionState.loggedOutAlertAt), lte(extensionState.loggedOutAlertAt, cutoff)),
  )).returning({ id: extensionState.id });
  return claimed.length > 0;
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
