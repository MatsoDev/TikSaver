import { NextResponse } from "next/server";
import { timingSafeEqualString } from "@/lib/auth";
import { claimDueJobs } from "@/lib/worker-claims";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const expected = process.env.CRON_SECRET?.trim();
  const provided = request.headers.get("x-cron-secret")?.trim() ?? "";
  if (!expected || !timingSafeEqualString(provided, expected)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const mode = process.env.SEND_MODE?.trim() || (process.env.EXECUTOR?.trim() === "local" ? "on_pc_start" : "scheduled");
  const result = await claimDueJobs(new Date(), mode);
  return NextResponse.json(request.headers.get("x-debug") === "1" ? result : { claimed: result.claimed, claims: result.claims });
}
