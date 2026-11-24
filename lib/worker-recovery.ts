export const CLAIM_LEASE_MS = 20 * 60 * 1000;

export function networkRetryDelay(retryCount: number): number {
  return Math.min(30, 5 * 2 ** Math.min(Math.max(retryCount, 0), 3)) * 60 * 1000;
}
