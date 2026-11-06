import { describe, it, expect } from "vitest";
import {
  parseTuazarTriplesHtml,
  parseLoteriaDeHoyTriplesHtml,
  mergeTriplesResults,
} from "@/lib/triples-parser";
import { TRIPLE_GAMES, formatTripleSummary, buildTripleAlertItem } from "@/lib/triples";

describe("triples-parser", () => {
  const drawDate = "2026-04-20";

  it("defines the configured Triples lotteries including Triple Pantera and Terminal Pantera", () => {
    expect(TRIPLE_GAMES.map((g) => g.slug)).toEqual([
      "triple-facil",
      "trio-activo",
      "triple-chance",
      "triple-zulia",
      "triple-caliente",
      "triple-caracas",
      "triple-ricachona",
      "arrejuntao",
      "triple-pantera",
      "terminal-pantera",
    ]);
  });

  it("parses TuAzar compound and single sections accurately", () => {
    const html = `
      <div class="lc-section">
        <h3 class="lc-title">EL ARREJUNTAO</h3>
        <div class="lc-row">
          <div class="lc-cell">12:50 pm</div>
          <div class="lc-cell">412</div>
          <div class="lc-cell">809</div>
        </div>
      </div>
      <div class="lc-section">
        <h3 class="lc-title">TRIPLE + SIGNO</h3>
        <div class="lc-row">
          <div class="lc-cell">12:50 pm</div>
          <div class="lc-cell">775</div>
          <div class="lc-cell">LEO</div>
        </div>
      </div>
      <div class="lc-section">
        <h3 class="lc-title">TRIPLE FÁCIL</h3>
        <div class="lc-row">
          <div class="lc-cell">01:30 pm</div>
          <div class="lc-cell">523</div>
        </div>
      </div>
      <div class="lc-section">
        <h3 class="lc-title">TRIO ACTIVO EL PATRONUS</h3>
        <div class="lc-row">
          <div class="lc-cell">09:00 am</div>
          <div class="lc-cell">901</div>
        </div>
      </div>
    `;

    const parsed = parseTuazarTriplesHtml(html, drawDate);
    expect(parsed).toHaveLength(3);

    const arrejuntao = parsed.find((r) => r.game_id === "arrejuntao");
    expect(arrejuntao).toMatchObject({
      game_id: "arrejuntao",
      draw_time: "12:50",
      triple_a: "412",
      triple_b: "809",
      triple_c: "775",
      zodiac_sign: "LEO",
    });

    const facil = parsed.find((r) => r.game_id === "triple-facil");
    expect(facil).toMatchObject({
      game_id: "triple-facil",
      draw_time: "13:30",
      triple_a: "523",
    });

    const trio = parsed.find((r) => r.game_id === "trio-activo");
    expect(trio).toMatchObject({
      game_id: "trio-activo",
      draw_time: "09:00",
      triple_a: "901",
    });
  });

  it("parses LoteriaDeHoy tables and merges with fallback without overwriting manual results", () => {
    const ldhHtml = `
      <table class="resultados">
        <thead><tr><th colspan="5">Triple Chance</th></tr></thead>
        <tbody>
          <tr>
            <td>01:00 PM</td>
            <td>114</td>
            <td>632</td>
            <td>980</td>
            <td>ARI</td>
          </tr>
        </tbody>
      </table>
      <table class="resultados">
        <thead><tr><th colspan="5">La Ricachona</th></tr></thead>
        <tbody>
          <tr>
            <td>10:00 AM</td>
            <td>305</td>
            <td>741</td>
            <td>888</td>
            <td>TAU</td>
          </tr>
        </tbody>
      </table>
    `;

    const ldhParsed = parseLoteriaDeHoyTriplesHtml(ldhHtml, drawDate);
    expect(ldhParsed).toHaveLength(2);

    const manualExisting = [
      {
        id: "triple-triple-chance-2026-04-20-13:00",
        game_id: "triple-chance",
        game_slug: "triple-chance",
        draw_date: drawDate,
        draw_time: "13:00",
        triple_a: "999",
        triple_b: "888",
        triple_c: "777",
        zodiac_sign: "VIR",
        source: "manual" as const,
      },
    ];

    const { merged, newlyAdded } = mergeTriplesResults(manualExisting, ldhParsed, []);
    expect(merged).toHaveLength(2);
    // Manual result for Triple Chance 13:00 must be preserved
    const chance = merged.find((r) => r.game_id === "triple-chance");
    expect(chance?.triple_a).toBe("999");
    expect(chance?.source).toBe("manual");

    // Ricachona was newly added
    expect(newlyAdded).toHaveLength(1);
    expect(newlyAdded[0]?.game_id).toBe("triple-ricachona");
    expect(newlyAdded[0]?.zodiac_sign).toBe("TAU");

    const summary = formatTripleSummary(newlyAdded[0]!);
    expect(summary).toContain("A: 305");
    expect(summary).toContain("Tauro");

    const alertItem = buildTripleAlertItem(newlyAdded[0]!);
    expect(alertItem.gameName).toBe("Triple Ricachona");
    expect(alertItem.animalNumber).toBe(305);
  });
});
