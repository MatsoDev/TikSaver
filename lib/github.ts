const WORKFLOW_FILE = "send.yml";

export type DispatchResult = { ok: boolean; detail?: string };

export function isGitHubConfigured(): boolean {
  return Boolean(process.env.GITHUB_TOKEN && process.env.GITHUB_REPO);
}

export async function dispatchWorkflow(jobId: string): Promise<DispatchResult> {
  const token = process.env.GITHUB_TOKEN;
  const repo = process.env.GITHUB_REPO;

  if (!token || !repo) {
    return { ok: false, detail: "GitHub dispatch is not configured" };
  }

  try {
    const response = await fetch(
      `https://api.github.com/repos/${repo}/actions/workflows/${WORKFLOW_FILE}/dispatches`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ ref: "main", inputs: { job_id: jobId } }),
        cache: "no-store",
      },
    );

    if (response.status === 204) {
      return { ok: true };
    }

    return {
      ok: false,
      detail: `GitHub returned ${response.status}`,
    };
  } catch {
    return { ok: false, detail: "Could not reach GitHub" };
  }
}
