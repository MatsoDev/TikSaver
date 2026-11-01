import { NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/server-auth";
import { sendTelegram } from "@/lib/telegram";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const result = await sendTelegram("Tiksave Telegram test message.");
  return NextResponse.json(result, { status: result.ok ? 200 : 502 });
}
