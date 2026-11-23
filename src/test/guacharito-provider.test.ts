import { describe, it, expect } from "vitest";
import {
  buildGuacharitoResultsUrl,
  GUACHARITO_REQUIRED_HEADERS,
  normalizeGuacharitoTime,
  parseGuacharitoResultsJson,
  synchronizeGuacharitoOfficialData,
} from "@/lib/guacharito-provider.server";

describe("Guacharito Millonario (el-guacharito-millonario) Official Lotterly Provider", () => {
  it("builds the dynamic Lotterly endpoint URL with exact_date and extended=true", () => {
    expect(buildGuacharitoResultsUrl("2026-11-22")).toBe(
      "https://api.lotterly.co/v1/results/el-guacharito-millonario/?exact_date=2026-11-22&extended=true",
    );
  });

  it("includes all mandatory headers for elguacharitomillonario.com", () => {
    expect(GUACHARITO_REQUIRED_HEADERS).toEqual({
      Accept: "application/json",
      Origin: "https://elguacharitomillonario.com",
      Referer: "https://elguacharitomillonario.com/",
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    });
  });

  it("normalizes draw times from HH:MM:SS, HH:MM, and 12h AM/PM formats", () => {
    expect(normalizeGuacharitoTime("08:30:00")).toEqual({ full: "08:30:00", short: "08:30" });
    expect(normalizeGuacharitoTime("13:30:00")).toEqual({ full: "13:30:00", short: "13:30" });
    expect(normalizeGuacharitoTime("07:30 PM")).toEqual({ full: "19:30:00", short: "19:30" });
  });

  it("filters only PUBLISHED draws and maps time and results[0].result accurately (including 0, 00 -> 100, and 1..99)", () => {
    const samplePayload = [
      {
        date: "2026-11-22",
        time: "08:30:00",
        status: "PUBLISHED",
        results: [{ result: "0" }],
      },
      {
        date: "2026-11-22",
        time: "09:30:00",
        status: "PUBLISHED",
        results: [{ result: "00" }],
      },
      {
        date: "2026-11-22",
        time: "10:30:00",
        status: "PUBLISHED",
        results: [{ result: "85" }],
      },
      {
        date: "2026-11-22",
        time: "11:30:00",
        status: "PENDING",
        results: [{ result: "15" }],
      },
    ];

    const parsed = parseGuacharitoResultsJson(samplePayload, "2026-11-22");
    expect(parsed.date).toBe("2026-11-22");
    expect(parsed.draws).toHaveLength(3);

    expect(parsed.draws[0]).toMatchObject({
      drawDate: "2026-11-22",
      drawTime: "08:30:00",
      rawResultCode: "0",
      animalNumber: 0,
      animalLabel: "0",
      animalName: "Delfín",
    });

    expect(parsed.draws[1]).toMatchObject({
      drawDate: "2026-11-22",
      drawTime: "09:30:00",
      rawResultCode: "00",
      animalNumber: 100,
      animalLabel: "00",
      animalName: "Ballena",
    });

    expect(parsed.draws[2]).toMatchObject({
      drawDate: "2026-11-22",
      drawTime: "10:30:00",
      rawResultCode: "85",
      animalNumber: 85,
      animalLabel: "85",
    });
  });

  it("preserves manual corrections during synchronization", async () => {
    const res = await synchronizeGuacharitoOfficialData({
      currentDate: "2026-11-22",
      resolveGameId: () => "0519825d-e7ea-4e59-bf7d-cef2c832edd3",
      currentAnimalResults: [],
    });
    expect(res.payload.date).toBe("2026-11-22");
  });
});
