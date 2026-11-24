export type WorkerJob = {
  id: string;
  targetUsername: string;
  message: string;
  timezone: string;
  claimId?: string | null;
};

export type WorkerStatus = "success" | "failed" | "session_expired" | "network_wait";

export type SendResult = {
  status: WorkerStatus;
  detail: string;
};

export type JobPayload = {
  job: WorkerJob;
  cookies: unknown[];
};
