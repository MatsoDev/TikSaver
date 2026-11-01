import Link from "next/link";
import { notFound } from "next/navigation";
import { getJob } from "@/lib/jobs";
import { formatTimestamp } from "@/lib/time";
import { deleteJobAction, updateJobAction } from "../../actions";
import { JobForm } from "../job-form";

export const dynamic = "force-dynamic";

export default async function EditJobPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { error?: string };
}) {
  const job = await getJob(params.id);
  if (!job) notFound();

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <Link
          href="/dashboard"
          className="text-sm text-zinc-500 transition hover:text-zinc-300"
        >
          &larr; Back to jobs
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">
          Edit @{job.targetUsername}
        </h1>
        <p className="text-sm text-zinc-500">
          Created {formatTimestamp(job.createdAt)}
        </p>
      </header>

      <JobForm
        action={updateJobAction}
        job={job}
        submitLabel="Save changes"
        error={searchParams.error}
      />

      <form action={deleteJobAction} className="border-t border-zinc-800 pt-6">
        <input type="hidden" name="id" value={job.id} />
        <button
          type="submit"
          className="rounded-xl border border-red-500/30 px-5 py-3 text-sm text-red-300 transition hover:bg-red-500/10"
        >
          Delete job
        </button>
      </form>
    </div>
  );
}
