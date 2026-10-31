import type { Game } from "@/lib/types";

export const DEFAULT_GAME_SCHEDULES: Readonly<Record<string, string[]>> = {
  "monje-millonario": [
    "08:05",
    "09:05",
    "10:05",
    "11:05",
    "12:05",
    "13:05",
    "14:05",
    "15:05",
    "16:05",
    "17:05",
    "18:05",
    "19:05",
  ],
  "lotto-activo-internacional": [
    "08:30",
    "09:30",
    "10:30",
    "11:30",
    "12:30",
    "13:30",
    "14:30",
    "15:30",
    "16:30",
    "17:30",
    "18:30",
    "19:30",
  ],
  guacharito: [
    "08:30",
    "09:30",
    "10:30",
    "11:30",
    "12:30",
    "13:30",
    "14:30",
    "15:30",
    "16:30",
    "17:30",
    "18:30",
    "19:30",
  ],
  "selva-plus": [
    "08:15",
    "09:15",
    "10:15",
    "11:15",
    "12:15",
    "13:15",
    "14:15",
    "15:15",
    "16:15",
    "17:15",
    "18:15",
    "19:15",
  ],
  "lotto-activo": [
    "08:00",
    "09:00",
    "10:00",
    "11:00",
    "12:00",
    "13:00",
    "14:00",
    "15:00",
    "16:00",
    "17:00",
    "18:00",
    "19:00",
  ],
  guacharo: [
    "08:00",
    "09:00",
    "10:00",
    "11:00",
    "12:00",
    "13:00",
    "14:00",
    "15:00",
    "16:00",
    "17:00",
    "18:00",
    "19:00",
  ],
  granjita: [
    "08:00",
    "09:00",
    "10:00",
    "11:00",
    "12:00",
    "13:00",
    "14:00",
    "15:00",
    "16:00",
    "17:00",
    "18:00",
    "19:00",
  ],
  "loto-chaim-a": [
    "08:00",
    "09:00",
    "10:00",
    "11:00",
    "12:00",
    "13:00",
    "14:00",
    "15:00",
    "16:00",
    "17:00",
    "18:00",
    "19:00",
  ],
};

const STANDARD_HOURS = [
  "08:00",
  "09:00",
  "10:00",
  "11:00",
  "12:00",
  "13:00",
  "14:00",
  "15:00",
  "16:00",
  "17:00",
  "18:00",
  "19:00",
];

export function getDefaultGameScheduleTimes(slug: string): string[] {
  const norm = (slug || "").toLowerCase();
  if (DEFAULT_GAME_SCHEDULES[norm]) {
    return [...DEFAULT_GAME_SCHEDULES[norm]];
  }
  if (norm.includes("monje")) {
    return [...DEFAULT_GAME_SCHEDULES["monje-millonario"]];
  }
  if (norm.includes("internacional") || norm.includes("rdint")) {
    return [...DEFAULT_GAME_SCHEDULES["lotto-activo-internacional"]];
  }
  if (norm.includes("selva")) {
    return [...DEFAULT_GAME_SCHEDULES["selva-plus"]];
  }
  if (norm.includes("guacharito")) {
    return [...DEFAULT_GAME_SCHEDULES["guacharito"]];
  }
  return [...STANDARD_HOURS];
}

export function getGameScheduleTimes(gameOrSlug: Game | string | undefined | null): string[] {
  if (!gameOrSlug) return [...STANDARD_HOURS];

  if (typeof gameOrSlug === "object") {
    if (Array.isArray(gameOrSlug.schedule_times) && gameOrSlug.schedule_times.length > 0) {
      return [...gameOrSlug.schedule_times].sort((a, b) => a.localeCompare(b));
    }
    return getDefaultGameScheduleTimes(gameOrSlug.slug);
  }

  return getDefaultGameScheduleTimes(gameOrSlug);
}

export function formatScheduleTime(timeStr: string): string {
  if (!timeStr) return "";
  const parts = timeStr.split(":");
  const hour = parseInt(parts[0] ?? "0", 10);
  const min = parts[1] ?? "00";
  const ampm = hour >= 12 ? "PM" : "AM";
  const displayHour = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
  return `${String(displayHour).padStart(2, "0")}:${min} ${ampm}`;
}

export function normalizeScheduleTime(input: string): string | null {
  const trimmed = input.trim();
  const match = /^([01]?\d|2[0-3]):([0-5]\d)(?::[0-5]\d)?$/.exec(trimmed);
  if (!match) return null;
  const h = String(Number(match[1])).padStart(2, "0");
  const m = match[2];
  return `${h}:${m}`;
}
