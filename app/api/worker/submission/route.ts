import { and, eq, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { jobs } from "@/db/schema";
import { timingSafeEqualString } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret || !timingSafeEqualString(request.headers.get("x-cron-secret")?.trim() ?? "", secret)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const body = await request.json().catch(() => null);
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuid.test(body?.jobId ?? "") || !uuid.test(body?.claimId ?? "")) {
    return NextResponse.json({ error: "invalid payload" }, { status: 400 });
  }
  const claimed = await getDb().update(jobs).set({ submissionStartedAt: new Date() }).where(and(
    eq(jobs.id, body.jobId), eq(jobs.claimId, body.claimId), eq(jobs.enabled, true),
    eq(jobs.lastStatus, "claimed"), isNull(jobs.submissionStartedAt),
  )).returning({ id: jobs.id });
  return NextResponse.json({ ok: claimed.length === 1 }, { status: claimed.length ? 200 : 409 });
}
