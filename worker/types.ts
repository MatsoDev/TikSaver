export type WorkerJob = {
  id: string;
  targetUsername: string;
  message: string;
  timezone: string;
};

export type WorkerStatus = "success" | "failed" | "session_expired";

export type SendResult = {
  status: WorkerStatus;
  detail: string;
};

export type JobPayload = {
  job: WorkerJob;
  cookies: unknown[];
};
