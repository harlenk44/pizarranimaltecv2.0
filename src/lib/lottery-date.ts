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
