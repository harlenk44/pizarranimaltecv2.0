import { describe, expect, it } from "vitest";
import {
  buildGuacharoResultsUrl,
  GUACHARO_FETCH_TIMEOUT_MS,
  GUACHARO_REQUIRED_HEADERS,
  normalizeGuacharoTime,
  parseGuacharoResultsJson,
} from "@/lib/guacharo-provider.server";

describe("Guácharo Activo Official Lotterly Provider", () => {
  it("builds the exact dynamic Lotterly URL with exact_date and extended=true", () => {
    expect(buildGuacharoResultsUrl("2026-11-22")).toBe(
      "https://api.lotterly.co/v1/results/guacharo-activo/?exact_date=2026-11-22&extended=true",
    );
  });

  it("includes the required Origin, Referer, Accept, and User-Agent headers and a 4-5s timeout", () => {
    expect(GUACHARO_REQUIRED_HEADERS).toEqual({
      Accept: "application/json",
      Origin: "https://guacharoactivo.com",
      Referer: "https://guacharoactivo.com/",
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    });
    expect(GUACHARO_FETCH_TIMEOUT_MS).toBeGreaterThanOrEqual(4000);
    expect(GUACHARO_FETCH_TIMEOUT_MS).toBeLessThanOrEqual(5000);
  });

  it("normalizes Lotterly 24h time strings and 12h strings", () => {
    expect(normalizeGuacharoTime("08:00:00")).toEqual({ full: "08:00:00", short: "08:00" });
    expect(normalizeGuacharoTime("13:00:00")).toEqual({ full: "13:00:00", short: "13:00" });
    expect(normalizeGuacharoTime("7:00 PM")).toEqual({ full: "19:00:00", short: "19:00" });
  });

  it("extracts only PUBLISHED draws, maps time and results[0].result, and resolves Guácharo animals (0, 00=76, 01..75)", () => {
    const samplePayload = [
      {
        id: "9c5f78b1-104a-4de5-8823-2eaba88f65b8",
        date: "2026-11-22",
        time: "08:00:00",
        status: "PUBLISHED",
        product: { slug: "guacharo-activo", name: "Guácharo Activo" },
        results: [
          {
            product_game_type: { slug: "guacharo-activo", name: "Guácharo Activo" },
            result: "15",
          },
        ],
      },
      {
        id: "383c645a-616f-4634-8344-44b465819b9f",
        date: "2026-11-22",
        time: "09:00:00",
        status: "PUBLISHED",
        product: { slug: "guacharo-activo", name: "Guácharo Activo" },
        results: [
          {
            product_game_type: { slug: "guacharo-activo", name: "Guácharo Activo" },
            result: "63",
          },
        ],
      },
      {
        id: "delfin-draw",
        date: "2026-11-22",
        time: "10:00:00",
        status: "PUBLISHED",
        results: [{ result: "0" }],
      },
      {
        id: "ballena-draw",
        date: "2026-11-22",
        time: "11:00:00",
        status: "PUBLISHED",
        results: [{ result: "00" }],
      },
      {
        id: "pending-draw",
        date: "2026-11-22",
        time: "19:00:00",
        status: "PENDING",
        results: [{ result: "75" }],
      },
    ];

    const parsed = parseGuacharoResultsJson(samplePayload, "2026-11-22");
    expect(parsed.date).toBe("2026-11-22");
    expect(parsed.draws).toHaveLength(4);

    expect(parsed.draws[0]).toMatchObject({
      drawDate: "2026-11-22",
      drawTime: "08:00:00",
      drawTimeShort: "08:00",
      rawResultCode: "15",
      animalNumber: 15,
      animalLabel: "15",
      animalName: "Zorro",
    });

    expect(parsed.draws[1]).toMatchObject({
      drawDate: "2026-11-22",
      drawTime: "09:00:00",
      drawTimeShort: "09:00",
      rawResultCode: "63",
      animalNumber: 63,
      animalLabel: "63",
      animalName: "Cangrejo",
    });

    expect(parsed.draws[2]).toMatchObject({
      drawDate: "2026-11-22",
      drawTime: "10:00:00",
      rawResultCode: "0",
      animalNumber: 0,
      animalLabel: "0",
      animalName: "Delfín",
    });

    expect(parsed.draws[3]).toMatchObject({
      drawDate: "2026-11-22",
      drawTime: "11:00:00",
      rawResultCode: "00",
      animalNumber: 76,
      animalLabel: "00",
      animalName: "Ballena",
    });
  });
});
