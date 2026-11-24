export function isNetworkFailure(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return /net::ERR_(?:TIMED_OUT|CONNECTION|INTERNET|NETWORK|NAME_NOT_RESOLVED)|fetch failed|connect timeout|ECONNRESET|ETIMEDOUT|ENOTFOUND|networkerror|network request failed/i.test(error.message) ||
    (error.name === "TimeoutError" && /page\.goto|navigation|fetch|aborted due to timeout/i.test(error.message));
}

export function canRetryNetwork(error: unknown, submissionStarted: boolean): boolean {
  return !submissionStarted && isNetworkFailure(error);
}
