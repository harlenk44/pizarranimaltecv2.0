import { describe, it, expect } from "vitest";
import {
  getDefaultGameScheduleTimes,
  getGameScheduleTimes,
  formatScheduleTime,
  normalizeScheduleTime,
  DEFAULT_GAME_SCHEDULES,
} from "@/lib/game-schedules";
import type { Game } from "@/lib/types";

describe("game-schedules helper", () => {
  it("provides correct official draw times for Monje Millonario (:05 minutes)", () => {
    const times = getDefaultGameScheduleTimes("monje-millonario");
    expect(times).toEqual([
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
    ]);
    expect(times).not.toContain("08:00");
    expect(times).not.toContain("09:00");
  });

  it("provides correct official draw times for Lotto Activo RD Internacional (:30 minutes)", () => {
    const times = getDefaultGameScheduleTimes("lotto-activo-internacional");
    expect(times).toContain("08:30");
    expect(times).toContain("09:30");
    expect(times).not.toContain("08:00");
    expect(times).not.toContain("09:00");
  });

  it("prioritizes custom schedule_times when configured on a Game", () => {
    const customGame: Game = {
      id: "test-game",
      name: "Monje Test",
      slug: "monje-millonario",
      color: "#9333ea",
      display_order: 1,
      is_active: true,
      schedule_times: ["08:05", "10:05", "14:05"],
      created_at: new Date().toISOString(),
    };

    const times = getGameScheduleTimes(customGame);
    expect(times).toEqual(["08:05", "10:05", "14:05"]);
  });

  it("formats and normalizes schedule times properly", () => {
    expect(formatScheduleTime("08:05")).toBe("08:05 AM");
    expect(formatScheduleTime("13:05")).toBe("01:05 PM");
    expect(formatScheduleTime("00:30")).toBe("12:30 AM");

    expect(normalizeScheduleTime("8:05")).toBe("08:05");
    expect(normalizeScheduleTime("09:30:00")).toBe("09:30");
    expect(normalizeScheduleTime("invalid")).toBeNull();
  });

  it("provides correct official draw times for La Ricachona (:10 minutes) and migrates legacy :00 schedules", () => {
    const times = getDefaultGameScheduleTimes("la-ricachona");
    expect(times).toEqual([
      "08:10",
      "09:10",
      "10:10",
      "11:10",
      "12:10",
      "13:10",
      "14:10",
      "15:10",
      "16:10",
      "17:10",
      "18:10",
      "19:10",
    ]);

    const legacyRicachona: Game = {
      id: "3b92f700-0000-4000-8000-000000000011",
      name: "LA RICACHONA",
      slug: "la-ricachona",
      color: "#eab308",
      display_order: 11,
      is_active: true,
      schedule_times: ["08:00", "09:00", "10:00"],
      created_at: new Date().toISOString(),
    };
    expect(getGameScheduleTimes(legacyRicachona)).toEqual(DEFAULT_GAME_SCHEDULES["la-ricachona"]);
  });
});
