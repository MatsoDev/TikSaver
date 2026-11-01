import { NextResponse } from "next/server";
import { timingSafeEqualString } from "@/lib/auth";
import { saveSession } from "@/lib/session-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const expected = process.env.EXTENSION_TOKEN?.trim();
  const provided = request.headers.get("x-extension-token")?.trim() ?? "";
  if (!expected || !timingSafeEqualString(provided, expected)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > 1_000_000) return NextResponse.json({ error: "payload too large" }, { status: 413 });
  const body = await request.json().catch(() => null);
  const cookies = body?.cookies;
  if (!Array.isArray(cookies) || cookies.length === 0 || cookies.length > 500) {
    return NextResponse.json({ error: "invalid cookies" }, { status: 400 });
  }
  if (!cookies.every((cookie) => typeof cookie?.name === "string" && typeof cookie?.value === "string" &&
    typeof cookie?.domain === "string" && cookie.domain.replace(/^\./, "").endsWith("tiktok.com"))) {
    return NextResponse.json({ error: "invalid cookie domain" }, { status: 400 });
  }
  if (!cookies.some((cookie) => cookie.name === "sessionid")) {
    return NextResponse.json({ error: "sessionid required" }, { status: 400 });
  }
  await saveSession(JSON.stringify(cookies), "extension");
  return NextResponse.json({ ok: true });
}
