import { describe, it, expect } from "vitest";
import {
  parseClientLicenseName,
  formatClientLicenseName,
  isLotteryPermitted,
  getResponsiveBoardGridStyle,
  ALL_AVAILABLE_LOTTERIES,
} from "@/lib/license-lotteries";

describe("license-lotteries utilities", () => {
  it("preserves backward compatibility when no delimiter || exists", () => {
    const existingNames = ["Mariana", "EXITO CARUPANO", "José barreto", "Administrador Maestro"];

    for (const name of existingNames) {
      const parsed = parseClientLicenseName(name);
      expect(parsed.cleanName).toBe(name);
      expect(parsed.allowedLotteries).toBeNull();
      expect(parsed.cardsPerScreen).toBe(8);
      // All lotteries should be permitted
      expect(isLotteryPermitted("lotto-activo", parsed.allowedLotteries)).toBe(true);
      expect(isLotteryPermitted("triple-ricachona", parsed.allowedLotteries)).toBe(true);
      expect(isLotteryPermitted("guacharo", parsed.allowedLotteries)).toBe(true);
      expect(
        isLotteryPermitted("ca8a0400-0000-4000-8000-000000000006", parsed.allowedLotteries),
      ).toBe(true);
    }
  });

  it("extracts cleanName and allowedLotteries when packed with || JSON", () => {
    const raw = 'Agencia Mariana||["lotto-activo","granjita","triple-ricachona"]';
    const parsed = parseClientLicenseName(raw);

    expect(parsed.cleanName).toBe("Agencia Mariana");
    expect(parsed.allowedLotteries).toEqual(["lotto-activo", "granjita", "triple-ricachona"]);
    expect(parsed.cardsPerScreen).toBe(8);

    // Permitted lotteries
    expect(isLotteryPermitted("lotto-activo", parsed.allowedLotteries)).toBe(true);
    expect(isLotteryPermitted("granjita", parsed.allowedLotteries)).toBe(true);
    expect(isLotteryPermitted("la-granjita", parsed.allowedLotteries)).toBe(true);
    expect(isLotteryPermitted("triple-ricachona", parsed.allowedLotteries)).toBe(true);

    // Disallowed lotteries
    expect(isLotteryPermitted("guacharo", parsed.allowedLotteries)).toBe(false);
    expect(isLotteryPermitted("triple-zulia", parsed.allowedLotteries)).toBe(false);
    expect(isLotteryPermitted("selva-plus", parsed.allowedLotteries)).toBe(false);
  });

  it("handles UUID matching for animalito games", () => {
    const raw = 'Agencia Centro||["granjita","guacharo"]';
    const parsed = parseClientLicenseName(raw);

    // ca8a0400-0000-4000-8000-000000000006 is granjita
    expect(
      isLotteryPermitted("ca8a0400-0000-4000-8000-000000000006", parsed.allowedLotteries),
    ).toBe(true);
    // 01da9c54-392a-45e3-ab66-9a08befe7694 is guacharo
    expect(
      isLotteryPermitted("01da9c54-392a-45e3-ab66-9a08befe7694", parsed.allowedLotteries),
    ).toBe(true);
    // 7d21a00b-0dfa-4bdc-9edf-8115802df1d6 is lotto-activo (not included)
    expect(
      isLotteryPermitted("7d21a00b-0dfa-4bdc-9edf-8115802df1d6", parsed.allowedLotteries),
    ).toBe(false);
  });

  it("formats client name cleanly when all lotteries are selected and default 8 cards per screen", () => {
    const formatted = formatClientLicenseName(
      "Agencia Bolívar",
      ALL_AVAILABLE_LOTTERIES.map((l) => l.id),
      ALL_AVAILABLE_LOTTERIES.length,
    );
    expect(formatted).toBe("Agencia Bolívar");
  });

  it("formats client name with packed JSON when subset is selected", () => {
    const formatted = formatClientLicenseName(
      "Agencia Bolívar",
      ["lotto-activo", "triple-ricachona"],
      ALL_AVAILABLE_LOTTERIES.length,
    );
    expect(formatted).toBe('Agencia Bolívar||["lotto-activo","triple-ricachona"]');
  });

  it("packs and parses custom cardsPerScreen (e.g. 2 products per screen or TODAS)", () => {
    const packed2 = formatClientLicenseName(
      "Agencia Dos",
      ["lotto-activo", "granjita"],
      ALL_AVAILABLE_LOTTERIES.length,
      2,
    );
    const parsed2 = parseClientLicenseName(packed2);
    expect(parsed2.cleanName).toBe("Agencia Dos");
    expect(parsed2.allowedLotteries).toEqual(["lotto-activo", "granjita"]);
    expect(parsed2.cardsPerScreen).toBe(2);

    const packedAll = formatClientLicenseName(
      "Agencia Todas",
      ALL_AVAILABLE_LOTTERIES.map((l) => l.id),
      ALL_AVAILABLE_LOTTERIES.length,
      "TODAS",
    );
    const parsedAll = parseClientLicenseName(packedAll);
    expect(parsedAll.cleanName).toBe("Agencia Todas");
    expect(parsedAll.allowedLotteries).toBeNull();
    expect(parsedAll.cardsPerScreen).toBe("TODAS");
  });

  it("computes responsive grid columns/rows and proportional scaling for 2 vs 8 cards", () => {
    const grid2 = getResponsiveBoardGridStyle(2) as Record<string, unknown>;
    expect(grid2.gridTemplateColumns).toBe("repeat(2, minmax(0, 1fr))");
    expect(grid2.gridTemplateRows).toBe("repeat(1, minmax(0, 1fr))");
    expect(Number(grid2["--card-density-scale"])).toBeGreaterThan(1.5);
    expect(Number(grid2["--card-avatar-scale"])).toBeGreaterThan(1.8);

    const grid8 = getResponsiveBoardGridStyle(8) as Record<string, unknown>;
    expect(grid8.gridTemplateColumns).toBe("repeat(4, minmax(0, 1fr))");
    expect(grid8.gridTemplateRows).toBe("repeat(2, minmax(0, 1fr))");
    expect(grid8["--card-density-scale"]).toBe(1);
  });
});
