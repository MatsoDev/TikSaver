import { asc, desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { jobs, type Job, type NewJob } from "@/db/schema";

export type JobInput = {
  targetUsername: string;
  message: string;
  sendTime: string;
  timezone: string;
  jitterMinutes: number;
};

export async function listJobs(): Promise<Job[]> {
  return getDb()
    .select()
    .from(jobs)
    .orderBy(asc(jobs.sendTime), asc(jobs.createdAt));
}

export async function getJob(id: string): Promise<Job | null> {
  const rows = await getDb().select().from(jobs).where(eq(jobs.id, id)).limit(1);
  return rows[0] ?? null;
}

export async function createJob(input: JobInput): Promise<Job> {
  const rows = await getDb().insert(jobs).values(input).returning();
  return rows[0];
}

export async function updateJob(id: string, input: JobInput): Promise<void> {
  await getDb().update(jobs).set(input).where(eq(jobs.id, id));
}

export async function setJobEnabled(id: string, enabled: boolean): Promise<void> {
  await getDb().update(jobs).set({ enabled }).where(eq(jobs.id, id));
}

export async function toggleJob(id: string): Promise<void> {
  const job = await getJob(id);
  if (!job) return;
  await setJobEnabled(id, !job.enabled);
}

export async function deleteJob(id: string): Promise<void> {
  await getDb().delete(jobs).where(eq(jobs.id, id));
}

export async function setJobStatus(
  id: string,
  patch: Partial<Pick<NewJob, "lastRunDate" | "lastStatus">>,
): Promise<void> {
  await getDb().update(jobs).set(patch).where(eq(jobs.id, id));
}

export async function recentJobs(limit = 50): Promise<Job[]> {
  return getDb().select().from(jobs).orderBy(desc(jobs.createdAt)).limit(limit);
}
