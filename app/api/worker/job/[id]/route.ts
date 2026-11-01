import { NextResponse } from "next/server";
import { timingSafeEqualString } from "@/lib/auth";
import { getJob } from "@/lib/jobs";
import { getSessionCookies } from "@/lib/session-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function authorized(request: Request): boolean {
  const expected = process.env.CRON_SECRET?.trim();
  const provided = request.headers.get("x-cron-secret")?.trim() ?? "";
  if (!expected) return false;
  return timingSafeEqualString(provided, expected);
}

export async function GET(
  request: Request,
  { params }: { params: { id: string } },
) {
  if (!process.env.CRON_SECRET) {
    return NextResponse.json(
      { error: "CRON_SECRET is not configured" },
      { status: 500 },
    );
  }

  if (!authorized(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const job = await getJob(params.id);
  if (!job) {
    return NextResponse.json({ error: "job not found" }, { status: 404 });
  }

  const cookies = await getSessionCookies();
  if (!cookies) {
    return NextResponse.json(
      { error: "no stored TikTok session" },
      { status: 409 },
    );
  }

  return NextResponse.json({
    job: {
      id: job.id,
      targetUsername: job.targetUsername,
      message: job.message,
      timezone: job.timezone,
    },
    cookies,
  });
}
