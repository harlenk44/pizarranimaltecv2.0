import { describe, it, expect } from "vitest";
import {
  parseTuazarTriplesHtml,
  parseLoteriaDeHoyTriplesHtml,
  mergeTriplesResults,
} from "@/lib/triples-parser";
import {
  TRIPLE_GAMES,
  formatTripleSummary,
  buildTripleAlertItem,
  mergeTripleResultsPreserveToday,
} from "@/lib/triples";

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

  it("preserves today's loaded triples when an empty or partial payload arrives and merges HH:MM with HH:MM:00 cleanly", () => {
    const existing = [
      {
        id: "t1",
        game_id: "triple-zulia",
        game_slug: "triple-zulia",
        draw_date: drawDate,
        draw_time: "12:45",
        triple_a: "412",
        triple_b: null,
        triple_c: null,
        zodiac_sign: null,
        source: "automatic" as const,
        created_at: "2026-04-20T16:45:00Z",
      },
      {
        id: "t2",
        game_id: "triple-pantera",
        game_slug: "triple-pantera",
        draw_date: drawDate,
        draw_time: "09:00:00",
        triple_a: "777",
        triple_b: null,
        triple_c: null,
        zodiac_sign: null,
        source: "manual" as const,
        created_at: "2026-04-20T13:00:00Z",
      },
    ];

    // 1. Empty payload from a cold serverless isolate must NOT wipe out today's triples
    const afterEmpty = mergeTripleResultsPreserveToday(existing, [], drawDate);
    expect(afterEmpty).toHaveLength(2);
    expect(afterEmpty.find((r) => r.game_id === "triple-zulia")?.draw_time).toBe("12:45:00");

    // 2. Partial enrichment with different draw_time format ("12:45:00" vs "12:45") merges without duplicates and protects manual
    const incoming = [
      {
        id: "t1-alt",
        game_id: "triple-zulia",
        game_slug: "triple-zulia",
        draw_date: drawDate,
        draw_time: "12:45:00",
        triple_a: "412",
        triple_b: "809",
        triple_c: "555",
        zodiac_sign: "LEO",
        source: "automatic" as const,
        created_at: "2026-04-20T16:46:00Z",
      },
      {
        id: "t2-auto",
        game_id: "triple-pantera",
        game_slug: "triple-pantera",
        draw_date: drawDate,
        draw_time: "09:00",
        triple_a: "123",
        source: "automatic" as const,
        created_at: "2026-04-20T13:05:00Z",
      },
    ];

    const merged = mergeTripleResultsPreserveToday(afterEmpty, incoming, drawDate);
    expect(merged).toHaveLength(2);

    const zulia = merged.find((r) => r.game_id === "triple-zulia");
    expect(zulia?.triple_a).toBe("412");
    expect(zulia?.triple_b).toBe("809");
    expect(zulia?.triple_c).toBe("555");
    expect(zulia?.zodiac_sign).toBe("LEO");

    const pantera = merged.find((r) => r.game_id === "triple-pantera");
    expect(pantera?.triple_a).toBe("777");
    expect(pantera?.source).toBe("manual");

    // 3. Explicit admin deletion removes the item cleanly
    const afterDelete = mergeTripleResultsPreserveToday(merged, [], drawDate, ["t1"]);
    expect(afterDelete).toHaveLength(1);
    expect(afterDelete[0]?.game_id).toBe("triple-pantera");
  });

  it("parses official El Arrejuntao JSON endpoint payload with normalized schedule times and results", async () => {
    const {
      ARREJUNTAO_API_BASE_URL,
      ARREJUNTAO_BROWSER_HEADERS,
      ARREJUNTAO_FETCH_TIMEOUT_MS,
      buildArrejuntaoResultsUrl,
      parseArrejuntaoResultsJson,
    } = await import("@/lib/arrejuntao-provider.server");

    expect(ARREJUNTAO_API_BASE_URL).toBe(
      "https://backend.serviciosintegradostriple7.com/api/v1/products/el-arrejuntao/results/",
    );
    expect(buildArrejuntaoResultsUrl("2026-11-21")).toBe(
      "https://backend.serviciosintegradostriple7.com/api/v1/products/el-arrejuntao/results/?date=2026-11-21",
    );
    expect(ARREJUNTAO_FETCH_TIMEOUT_MS).toBe(5_000);
    expect(ARREJUNTAO_BROWSER_HEADERS.Accept).toBe("application/json");
    expect(ARREJUNTAO_BROWSER_HEADERS["User-Agent"]).toContain("Mozilla/5.0");

    const samplePayload = {
      id: "e30ad531-3b25-40fb-bb07-b7ec46f98d54",
      name: "El Arrejuntao",
      slug: "el-arrejuntao",
      logo: "https://nyc3.digitaloceanspaces.com/triple7-media/products/logos/el-arrejuntao-logo.png",
      draws: [
        {
          id: "05a83214-23e5-4f09-bffe-61098ad83af4",
          draw_date: "2026-11-21",
          draw_time: "10:00 AM",
          is_published: true,
          results: [
            {
              game: { slug: "animalito", name: "Animalito" },
              result_value: "65",
              symbol: {
                value: "65",
                name: "Araña",
                image:
                  "https://nyc3.digitaloceanspaces.com/triple7-media/game_symbols/animalitos/el-arrejuntao/65.png",
              },
            },
            {
              game: { slug: "triple-a", name: "Triple A" },
              result_value: "852",
              symbol: null,
            },
            {
              game: { slug: "triple-b", name: "Triple B" },
              result_value: "028",
              symbol: null,
            },
            {
              game: { slug: "triple-signo", name: "Triple + Signo" },
              result_value: "458 ARI",
              symbol: null,
            },
          ],
        },
        {
          id: "d32ab589-8ca9-49eb-af29-5687b59a7228",
          draw_date: "2026-11-21",
          draw_time: "01:00 PM",
          is_published: true,
          results: [
            {
              game: { slug: "animalito", name: "Animalito" },
              result_value: "00",
              symbol: {
                value: "00",
                name: "Ballena",
                image:
                  "https://nyc3.digitaloceanspaces.com/triple7-media/game_symbols/animalitos/el-arrejuntao/00.png",
              },
            },
            {
              game: { slug: "triple-a", name: "Triple A" },
              result_value: "757",
              symbol: null,
            },
            {
              game: { slug: "triple-b", name: "Triple B" },
              result_value: "339",
              symbol: null,
            },
            {
              game: { slug: "triple-signo", name: "Triple + Signo" },
              result_value: "178 VIR",
              symbol: null,
            },
          ],
        },
      ],
    };

    const parsed = parseArrejuntaoResultsJson(samplePayload, "2026-11-21");
    expect(parsed.draws).toHaveLength(2);
    expect(parsed.draws[0]).toMatchObject({
      drawDate: "2026-11-21",
      drawTime: "10:00:00",
      drawTimeShort: "10:00",
      animalNumber: 65,
      animalName: "Araña",
      tripleA: "852",
      tripleB: "028",
      tripleC: "458",
      zodiacSign: "ARI",
    });
    expect(parsed.draws[1]).toMatchObject({
      drawDate: "2026-11-21",
      drawTime: "13:00:00",
      drawTimeShort: "13:00",
      animalNumber: 100,
      animalLabel: "00",
      animalName: "Ballena",
      tripleA: "757",
      tripleB: "339",
      tripleC: "178",
      zodiacSign: "VIR",
    });

    expect(parsed.tripleResults).toHaveLength(2);
    expect(parsed.tripleResults[0]).toMatchObject({
      game_id: "arrejuntao",
      game_slug: "arrejuntao",
      draw_date: "2026-11-21",
      draw_time: "10:00",
      triple_a: "852",
      triple_b: "028",
      triple_c: "458",
      zodiac_sign: "ARI",
    });
  });
});
