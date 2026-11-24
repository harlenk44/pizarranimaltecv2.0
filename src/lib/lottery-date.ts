export const LOTTERY_TIMEZONE = "America/Caracas";

/** Calendar date of a lottery draw, independent of the display device's timezone. */
export function lotteryDate(date: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: LOTTERY_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

/** Current time of day in Venezuela (America/Caracas) as total minutes since 00:00 (0..1439). */
export function lotteryCurrentMinutes(date: Date = new Date()): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: LOTTERY_TIMEZONE,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const rawHour = Number(parts.find((p) => p.type === "hour")?.value ?? 0);
  const hour = rawHour === 24 ? 0 : rawHour;
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? 0);
  return hour * 60 + minute;
}

/** Parses HH:MM or HH:MM:SS into minutes since midnight, or null if invalid. */
export function parseDrawTimeMinutes(drawTime?: string | null): number | null {
  if (!drawTime || typeof drawTime !== "string") return null;
  const match = drawTime.trim().match(/^(\d{1,2}):(\d{2})/);
  if (!match) return null;
  const h = Number(match[1]);
  const m = Number(match[2]);
  if (!Number.isFinite(h) || !Number.isFinite(m) || h < 0 || h > 23 || m < 0 || m > 59) {
    return null;
  }
  return h * 60 + m;
}

/**
 * Returns true if the draw's date/time is strictly in the future relative to Venezuela's current clock
 * (beyond `graceMinutes`, default 5 min). Prevents yesterday's full board shown on scraper sites
 * after midnight (12:00 AM Venezuela) from poisoning today's slots with future draw times.
 */
export function isFutureLotteryDrawTime(
  drawDate?: string | null,
  drawTime?: string | null,
  now: Date = new Date(),
  graceMinutes = 5,
): boolean {
  if (!drawDate || !drawTime) return false;
  const today = lotteryDate(now);
  if (drawDate > today) return true;
  if (drawDate < today) return false;
  const drawMins = parseDrawTimeMinutes(drawTime);
  if (drawMins === null) return false;
  const nowMins = lotteryCurrentMinutes(now);
  return drawMins > nowMins + graceMinutes;
}
