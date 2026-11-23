import { describe, expect, it } from "vitest";
import {
  buildLottoActivoRequestBody,
  LOTTO_ACTIVO_FETCH_TIMEOUT_MS,
  LOTTO_ACTIVO_OPTION_TOKEN,
  LOTTO_ACTIVO_PROCESS_URL,
  LOTTO_ACTIVO_REQUIRED_HEADERS,
  normalizeLottoActivoTime,
  parseLottoActivoResultsJson,
} from "@/lib/lotto-activo-provider.server";

describe("Lotto Activo Official Direct POST Provider", () => {
  it("configures the exact POST endpoint, headers, URLSearchParams body, and 4-5s timeout", () => {
    expect(LOTTO_ACTIVO_PROCESS_URL).toBe("https://www.lottoactivo.com/core/process.php");
    expect(LOTTO_ACTIVO_REQUIRED_HEADERS).toEqual({
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
      Origin: "https://www.lottoactivo.com",
      Referer: "https://www.lottoactivo.com/lotto_activo/",
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    });

    const body = buildLottoActivoRequestBody("2026-11-22", LOTTO_ACTIVO_OPTION_TOKEN);
    const params = new URLSearchParams(body);
    expect(params.get("option")).toBe(LOTTO_ACTIVO_OPTION_TOKEN);
    expect(params.get("loteria")).toBe("lotto_activo");
    expect(params.get("fecha")).toBe("2026-11-22");

    expect(LOTTO_ACTIVO_FETCH_TIMEOUT_MS).toBeGreaterThanOrEqual(4000);
    expect(LOTTO_ACTIVO_FETCH_TIMEOUT_MS).toBeLessThanOrEqual(5000);
  });

  it("normalizes time_schedule ('08:00:00') and time_s ('08:00 AM', '01:00 PM')", () => {
    expect(normalizeLottoActivoTime("08:00:00", "08:00 AM")).toEqual({
      full: "08:00:00",
      short: "08:00",
    });
    expect(normalizeLottoActivoTime(undefined, "01:00 PM")).toEqual({
      full: "13:00:00",
      short: "13:00",
    });
  });

  it("extracts datos when status === true and maps time_schedule/time_s, number_animal, and name_animal (including 0 Delfín and 00=37 Ballena)", () => {
    const sampleResponse = {
      msg: "Datos recopilados",
      status: true,
      datos: [
        {
          date_result: "2026-11-22",
          id_game: "1",
          name_animal: "Cochino",
          color_animal: "negro",
          name_game: "Lotto Activo",
          number_animal: "20",
          special_result: "0",
          image_animal: "Cochino_1.webp",
          link_game: "lotto_activo",
          time_s: "08:00 AM",
          time_schedule: "08:00:00",
        },
        {
          date_result: "2026-11-22",
          id_game: "1",
          name_animal: "Delfin",
          number_animal: "0",
          time_s: "09:00 AM",
          time_schedule: "09:00:00",
        },
        {
          date_result: "2026-11-22",
          id_game: "1",
          name_animal: "Ballena",
          number_animal: "00",
          time_s: "01:00 PM",
        },
      ],
    };

    const parsed = parseLottoActivoResultsJson(sampleResponse, "2026-11-22");
    expect(parsed.date).toBe("2026-11-22");
    expect(parsed.draws).toHaveLength(3);

    expect(parsed.draws[0]).toMatchObject({
      drawDate: "2026-11-22",
      drawTime: "08:00:00",
      drawTimeShort: "08:00",
      rawNumberAnimal: "20",
      animalNumber: 20,
      animalLabel: "20",
      animalName: "Cochino",
    });

    expect(parsed.draws[1]).toMatchObject({
      drawDate: "2026-11-22",
      drawTime: "09:00:00",
      drawTimeShort: "09:00",
      rawNumberAnimal: "0",
      animalNumber: 0,
      animalLabel: "0",
      animalName: "Delfín",
    });

    expect(parsed.draws[2]).toMatchObject({
      drawDate: "2026-11-22",
      drawTime: "13:00:00",
      drawTimeShort: "13:00",
      rawNumberAnimal: "00",
      animalNumber: 37,
      animalLabel: "00",
      animalName: "Ballena",
    });

    // Returns empty draws when status !== true
    expect(
      parseLottoActivoResultsJson({ status: false, msg: "Error Controller" }, "2026-11-22").draws,
    ).toHaveLength(0);
  });
});
