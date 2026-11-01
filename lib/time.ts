export const DEFAULT_TIMEZONE = "Africa/Cairo";

export const COMMON_TIMEZONES = [
  "Africa/Cairo",
  "Africa/Casablanca",
  "Africa/Johannesburg",
  "Africa/Lagos",
  "America/Chicago",
  "America/Los_Angeles",
  "America/New_York",
  "America/Sao_Paulo",
  "Asia/Amman",
  "Asia/Beirut",
  "Asia/Dubai",
  "Asia/Kolkata",
  "Asia/Riyadh",
  "Asia/Seoul",
  "Asia/Shanghai",
  "Asia/Singapore",
  "Asia/Tokyo",
  "Australia/Sydney",
  "Europe/Berlin",
  "Europe/Istanbul",
  "Europe/London",
  "Europe/Paris",
  "Europe/Rome",
  "UTC",
];

export function parseTime(value: string): { hours: number; minutes: number } | null {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value.trim());
  if (!match) return null;
  return { hours: Number(match[1]), minutes: Number(match[2]) };
}

export function minutesFromTime(value: string): number | null {
  const parsed = parseTime(value);
  return parsed ? parsed.hours * 60 + parsed.minutes : null;
}

export function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
    return true;
  } catch {
    return false;
  }
}

export function getZonedTime(
  date: Date,
  timeZone: string,
): { date: string; minutes: number } {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });

  const parts: Record<string, string> = {};
  for (const part of formatter.formatToParts(date)) {
    if (part.type !== "literal") parts[part.type] = part.value;
  }

  const dateKey = `${parts.year}-${parts.month}-${parts.day}`;
  const minutes = Number(parts.hour) * 60 + Number(parts.minute);
  return { date: dateKey, minutes };
}

export function formatDateInZone(date: Date, timeZone: string): string {
  return getZonedTime(date, timeZone).date;
}

export function formatTimestamp(date: Date): string {
  const formatted = new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(date);
  return `${formatted} UTC`;
}

export function deterministicJitter(
  jobId: string,
  date: string,
  maxMinutes: number,
): number {
  if (maxMinutes <= 0) return 0;

  let hash = 2166136261;
  const input = `${jobId}:${date}`;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }

  return Math.abs(hash) % (maxMinutes + 1);
}
