import { describe, it, expect } from "vitest";
import {
  buildSelvaPlusResultsUrl,
  SELVA_PLUS_REQUIRED_HEADERS,
  normalizeSelvaPlusTime,
  parseSelvaPlusResultsJson,
  synchronizeSelvaPlusOfficialData,
} from "@/lib/selva-plus-provider.server";

describe("Selva Plus (selva-plus) Official Lotterly Provider", () => {
  it("builds the dynamic Lotterly endpoint URL with exact_date and extended=true", () => {
    expect(buildSelvaPlusResultsUrl("2026-11-22")).toBe(
      "https://api.lotterly.co/v1/results/selva-plus/?exact_date=2026-11-22&extended=true",
    );
  });

  it("includes all mandatory headers for www.selvaplus.com", () => {
    expect(SELVA_PLUS_REQUIRED_HEADERS).toEqual({
      Accept: "application/json",
      Origin: "https://www.selvaplus.com",
      Referer: "https://www.selvaplus.com/",
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    });
  });

  it("normalizes draw times from HH:MM:SS, HH:MM, and 12h AM/PM formats", () => {
    expect(normalizeSelvaPlusTime("08:00:00")).toEqual({ full: "08:00:00", short: "08:00" });
    expect(normalizeSelvaPlusTime("13:00:00")).toEqual({ full: "13:00:00", short: "13:00" });
    expect(normalizeSelvaPlusTime("07:00 PM")).toEqual({ full: "19:00:00", short: "19:00" });
  });

  it("filters only PUBLISHED draws and maps time and results[0].result accurately (including 0, 00 -> 100, and 1..99)", () => {
    const samplePayload = [
      {
        date: "2026-11-22",
        time: "08:00:00",
        status: "PUBLISHED",
        results: [{ result: "0" }],
      },
      {
        date: "2026-11-22",
        time: "09:00:00",
        status: "PUBLISHED",
        results: [{ result: "00" }],
      },
      {
        date: "2026-11-22",
        time: "10:00:00",
        status: "PUBLISHED",
        results: [{ result: "20" }],
      },
      {
        date: "2026-11-22",
        time: "11:00:00",
        status: "PENDING",
        results: [{ result: "15" }],
      },
    ];

    const parsed = parseSelvaPlusResultsJson(samplePayload, "2026-11-22");
    expect(parsed.date).toBe("2026-11-22");
    expect(parsed.draws).toHaveLength(3);

    expect(parsed.draws[0]).toMatchObject({
      drawDate: "2026-11-22",
      drawTime: "08:00:00",
      rawResultCode: "0",
      animalNumber: 0,
      animalLabel: "0",
      animalName: "Delfín",
    });

    expect(parsed.draws[1]).toMatchObject({
      drawDate: "2026-11-22",
      drawTime: "09:00:00",
      rawResultCode: "00",
      animalNumber: 100,
      animalLabel: "00",
      animalName: "Ballena",
    });

    expect(parsed.draws[2]).toMatchObject({
      drawDate: "2026-11-22",
      drawTime: "10:00:00",
      rawResultCode: "20",
      animalNumber: 20,
      animalLabel: "20",
      animalName: "Cochino",
    });
  });

  it("executes synchronizeSelvaPlusOfficialData cleanly", async () => {
    const res = await synchronizeSelvaPlusOfficialData({
      currentDate: "2026-11-22",
      resolveGameId: () => "2f50625d-8862-4554-9530-9f509b88513c",
      currentAnimalResults: [],
    });
    expect(res.payload.date).toBe("2026-11-22");
  });
});
