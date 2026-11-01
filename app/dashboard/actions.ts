"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { dispatchWorkflow } from "@/lib/github";
import {
  createJob,
  deleteJob,
  getJob,
  setJobStatus,
  toggleJob,
  updateJob,
} from "@/lib/jobs";
import { addLog } from "@/lib/logs";
import { requireAuth } from "@/lib/server-auth";
import { formatDateInZone } from "@/lib/time";
import { parseJobForm } from "@/lib/validation";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function jobId(form: FormData): string {
  const id = String(form.get("id") ?? "");
  return UUID_PATTERN.test(id) ? id : "";
}

export async function createJobAction(form: FormData): Promise<void> {
  await requireAuth();

  const result = parseJobForm(form);
  if (!result.ok) {
    redirect(`/dashboard/jobs/new?error=${encodeURIComponent(result.error)}`);
  }

  await createJob(result.data);
  revalidatePath("/dashboard");
  redirect("/dashboard");
}

export async function updateJobAction(form: FormData): Promise<void> {
  await requireAuth();

  const id = jobId(form);
  if (!id) redirect("/dashboard");

  const result = parseJobForm(form);
  if (!result.ok) {
    redirect(
      `/dashboard/jobs/${id}?error=${encodeURIComponent(result.error)}`,
    );
  }

  await updateJob(id, result.data);
  revalidatePath("/dashboard");
  revalidatePath(`/dashboard/jobs/${id}`);
  redirect("/dashboard");
}

export async function deleteJobAction(form: FormData): Promise<void> {
  await requireAuth();

  const id = jobId(form);
  if (id) await deleteJob(id);

  revalidatePath("/dashboard");
  redirect("/dashboard");
}

export async function toggleJobAction(form: FormData): Promise<void> {
  await requireAuth();

  const id = jobId(form);
  if (!id) return;

  await toggleJob(id);
  revalidatePath("/dashboard");
}

export async function sendNowAction(form: FormData): Promise<void> {
  await requireAuth();

  const id = jobId(form);
  if (!id) return;

  const job = await getJob(id);
  if (!job) return;

  const result = await dispatchWorkflow(job.id);
  const today = formatDateInZone(new Date(), job.timezone);

  await setJobStatus(job.id, {
    lastRunDate: today,
    lastStatus: result.ok ? "manual_dispatched" : "dispatch_failed",
  });

  await addLog({
    jobId: job.id,
    status: result.ok ? "dispatched" : "dispatch_failed",
    detail: result.ok
      ? "Manual send dispatched to the worker."
      : (result.detail ?? "Could not dispatch the worker."),
  });

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/logs");
}
