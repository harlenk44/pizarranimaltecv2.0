import { describe, expect, it } from "vitest";
import {
  hourTo24h,
  normalizeHour,
  parseTuazarResults,
  TuazarParseError,
} from "@/lib/tuazar-parser";

const PAGE = `<html><head><script>var t = "9:00 AM 1 Fake";</script></head><body>
<h2>Sorteos de animalitos en Venezuela del <b>Lunes, 26/10/2026</b></h2>
<h3>EL ARREJUNTAO</h3>
<div><span>10:00 AM</span><strong>38</strong><span>BÚFALO</span><img src="/a/38.png" alt="El Arrejuntao — 38 Búfalo"></div>
<div><span>1:00 PM</span> <span>5LEÓN</span><img alt="El Arrejuntao &mdash; 5 Le&oacute;n" src="x.png"></div>
<h3>Granja Millonaria - Granjazo</h3>
<div><span>9:30 AM</span><span>12CABALLO</span><img alt="Granja Millonaria - Granjazo — 12 Caballo" src="y.png"></div>
<h3>Lotto Activo</h3>
<div><span>08:00 AM</span><span>0DELFÍN</span></div>
<div><span>9:00 AM</span><span>Pendiente</span></div>
<div>12:00 AM 7 Perico</div>
</body></html>`;

describe("tuazar parser", () => {
  it("extracts game, hour, number and animal, and reads the page date", () => {
    const page = parseTuazarResults(PAGE);
    expect(page.date).toBe("2026-10-26");
    expect(page.results).toEqual([
      { game: "EL ARREJUNTAO", hour: "10:00 AM", number: "38", animal: "BÚFALO" },
      { game: "EL ARREJUNTAO", hour: "01:00 PM", number: "5", animal: "LEÓN" },
      { game: "GRANJA MILLONARIA - GRANJAZO", hour: "09:30 AM", number: "12", animal: "CABALLO" },
      { game: "LOTTO ACTIVO", hour: "08:00 AM", number: "0", animal: "DELFÍN" },
      { game: "LOTTO ACTIVO", hour: "12:00 AM", number: "7", animal: "PERICO" },
    ]);
  });

  it("ignores scripts, pending draws and counts text + image of one draw once", () => {
    const results = parseTuazarResults(PAGE).results;
    expect(results.some((r) => r.animal === "FAKE" || r.animal === "PENDIENTE")).toBe(false);
    expect(results.filter((r) => r.game === "EL ARREJUNTAO" && r.number === "38")).toHaveLength(1);
  });

  it("fails clearly when the structure has no results", () => {
    expect(() => parseTuazarResults("<html><body>Cargando…</body></html>")).toThrow(
      TuazarParseError,
    );
  });

  it("converts hours", () => {
    expect(normalizeHour("9:00 a.m.")).toBe("09:00 AM");
    expect(normalizeHour("25:00 AM")).toBeNull();
    expect(hourTo24h("09:00 AM")).toBe("09:00:00");
    expect(hourTo24h("12:30 PM")).toBe("12:30:00");
    expect(hourTo24h("12:00 AM")).toBe("00:00:00");
    expect(hourTo24h("07:15 PM")).toBe("19:15:00");
  });

  it("handles live TuAzar h1 maintitle date header and animal variants", () => {
    const liveTuazarSnippet = `<html><body>
      <h1 class="maintitle">Resultados de Animalitos<br><small>Sorteos de animalitos en Venezuela del <b>Lunes, 26/10/2026</b></small></h1>
      <h3 class="lc-title">EL GUACHARITO MILLONARIO</h3>
      <div><span>11:30 AM</span><span>44CHUGÜIRE</span><img alt="El Guacharito Millonario — 44 Chugüire" src="44.png"></div>
    </body></html>`;
    const page = parseTuazarResults(liveTuazarSnippet);
    expect(page.date).toBe("2026-10-26");
    expect(page.results).toHaveLength(1);
    expect(page.results[0]?.animal).toBe("CHUGÜIRE");
  });
});
