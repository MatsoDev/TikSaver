import { createJobAction } from "../../actions";
import { JobForm } from "../job-form";

export const dynamic = "force-dynamic";

export default function NewJobPage({
  searchParams,
}: {
  searchParams: { error?: string };
}) {
  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">New job</h1>
        <p className="text-sm text-zinc-400">
          Pick a contact and the time you want to keep your streak alive.
        </p>
      </header>

      <JobForm
        action={createJobAction}
        submitLabel="Create job"
        error={searchParams.error}
      />
    </div>
  );
}
