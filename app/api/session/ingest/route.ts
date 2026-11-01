import { NextResponse } from "next/server";
import { timingSafeEqualString } from "@/lib/auth";
import { recordExtensionSync, saveSession } from "@/lib/session-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function cors(request: Request): Headers {
  const headers = new Headers();
  const origin = request.headers.get("origin") ?? "";
  if (origin.startsWith("chrome-extension://")) headers.set("Access-Control-Allow-Origin", origin);
  headers.set("Access-Control-Allow-Headers", "content-type, x-extension-token");
  headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  return headers;
}

function json(request: Request, body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: cors(request) });
}

export function OPTIONS(request: Request) {
  return new NextResponse(null, { status: 204, headers: cors(request) });
}

export async function POST(request: Request) {
  const expected = process.env.EXTENSION_TOKEN?.trim();
  const provided = request.headers.get("x-extension-token")?.trim() ?? "";
  if (!expected || !timingSafeEqualString(provided, expected)) {
    return json(request, { error: "unauthorized" }, 401);
  }
  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > 1_000_000) return json(request, { error: "payload too large" }, 413);
  const body = await request.json().catch(() => null);
  const cookies = body?.cookies;
  if (!Array.isArray(cookies) || cookies.length === 0 || cookies.length > 500) {
    return json(request, { error: "invalid cookies" }, 400);
  }
  if (!cookies.every((cookie) => typeof cookie?.name === "string" && typeof cookie?.value === "string" &&
    typeof cookie?.domain === "string" && cookie.domain.replace(/^\./, "").endsWith("tiktok.com"))) {
    return json(request, { error: "invalid cookie domain" }, 400);
  }
  if (!cookies.some((cookie) => cookie.name === "sessionid")) {
    return json(request, { error: "sessionid required" }, 400);
  }
  let backgroundVisitAt: Date | undefined;
  if (body.backgroundVisitAt !== undefined) {
    if (typeof body.backgroundVisitAt !== "string" || !Number.isFinite(Date.parse(body.backgroundVisitAt))) {
      return json(request, { error: "invalid background visit timestamp" }, 400);
    }
    backgroundVisitAt = new Date(body.backgroundVisitAt);
  }
  await saveSession(JSON.stringify(cookies), "extension");
  await recordExtensionSync(backgroundVisitAt);
  return json(request, { ok: true });
}
