import { NextResponse } from "next/server";
import { timingSafeEqualString } from "@/lib/auth";
import { saveSession } from "@/lib/session-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const expected = process.env.CRON_SECRET?.trim();
  const provided = request.headers.get("x-cron-secret")?.trim() ?? "";
  if (!expected || !timingSafeEqualString(provided, expected)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const body = await request.json().catch(() => null);
  if (!Array.isArray(body?.cookies) || !body.cookies.some((cookie: unknown) =>
    typeof cookie === "object" && cookie !== null && (cookie as { name?: unknown }).name === "sessionid")) {
    return NextResponse.json({ error: "invalid cookies" }, { status: 400 });
  }
  await saveSession(JSON.stringify(body.cookies), "worker");
  return NextResponse.json({ ok: true });
}
