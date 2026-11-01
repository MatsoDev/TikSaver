import { NextResponse } from "next/server";
import { timingSafeEqualString } from "@/lib/auth";
import { sendTelegram } from "@/lib/telegram";
import { recordLoggedOutVisit } from "@/lib/session-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function headers(request: Request): Headers {
  const result = new Headers({
    "Access-Control-Allow-Headers": "content-type, x-extension-token",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    Vary: "Origin",
  });
  const origin = request.headers.get("origin") ?? "";
  if (origin.startsWith("chrome-extension://")) result.set("Access-Control-Allow-Origin", origin);
  return result;
}

function json(request: Request, body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: headers(request) });
}

export function OPTIONS(request: Request) {
  return new NextResponse(null, { status: 204, headers: headers(request) });
}

export async function POST(request: Request) {
  const expected = process.env.EXTENSION_TOKEN?.trim();
  const provided = request.headers.get("x-extension-token")?.trim() ?? "";
  if (!expected || !timingSafeEqualString(provided, expected)) {
    return json(request, { error: "unauthorized" }, 401);
  }
  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > 10_000) return json(request, { error: "payload too large" }, 413);
  const body = await request.json().catch(() => null);
  if (body?.status !== "logged_out" || typeof body.backgroundVisitAt !== "string") {
    return json(request, { error: "invalid status" }, 400);
  }
  const timestamp = Date.parse(body.backgroundVisitAt);
  if (!Number.isFinite(timestamp)) return json(request, { error: "invalid visit timestamp" }, 400);

  const shouldNotify = await recordLoggedOutVisit(new Date(timestamp));
  if (!shouldNotify) return json(request, { ok: true, notification: "throttled" });

  const telegram = await sendTelegram("TikTok session in Chrome is logged out, open tiktok.com and log in.");
  return json(request, {
    ok: true,
    notification: telegram.ok ? "sent" : "failed",
    telegramHttpStatus: telegram.httpStatus,
    ...(telegram.errorCode !== undefined ? { telegramErrorCode: telegram.errorCode } : {}),
    ...(telegram.description ? { telegramDescription: telegram.description } : {}),
  });
}
