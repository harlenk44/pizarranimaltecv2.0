import { describe, it, expect } from "vitest";
import {
  parseClientLicenseName,
  formatClientLicenseName,
  isLotteryPermitted,
  ALL_AVAILABLE_LOTTERIES,
} from "@/lib/license-lotteries";

describe("license-lotteries utilities", () => {
  it("preserves backward compatibility when no delimiter || exists", () => {
    const existingNames = ["Mariana", "EXITO CARUPANO", "José barreto", "Administrador Maestro"];

    for (const name of existingNames) {
      const parsed = parseClientLicenseName(name);
      expect(parsed.cleanName).toBe(name);
      expect(parsed.allowedLotteries).toBeNull();
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

  it("formats client name cleanly when all lotteries are selected", () => {
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
});
