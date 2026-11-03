import { normalizeHour, hourTo24h } from "@/lib/tuazar-parser";
import { formatZodiacSign, type TripleResult } from "@/lib/triples";

function stripAccentsAndUpper(raw: string): string {
  return raw
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/<[^>]+>/g, "")
    .toUpperCase()
    .replace(/\s+/g, " ")
    .trim();
}

function isValidTripleDigits(val?: string | null): boolean {
  if (!val) return false;
  const clean = val.trim();
  if (!clean || clean === "-" || clean === "—") return false;
  return /^\d{2,4}$/.test(clean);
}

function isValidSignText(val?: string | null): boolean {
  if (!val) return false;
  const clean = val.trim();
  if (!clean || clean === "-" || clean === "—") return false;
  return /^[A-Za-zÁÉÍÓÚáéíóú]{2,12}$/.test(clean);
}

/**
 * Parses TuAzar's https://tuazar.com/loteria/resultados/ HTML for the 8 Triples lotteries.
 */
export function parseTuazarTriplesHtml(html: string, drawDate: string): TripleResult[] {
  const byKey = new Map<string, TripleResult>();

  const upsert = (
    gameId: string,
    drawTime: string,
    patch: Partial<Pick<TripleResult, "triple_a" | "triple_b" | "triple_c" | "zodiac_sign">>,
  ) => {
    const key = `${gameId}|${drawDate}|${drawTime}`;
    const existing = byKey.get(key) ?? {
      id: `triple-${gameId}-${drawDate}-${drawTime}`,
      game_id: gameId,
      game_slug: gameId,
      draw_date: drawDate,
      draw_time: drawTime,
      triple_a: "",
      triple_b: null,
      triple_c: null,
      zodiac_sign: null,
      source: "automatic" as const,
      created_at: new Date().toISOString(),
    };

    if (patch.triple_a && isValidTripleDigits(patch.triple_a)) {
      existing.triple_a = patch.triple_a.trim();
    }
    if (patch.triple_b && isValidTripleDigits(patch.triple_b)) {
      existing.triple_b = patch.triple_b.trim();
    }
    if (patch.triple_c && isValidTripleDigits(patch.triple_c)) {
      existing.triple_c = patch.triple_c.trim();
    }
    if (patch.zodiac_sign && isValidSignText(patch.zodiac_sign)) {
      existing.zodiac_sign = formatZodiacSign(patch.zodiac_sign);
    }

    byKey.set(key, existing);
  };

  const sections = html.split(/<div\s+class=["']lc-section["'][^>]*>/i).slice(1);
  for (const sec of sections) {
    const titleMatch = /<h3\s+class=["']lc-title["'][^>]*>([\s\S]*?)<\/h3>/i.exec(sec);
    if (!titleMatch) continue;
    const normTitle = stripAccentsAndUpper(titleMatch[1] ?? "");

    let targetGameId: string | null = null;
    let mode: "AB" | "SINGLE" | "CSIGN" = "AB";

    if (normTitle === "EL ARREJUNTAO" || normTitle === "ARREJUNTAO") {
      targetGameId = "arrejuntao";
      mode = "AB";
    } else if (normTitle === "TRIPLE + SIGNO") {
      targetGameId = "arrejuntao";
      mode = "CSIGN";
    } else if (normTitle.includes("TRIPLE FACIL")) {
      targetGameId = "triple-facil";
      mode = "SINGLE";
    } else if (normTitle.includes("TRIO ACTIVO")) {
      targetGameId = "trio-activo";
      mode = "SINGLE";
    } else if (normTitle === "CHANCE EN LINEA" || normTitle === "TRIPLE CHANCE") {
      targetGameId = "triple-chance";
      mode = "AB";
    } else if (normTitle === "CHANCE ASTRAL") {
      targetGameId = "triple-chance";
      mode = "CSIGN";
    } else if (normTitle === "TRIPLE ZULIA") {
      targetGameId = "triple-zulia";
      mode = "AB";
    } else if (normTitle === "ZODIACO DEL ZULIA") {
      targetGameId = "triple-zulia";
      mode = "CSIGN";
    } else if (normTitle === "TRIPLE CALIENTE") {
      targetGameId = "triple-caliente";
      mode = "AB";
    } else if (normTitle === "SIGNO CALIENTE") {
      targetGameId = "triple-caliente";
      mode = "CSIGN";
    } else if (normTitle === "TRIPLE CARACAS") {
      targetGameId = "triple-caracas";
      mode = "AB";
    } else if (normTitle.includes("CARACAS") && normTitle.includes("ZODIAC")) {
      targetGameId = "triple-caracas";
      mode = "CSIGN";
    } else if (normTitle.includes("TRIPLE PANTERA") || normTitle === "PANTERA") {
      targetGameId = "triple-pantera";
      mode = "AB";
    }

    if (!targetGameId) continue;

    const rowBlocks = sec.split(/<div\s+class=["']lc-row["']/i).slice(1);
    for (const rb of rowBlocks) {
      const cells = [
        ...rb.matchAll(/<div\s+class=["']lc-cell[^"']*["'][^>]*>([\s\S]*?)<\/div>/gi),
      ].map((m) => (m[1] ?? "").replace(/<[^>]+>/g, "").trim());
      if (cells.length < 2) continue;

      const normHr = normalizeHour(cells[0] ?? "");
      const rawTime24 = normHr ? hourTo24h(normHr) : null;
      const time24 = rawTime24 ? rawTime24.slice(0, 5) : null;
      if (!time24) continue;

      if (mode === "SINGLE") {
        if (isValidTripleDigits(cells[1])) {
          upsert(targetGameId, time24, { triple_a: cells[1] });
        }
      } else if (mode === "AB") {
        if (isValidTripleDigits(cells[1])) {
          upsert(targetGameId, time24, {
            triple_a: cells[1],
            triple_b: isValidTripleDigits(cells[2]) ? cells[2] : undefined,
          });
        }
      } else if (mode === "CSIGN") {
        if (isValidTripleDigits(cells[1]) || isValidSignText(cells[2])) {
          upsert(targetGameId, time24, {
            triple_c: isValidTripleDigits(cells[1]) ? cells[1] : undefined,
            zodiac_sign: isValidSignText(cells[2]) ? cells[2] : undefined,
          });
        }
      }
    }
  }

  return [...byKey.values()].filter((r) => isValidTripleDigits(r.triple_a));
}

/**
 * Parses LoteriaDeHoy's https://loteriadehoy.com/loterias/resultados/ HTML for the 8 Triples lotteries.
 */
export function parseLoteriaDeHoyTriplesHtml(html: string, drawDate: string): TripleResult[] {
  const results: TripleResult[] = [];
  const tables = [
    ...html.matchAll(/<table[^>]*class=["'][^"']*resultados[^"']*["'][\s\S]*?<\/table>/gi),
  ];

  for (const tMatch of tables) {
    const tableHtml = tMatch[0] ?? "";
    const thMatch = /<th[^>]*>([\s\S]*?)<\/th>/i.exec(tableHtml);
    if (!thMatch) continue;
    const normTitle = stripAccentsAndUpper(thMatch[1] ?? "");

    let targetGameId: string | null = null;
    if (normTitle.includes("TRIPLE FACIL")) {
      targetGameId = "triple-facil";
    } else if (normTitle === "TRIO ACTIVO" || normTitle.includes("TRIO ACTIVO")) {
      targetGameId = "trio-activo";
    } else if (normTitle.includes("TRIPLE CHANCE")) {
      targetGameId = "triple-chance";
    } else if (normTitle.includes("TRIPLE ZULIA")) {
      targetGameId = "triple-zulia";
    } else if (normTitle.includes("TRIPLE CALIENTE")) {
      targetGameId = "triple-caliente";
    } else if (normTitle.includes("TRIPLE CARACAS")) {
      targetGameId = "triple-caracas";
    } else if (normTitle.includes("TRIPLE PANTERA") || normTitle === "PANTERA") {
      targetGameId = "triple-pantera";
    } else if (normTitle.includes("ARREJUNTAO")) {
      targetGameId = "arrejuntao";
    }

    if (!targetGameId) continue;

    const trMatches = [...tableHtml.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)];
    for (const tr of trMatches) {
      const tds = [...(tr[1] ?? "").matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((c) =>
        (c[1] ?? "").replace(/<[^>]+>/g, "").trim(),
      );
      if (tds.length < 2) continue;

      const normHr = normalizeHour(tds[0] ?? "");
      const rawTime24 = normHr ? hourTo24h(normHr) : null;
      const time24 = rawTime24 ? rawTime24.slice(0, 5) : null;
      if (!time24) continue;

      const col1 = tds[1] ?? "";
      if (!isValidTripleDigits(col1)) continue;

      const col2 = tds[2] ?? "";
      const col3 = tds[3] ?? "";
      const col4 = tds[4] ?? "";

      const tripleA = col1;
      const tripleB = isValidTripleDigits(col2) ? col2 : null;
      let tripleC: string | null = null;
      let zodiacSign: string | null = null;

      if (isValidTripleDigits(col3)) {
        tripleC = col3;
        if (isValidSignText(col4)) {
          zodiacSign = formatZodiacSign(col4);
        }
      } else if (isValidSignText(col3)) {
        zodiacSign = formatZodiacSign(col3);
      }

      results.push({
        id: `triple-${targetGameId}-${drawDate}-${time24}`,
        game_id: targetGameId,
        game_slug: targetGameId,
        draw_date: drawDate,
        draw_time: time24,
        triple_a: tripleA,
        triple_b: tripleB,
        triple_c: tripleC,
        zodiac_sign: zodiacSign,
        source: "automatic",
        created_at: new Date().toISOString(),
      });
    }
  }

  return results;
}

/**
 * Merges automatic results from LoteriaDeHoy and TuAzar while strictly preserving manual edits.
 */
export function mergeTriplesResults(
  existing: TripleResult[],
  fromLoteriaDeHoy: TripleResult[],
  fromTuAzar: TripleResult[],
): { merged: TripleResult[]; newlyAdded: TripleResult[] } {
  const byKey = new Map<string, TripleResult>();
  const prevSnapshot = new Map<string, string>();

  for (const item of existing) {
    const cleanTime = item.draw_time.slice(0, 5);
    const key = `${item.game_id}|${item.draw_date}|${cleanTime}`;
    byKey.set(key, { ...item, draw_time: cleanTime });
    prevSnapshot.set(
      key,
      `${item.triple_a}|${item.triple_b ?? ""}|${item.triple_c ?? ""}|${item.zodiac_sign ?? ""}`,
    );
  }

  const applyIncoming = (incomingList: TripleResult[]) => {
    for (const inc of incomingList) {
      if (!isValidTripleDigits(inc.triple_a)) continue;
      const cleanTime = inc.draw_time.slice(0, 5);
      const key = `${inc.game_id}|${inc.draw_date}|${cleanTime}`;
      const curr = byKey.get(key);

      // Never overwrite manual corrections
      if (curr && curr.source === "manual") {
        continue;
      }

      if (!curr) {
        byKey.set(key, { ...inc });
      } else {
        byKey.set(key, {
          ...curr,
          triple_a: inc.triple_a || curr.triple_a,
          triple_b: inc.triple_b ?? curr.triple_b ?? null,
          triple_c: inc.triple_c ?? curr.triple_c ?? null,
          zodiac_sign: inc.zodiac_sign ?? curr.zodiac_sign ?? null,
        });
      }
    }
  };

  // Apply TuAzar first, then LoteriaDeHoy (or vice-versa; non-null fields enrich each other)
  applyIncoming(fromTuAzar);
  applyIncoming(fromLoteriaDeHoy);

  const merged = [...byKey.values()].sort((a, b) => a.draw_time.localeCompare(b.draw_time));
  const newlyAdded: TripleResult[] = [];

  for (const item of merged) {
    const key = `${item.game_id}|${item.draw_date}|${item.draw_time}`;
    const sig = `${item.triple_a}|${item.triple_b ?? ""}|${item.triple_c ?? ""}|${item.zodiac_sign ?? ""}`;
    if (!prevSnapshot.has(key) || prevSnapshot.get(key) !== sig) {
      newlyAdded.push(item);
    }
  }

  return { merged, newlyAdded };
}
