import { describe, expect, it, beforeEach } from "vitest";
import {
  getSorteoAlertKey,
  normalizeTimeTo24h,
  normalizeGameIdentifier,
  sorteoAlertTracker,
} from "@/lib/sorteo-alert-tracker";

describe("sorteoAlertTracker", () => {
  beforeEach(() => {
    sorteoAlertTracker.clear();
  });

  it("normalizes time correctly across various formats", () => {
    expect(normalizeTimeTo24h("11:15")).toBe("11:15");
    expect(normalizeTimeTo24h("11:15:00")).toBe("11:15");
    expect(normalizeTimeTo24h("11:15 AM")).toBe("11:15");
    expect(normalizeTimeTo24h("11:15 PM")).toBe("23:15");
    expect(normalizeTimeTo24h("12:00 PM")).toBe("12:00");
    expect(normalizeTimeTo24h("12:00 AM")).toBe("00:00");
    expect(normalizeTimeTo24h("09:00")).toBe("09:00");
  });

  it("normalizes game identifiers consistently between UUIDs, names, and slugs", () => {
    // Selva Plus
    expect(normalizeGameIdentifier("8f3aa087-6a0c-41a1-9ed3-5f6d5ed6918e")).toBe("selva-plus");
    expect(normalizeGameIdentifier("SELVA PLUS")).toBe("selva-plus");
    expect(normalizeGameIdentifier("selva-plus")).toBe("selva-plus");

    // Lotto Activo
    expect(normalizeGameIdentifier("7d21a00b-0dfa-4bdc-9edf-8115802df1d6")).toBe("lotto-activo");
    expect(normalizeGameIdentifier("LOTTO ACTIVO")).toBe("lotto-activo");
  });

  it("generates identical canonical key for the same draw from different representations", () => {
    const key1 = getSorteoAlertKey({
      gameId: "8f3aa087-6a0c-41a1-9ed3-5f6d5ed6918e",
      drawDate: "2026-10-31",
      drawTime: "11:15:00",
    });

    const key2 = getSorteoAlertKey({
      gameName: "SELVA PLUS",
      draw_date: "2026-10-31",
      draw_time: "11:15 AM",
    });

    expect(key1).toBe("sorteo:selva-plus:2026-10-31:11:15");
    expect(key2).toBe("sorteo:selva-plus:2026-10-31:11:15");
    expect(key1).toBe(key2);
  });

  it("registers alerted draws and prevents alerting the same draw twice", () => {
    const draw = {
      gameId: "selva-plus",
      drawDate: "2026-10-31",
      drawTime: "11:15:00",
    };

    expect(sorteoAlertTracker.hasBeenAlerted(draw)).toBe(false);

    sorteoAlertTracker.markAsAlerted(draw);

    expect(sorteoAlertTracker.hasBeenAlerted(draw)).toBe(true);
    // Alternate format of same draw is also recognized as alerted
    expect(
      sorteoAlertTracker.hasBeenAlerted({
        gameName: "SELVA PLUS",
        drawDate: "2026-10-31",
        drawTime: "11:15 AM",
      }),
    ).toBe(true);
  });
});
