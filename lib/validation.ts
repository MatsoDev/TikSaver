import type { JobInput } from "./jobs";
import { isValidTimeZone, parseTime } from "./time";

const USERNAME_PATTERN = /^[A-Za-z0-9._]{1,24}$/;

export type ParseResult =
  | { ok: true; data: JobInput }
  | { ok: false; error: string };

export function normalizeUsername(value: string): string {
  return value.trim().replace(/^@+/, "");
}

export function parseJobForm(form: FormData): ParseResult {
  const targetUsername = normalizeUsername(String(form.get("targetUsername") ?? ""));
  const message = String(form.get("message") ?? "").trim();
  const sendTime = String(form.get("sendTime") ?? "").trim();
  const timezone = String(form.get("timezone") ?? "").trim();
  const jitterRaw = String(form.get("jitterMinutes") ?? "5").trim();

  if (!USERNAME_PATTERN.test(targetUsername)) {
    return {
      ok: false,
      error: "Username must be 1-24 letters, numbers, dots or underscores.",
    };
  }

  if (!message) {
    return { ok: false, error: "Message cannot be empty." };
  }

  if (message.length > 2000) {
    return { ok: false, error: "Message must be 2000 characters or fewer." };
  }

  if (!parseTime(sendTime)) {
    return { ok: false, error: "Send time must use HH:MM (24-hour) format." };
  }

  if (!isValidTimeZone(timezone)) {
    return { ok: false, error: "Unknown timezone." };
  }

  const jitterMinutes = Number(jitterRaw);
  if (
    !Number.isInteger(jitterMinutes) ||
    jitterMinutes < 0 ||
    jitterMinutes > 60
  ) {
    return { ok: false, error: "Jitter must be a whole number from 0 to 60." };
  }

  return {
    ok: true,
    data: { targetUsername, message, sendTime, timezone, jitterMinutes },
  };
}
