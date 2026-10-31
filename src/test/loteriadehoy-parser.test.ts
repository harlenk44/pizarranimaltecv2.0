import { describe, it, expect } from "vitest";
import {
  parseLoteriaDeHoyResults,
  matchGameClass,
  LoteriaDeHoyParseError,
} from "@/lib/loteriadehoy-parser";

const SAMPLE_HTML = `
<!DOCTYPE html>
<html>
<head>
    <title>Resultados de animalitos | LoteriaDeHoy</title>
</head>
<body>
    <form action="" method="post">
        <input type="text" name="fecha" id="datepicker" value="2026-10-30" class="form-control">
    </form>
    <section>
        <div class="title-center">
            <h3 class="lottoactivo">Lotto Activo</h3>
            <p class="text-muted">Resultados Lotto Activo el dia <strong>30 de octubre de 2026</strong>.</p>
        </div>
        <div class="row text-center js-con">
            <div class="col-sm-6 col-md-4 col-lg-16 pb-3">
                <div class="circle lottoactivo">
                    <img src="/dist/animals_img/Gallina_2.webp?v=1.0.0">
                </div>
                <div class="circle-legend">
                    <h4 class="mt-3 rojo">25 Gallina</h4>
                    <h5>08:00 AM</h5>
                </div>
            </div>
            <div class="col-sm-6 col-md-4 col-lg-16 pb-3">
                <div class="circle lottoactivo">
                    <img src="/dist/animals_img/Venado_2.webp?v=1.0.0">
                </div>
                <div class="circle-legend">
                    <h4 class="mt-3 rojo">34 Venado</h4>
                    <h5>09:00 AM</h5>
                </div>
            </div>
        </div>

        <div class="title-center">
            <h3 class="lagranjita">La Granjita</h3>
            <p class="text-muted">Resultados La Granjita el dia <strong>30 de octubre de 2026</strong>.</p>
        </div>
        <div class="row text-center js-con">
            <div class="col-sm-6 col-md-4 col-lg-16 pb-3">
                <div class="circle lagranjita">
                    <img src="/dist/animals_img/Ballena_36.webp?v=1.0.0">
                </div>
                <div class="circle-legend">
                    <h4 class="mt-3 rojo">00 Ballena</h4>
                    <h5>08:00 AM</h5>
                </div>
            </div>
        </div>
    </section>
</body>
</html>
`;

describe("loteriadehoy parser", () => {
  it("parses date, games and draws correctly from HTML", () => {
    const page = parseLoteriaDeHoyResults(SAMPLE_HTML);
    expect(page.date).toBe("2026-10-30");
    expect(page.results.length).toBe(3);

    const r0 = page.results[0];
    expect(r0.game).toBe("LOTTO ACTIVO");
    expect(r0.gameClass).toBe("lottoactivo");
    expect(r0.number).toBe("25");
    expect(r0.animal).toBe("GALLINA");
    expect(r0.hour).toBe("08:00 AM");
    expect(r0.drawTime).toBe("08:00:00");
    expect(r0.imageUrl).toBe("https://loteriadehoy.com/dist/animals_img/Gallina_2.webp?v=1.0.0");

    const r2 = page.results[2];
    expect(r2.game).toBe("LA GRANJITA");
    expect(r2.number).toBe("00");
    expect(r2.animal).toBe("BALLENA");
  });

  it("parses Monje Millonario extended draws including 08:05 and 10:05", () => {
    const monjeHtml = `
      <div class="title-center">
        <h3 class="lottoactivo2(monjemillonario)">Lotto Activo 2 (Monje Millonario)</h3>
      </div>
      <div class="row text-center js-con">
        <div class="circle lottoactivo2(monjemillonario)">
          <img src="/dist/animals_img/Grillo_37.webp">
        </div>
        <div class="circle-legend">
          <h4 class="mt-3 rojo">54 Grillo</h4>
          <h5>08:05 AM</h5>
        </div>
        <div class="circle lottoactivo2(monjemillonario)">
          <img src="/dist/animals_img/Hipopotamo_37.webp">
        </div>
        <div class="circle-legend">
          <h4 class="mt-3 rojo">73 Hipopotamo</h4>
          <h5>10:05 AM</h5>
        </div>
      </div>
    `;
    const page = parseLoteriaDeHoyResults(monjeHtml);
    expect(page.results.length).toBe(2);
    expect(page.results[0]?.drawTime).toBe("08:05:00");
    expect(page.results[0]?.number).toBe("54");
    expect(page.results[0]?.animal).toBe("GRILLO");
    expect(page.results[1]?.drawTime).toBe("10:05:00");
    expect(page.results[1]?.number).toBe("73");
    expect(page.results[1]?.animal).toBe("HIPOPOTAMO");
  });

  it("parses cards globally even when header markup uses modified container classes", () => {
    const customHtml = `
      <div class="title-center mb-4 text-center">
        <h3 class="guacharoactivo">Guacharo Activo</h3>
      </div>
      <div class="circle guacharoactivo">
        <img src="/dist/animals_img/Tigre_10.webp">
      </div>
      <div class="circle-legend">
        <h4 class="mt-3">10 Tigre</h4>
        <h5>11:00 AM</h5>
      </div>
    `;
    const page = parseLoteriaDeHoyResults(customHtml);
    expect(page.results.length).toBe(1);
    expect(page.results[0]?.gameClass).toBe("guacharoactivo");
    expect(page.results[0]?.animal).toBe("TIGRE");
    expect(page.results[0]?.number).toBe("10");
  });

  it("correctly matches game classes with matchGameClass", () => {
    expect(matchGameClass("lottoactivo", "lottoactivo")).toBe(true);
    expect(matchGameClass("lottoactivo2(monjemillonario)", "lottoactivo2(monjemillonario)")).toBe(
      true,
    );
    expect(matchGameClass("monjemillonario", "lottoactivo2(monjemillonario)")).toBe(true);
    expect(matchGameClass("guacharoactivo", "guacharoactivo")).toBe(true);
    expect(matchGameClass("elguacharitomillonario", "elguacharitomillonario")).toBe(true);
  });

  it("throws LoteriaDeHoyParseError on empty or invalid HTML", () => {
    expect(() => parseLoteriaDeHoyResults("")).toThrow(LoteriaDeHoyParseError);
    expect(() => parseLoteriaDeHoyResults("<html><body>Sin sorteos</body></html>")).toThrow(
      LoteriaDeHoyParseError,
    );
  });
});
