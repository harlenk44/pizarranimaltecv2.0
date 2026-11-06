import { describe, it, expect, vi } from "vitest";
import {
  parseClientLicenseName,
  formatClientLicenseName,
  isLotteryPermitted,
  ALL_AVAILABLE_LOTTERIES,
  serializarConfigCliente,
  deserializarConfigCliente,
  calcularGrillaTV,
  dividirEnVentanas,
  iniciarCarruselVentanas,
} from "@/lib/license-lotteries";

describe("license-lotteries utilities", () => {
  it("preserves backward compatibility when no delimiter || exists", () => {
    const existingNames = ["Mariana", "EXITO CARUPANO", "José barreto", "Administrador Maestro"];

    for (const name of existingNames) {
      const parsed = parseClientLicenseName(name);
      expect(parsed.cleanName).toBe(name);
      expect(parsed.allowedLotteries).toBeNull();
      expect(parsed.tarjetasPorPantalla).toBe(8);
      expect(parsed.tiempoTransicion).toBe(25);
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

  it("serializes and deserializes structured client configuration with full backward compatibility", () => {
    const packed = serializarConfigCliente("Agencia El Sol", {
      loterias: ["lotto-activo", "granjita"],
      tarjetasPorPantalla: 6,
      tiempoTransicion: 15,
    });
    expect(packed).toBe(
      'Agencia El Sol||{"loterias":["lotto-activo","granjita"],"tarjetasPorPantalla":6,"tiempoTransicion":15}',
    );

    const unpacked = deserializarConfigCliente(packed);
    expect(unpacked.nombre).toBe("Agencia El Sol");
    expect(unpacked.loterias).toEqual(["lotto-activo", "granjita"]);
    expect(unpacked.allowedLotteries).toEqual(["lotto-activo", "granjita"]);
    expect(unpacked.tarjetasPorPantalla).toBe(6);
    expect(unpacked.tiempoTransicion).toBe(15);

    // Malformed JSON fallback test
    const broken = deserializarConfigCliente("Agencia Rota||{invalid_json");
    expect(broken.nombre).toBe("Agencia Rota");
    expect(broken.loterias).toBe("TODAS");
    expect(broken.allowedLotteries).toBeNull();
    expect(broken.tarjetasPorPantalla).toBe(8);
    expect(broken.tiempoTransicion).toBe(25);
  });

  it("calculates TV grid styles and window chunks independently", () => {
    expect(calcularGrillaTV(2)).toEqual({
      gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
      gridTemplateRows: "repeat(1, minmax(0, 1fr))",
    });
    expect(calcularGrillaTV(4)).toEqual({
      gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
      gridTemplateRows: "repeat(2, minmax(0, 1fr))",
    });
    expect(calcularGrillaTV(6)).toEqual({
      gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
      gridTemplateRows: "repeat(2, minmax(0, 1fr))",
    });
    expect(calcularGrillaTV(8)).toEqual({
      gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
      gridTemplateRows: "repeat(2, minmax(0, 1fr))",
    });

    const items = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    expect(dividirEnVentanas(items, 4)).toEqual([
      [1, 2, 3, 4],
      [5, 6, 7, 8],
      [9, 10],
    ]);
    expect(dividirEnVentanas(items, "TODAS")).toEqual([[1, 2, 3, 4, 5, 6, 7, 8, 9, 10]]);
  });

  it("manages carousel timer safely and enforces 5s minimum threshold", () => {
    vi.useFakeTimers();
    const cb = vi.fn();
    const stop = iniciarCarruselVentanas(2, cb); // below 5s minimum -> clamped to 5s (5000ms)
    vi.advanceTimersByTime(4000);
    expect(cb).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1000);
    expect(cb).toHaveBeenCalledTimes(1);
    stop();
    vi.useRealTimers();
  });
});
