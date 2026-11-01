import { desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { jobs, logs, type NewLog } from "@/db/schema";

export type LogWithJob = {
  id: string;
  jobId: string;
  status: string;
  detail: string | null;
  screenshotUrl: string | null;
  createdAt: Date;
  targetUsername: string | null;
};

export async function addLog(entry: NewLog): Promise<void> {
  await getDb().insert(logs).values(entry);
}

export async function listLogs(limit = 100): Promise<LogWithJob[]> {
  const rows = await getDb()
    .select({
      id: logs.id,
      jobId: logs.jobId,
      status: logs.status,
      detail: logs.detail,
      screenshotUrl: logs.screenshotUrl,
      createdAt: logs.createdAt,
      targetUsername: jobs.targetUsername,
    })
    .from(logs)
    .leftJoin(jobs, eq(logs.jobId, jobs.id))
    .orderBy(desc(logs.createdAt))
    .limit(limit);

  return rows;
}

export async function listJobLogs(jobId: string, limit = 20): Promise<LogWithJob[]> {
  const rows = await getDb()
    .select({
      id: logs.id,
      jobId: logs.jobId,
      status: logs.status,
      detail: logs.detail,
      screenshotUrl: logs.screenshotUrl,
      createdAt: logs.createdAt,
      targetUsername: jobs.targetUsername,
    })
    .from(logs)
    .leftJoin(jobs, eq(logs.jobId, jobs.id))
    .where(eq(logs.jobId, jobId))
    .orderBy(desc(logs.createdAt))
    .limit(limit);

  return rows;
}

export async function getLogById(id: string) {
  const rows = await getDb().select().from(logs).where(eq(logs.id, id)).limit(1);
  return rows[0] ?? null;
}

