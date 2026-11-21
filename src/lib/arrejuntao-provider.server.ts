import type { Result } from "@/lib/types";
import { formatZodiacSign, type TripleResult } from "@/lib/triples";
import { normalizeHour, hourTo24h } from "@/lib/tuazar-parser";
import { normalizeScheduleTime } from "@/lib/game-schedules";
import { parseCanonicalAnimalNumber, resolveCanonicalAnimal } from "@/lib/official-animals";
import type { AutomaticDraw, ResultsProvider, SyncGame } from "@/lib/result-sync";
import { createRealSupabaseAdminClient } from "@/integrations/supabase/client.server";
import { lotteryDate } from "@/lib/lottery-date";

export const ARREJUNTAO_API_BASE_URL =
  "https://backend.serviciosintegradostriple7.com/api/v1/products/el-arrejuntao/results/";

export const ARREJUNTAO_FETCH_TIMEOUT_MS = 5_000;
const SNAPSHOT_TTL_MS = 15_000;

export const ARREJUNTAO_BROWSER_HEADERS: Record<string, string> = {
  Accept: "application/json",
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36",
  "Accept-Language": "es-VE,es;q=0.9,en;q=0.8",
  "Cache-Control": "no-cache",
};

export interface ArrejuntaoNormalizedDraw {
  drawDate: string;
  /** 24h time in HH:MM:00 format for Supabase `results` table */
  drawTime: string;
  /** 24h time in HH:MM format for `TripleResult` */
  drawTimeShort: string;
  animalNumber: number;
  animalLabel: string;
  animalName: string;
  animalImageUrl: string | null;
  tripleA: string;
  tripleB: string | null;
  tripleC: string | null;
  zodiacSign: string | null;
}

export interface ArrejuntaoParsedPayload {
  date: string;
  logoUrl: string | null;
  draws: ArrejuntaoNormalizedDraw[];
  tripleResults: TripleResult[];
}

interface CachedArrejuntaoFetch {
  at: number;
  date: string;
  promise: Promise<ArrejuntaoParsedPayload>;
}

let arrejuntaoCache: CachedArrejuntaoFetch | null = null;

export function buildArrejuntaoResultsUrl(currentDate: string): string {
  const cleanDate = (currentDate || lotteryDate()).trim();
  return `${ARREJUNTAO_API_BASE_URL}?date=${encodeURIComponent(cleanDate)}`;
}

/**
 * Normalizes any time representation ("10:00 AM", "01:00 PM", "13:00", "13:00:00")
 * into `{ full: "HH:MM:00", short: "HH:MM" }`.
 */
export function normalizeArrejuntaoTime(rawTime?: unknown): { full: string; short: string } | null {
  if (typeof rawTime !== "string" || !rawTime.trim()) return null;
  const trimmed = rawTime.trim();

  // 1. Try 12h AM/PM or flexible hour parser first (e.g. "10:00 AM", "01:00 PM")
  const normHr = normalizeHour(trimmed);
  if (normHr) {
    const h24 = hourTo24h(normHr);
    if (h24) {
      const short = h24.slice(0, 5);
      return { full: `${short}:00`, short };
    }
  }

  // 2. Try 24h schedule normalizer (e.g. "13:00", "13:00:00")
  const sched = normalizeScheduleTime(trimmed);
  if (sched) {
    return { full: `${sched}:00`, short: sched };
  }

  return null;
}

function parseTripleSignoValue(raw?: string | null): {
  tripleC: string | null;
  zodiacSign: string | null;
} {
  if (!raw || typeof raw !== "string") {
    return { tripleC: null, zodiacSign: null };
  }
  const clean = raw.trim();
  if (!clean) return { tripleC: null, zodiacSign: null };

  const match = /^(\d{2,4})(?:\s+([A-Za-zÁÉÍÓÚáéíóú]{2,12}))?$/.exec(clean);
  if (match) {
    const digits = match[1] ?? null;
    const signRaw = match[2] ?? null;
    return {
      tripleC: digits,
      zodiacSign: signRaw ? formatZodiacSign(signRaw) : null,
    };
  }

  const tokens = clean.split(/\s+/);
  const firstDigits = tokens.find((t) => /^\d{2,4}$/.test(t)) ?? null;
  const firstSign = tokens.find((t) => /^[A-Za-zÁÉÍÓÚáéíóú]{2,12}$/.test(t)) ?? null;
  return {
    tripleC: firstDigits,
    zodiacSign: firstSign ? formatZodiacSign(firstSign) : null,
  };
}

/**
 * Parses the JSON response from:
 * https://backend.serviciosintegradostriple7.com/api/v1/products/el-arrejuntao/results/?date=${currentDate}
 */
export function parseArrejuntaoResultsJson(
  payload: unknown,
  fallbackDate: string,
): ArrejuntaoParsedPayload {
  const cleanFallbackDate = (fallbackDate || lotteryDate()).trim();
  if (!payload || typeof payload !== "object") {
    return { date: cleanFallbackDate, logoUrl: null, draws: [], tripleResults: [] };
  }

  const root = payload as Record<string, unknown>;
  const logoUrl =
    typeof root["logo"] === "string" && root["logo"].trim() ? root["logo"].trim() : null;

  const rawDraws: unknown[] = Array.isArray(payload)
    ? payload
    : Array.isArray(root["draws"])
      ? (root["draws"] as unknown[])
      : Array.isArray(root["results"])
        ? (root["results"] as unknown[])
        : Array.isArray(root["data"])
          ? (root["data"] as unknown[])
          : [];

  const drawsByTime = new Map<string, ArrejuntaoNormalizedDraw>();

  for (const item of rawDraws) {
    if (!item || typeof item !== "object") continue;
    const drawObj = item as Record<string, unknown>;

    // Skip explicitly unpublished draws if the flag is false
    if (drawObj["is_published"] === false) continue;

    const rawDate =
      typeof drawObj["draw_date"] === "string" && drawObj["draw_date"].trim()
        ? drawObj["draw_date"].trim().slice(0, 10)
        : typeof drawObj["date"] === "string" && drawObj["date"].trim()
          ? drawObj["date"].trim().slice(0, 10)
          : cleanFallbackDate;

    const scheduleField = drawObj["schedule"];
    const rawTimeCandidate =
      drawObj["draw_time"] ??
      drawObj["time"] ??
      drawObj["hour"] ??
      (typeof scheduleField === "string"
        ? scheduleField
        : scheduleField && typeof scheduleField === "object"
          ? ((scheduleField as Record<string, unknown>)["time"] ??
            (scheduleField as Record<string, unknown>)["draw_time"] ??
            (scheduleField as Record<string, unknown>)["name"])
          : undefined);

    const normTime = normalizeArrejuntaoTime(rawTimeCandidate);
    if (!normTime) continue;

    let tripleA = "";
    let tripleB: string | null = null;
    let tripleC: string | null = null;
    let zodiacSign: string | null = null;

    let rawAnimalCode: string | null = null;
    let rawAnimalName: string | null = null;
    let animalImageUrl: string | null = null;

    if (Array.isArray(drawObj["results"])) {
      for (const sub of drawObj["results"] as unknown[]) {
        if (!sub || typeof sub !== "object") continue;
        const subObj = sub as Record<string, unknown>;
        const gameMeta =
          subObj["game"] && typeof subObj["game"] === "object"
            ? (subObj["game"] as Record<string, unknown>)
            : null;
        const subSlug = String(gameMeta?.["slug"] ?? subObj["slug"] ?? "")
          .trim()
          .toLowerCase();
        const subName = String(gameMeta?.["name"] ?? subObj["name"] ?? "")
          .trim()
          .toUpperCase();
        const resultValue = String(subObj["result_value"] ?? subObj["result"] ?? "").trim();

        const symbolObj =
          subObj["symbol"] && typeof subObj["symbol"] === "object"
            ? (subObj["symbol"] as Record<string, unknown>)
            : null;

        if (subSlug === "animalito" || subName === "ANIMALITO" || symbolObj) {
          const symVal =
            typeof symbolObj?.["value"] === "string" && symbolObj["value"].trim()
              ? symbolObj["value"].trim()
              : resultValue;
          if (symVal) {
            rawAnimalCode = symVal;
          }
          if (typeof symbolObj?.["name"] === "string" && symbolObj["name"].trim()) {
            rawAnimalName = symbolObj["name"].trim();
          }
          if (typeof symbolObj?.["image"] === "string" && symbolObj["image"].trim()) {
            animalImageUrl = symbolObj["image"].trim();
          }
        } else if (subSlug === "triple-a" || subName === "TRIPLE A") {
          if (/^\d{2,4}$/.test(resultValue)) {
            tripleA = resultValue;
          }
        } else if (subSlug === "triple-b" || subName === "TRIPLE B") {
          if (/^\d{2,4}$/.test(resultValue)) {
            tripleB = resultValue;
          }
        } else if (
          subSlug === "triple-signo" ||
          subName.includes("TRIPLE + SIGNO") ||
          subName.includes("SIGNO")
        ) {
          const parsedSigno = parseTripleSignoValue(resultValue);
          if (parsedSigno.tripleC) tripleC = parsedSigno.tripleC;
          if (parsedSigno.zodiacSign) zodiacSign = parsedSigno.zodiacSign;
        }
      }
    }

    // Flat draw object fallback (if `result` / `result_value` / `triple_a` is directly on the draw)
    if (!rawAnimalCode && !tripleA) {
      const flatTripleA = String(drawObj["triple_a"] ?? drawObj["tripleA"] ?? "").trim();
      const flatTripleB = String(drawObj["triple_b"] ?? drawObj["tripleB"] ?? "").trim();
      const flatTripleC = String(drawObj["triple_c"] ?? drawObj["tripleC"] ?? "").trim();
      const flatSign = String(drawObj["zodiac_sign"] ?? drawObj["sign"] ?? "").trim();
      if (/^\d{2,4}$/.test(flatTripleA)) {
        tripleA = flatTripleA;
        if (/^\d{2,4}$/.test(flatTripleB)) tripleB = flatTripleB;
        if (/^\d{2,4}$/.test(flatTripleC)) tripleC = flatTripleC;
        if (flatSign) zodiacSign = formatZodiacSign(flatSign);
      }

      const directResult = drawObj["result"] ?? drawObj["result_value"] ?? drawObj["value"];
      if (typeof directResult === "string" || typeof directResult === "number") {
        const directStr = String(directResult).trim();
        if (directStr) {
          rawAnimalCode = directStr;
          if (!tripleA && /^\d{2,4}$/.test(directStr)) {
            tripleA = directStr;
          }
        }
      }
      if (typeof drawObj["animal_name"] === "string" && drawObj["animal_name"].trim()) {
        rawAnimalName = drawObj["animal_name"].trim();
      }
    }

    if (!rawAnimalCode && !tripleA) continue;

    let animalNumber = 0;
    let animalLabel = "0";
    let animalName = "";

    if (rawAnimalCode !== null) {
      const canonical = resolveCanonicalAnimal("arrejuntao", rawAnimalCode, rawAnimalName);
      animalNumber = parseCanonicalAnimalNumber("arrejuntao", rawAnimalCode, rawAnimalName);
      animalLabel = rawAnimalCode === "00" ? "00" : rawAnimalCode === "0" ? "0" : canonical.label;
      animalName = rawAnimalName || canonical.name;
    } else {
      const parsedDigits = parseInt(tripleA, 10);
      animalNumber = Number.isFinite(parsedDigits) ? parsedDigits : 0;
      animalLabel = tripleA;
      animalName = [
        tripleA ? `A:${tripleA}` : null,
        tripleB ? `B:${tripleB}` : null,
        tripleC ? `C:${tripleC}` : null,
        zodiacSign || null,
      ]
        .filter(Boolean)
        .join(" ");
    }

    const normalizedDraw: ArrejuntaoNormalizedDraw = {
      drawDate: rawDate,
      drawTime: normTime.full,
      drawTimeShort: normTime.short,
      animalNumber,
      animalLabel,
      animalName,
      animalImageUrl,
      tripleA,
      tripleB,
      tripleC,
      zodiacSign,
    };

    drawsByTime.set(`${rawDate}|${normTime.short}`, normalizedDraw);
  }

  const draws = [...drawsByTime.values()].sort((a, b) => a.drawTime.localeCompare(b.drawTime));

  const tripleResults: TripleResult[] = draws
    .filter((d) => /^\d{2,4}$/.test(d.tripleA))
    .map((d) => ({
      id: `triple-arrejuntao-${d.drawDate}-${d.drawTimeShort}`,
      game_id: "arrejuntao",
      game_slug: "arrejuntao",
      draw_date: d.drawDate,
      draw_time: d.drawTimeShort,
      triple_a: d.tripleA,
      triple_b: d.tripleB,
      triple_c: d.tripleC,
      zodiac_sign: d.zodiacSign,
      source: "automatic" as const,
      created_at: new Date().toISOString(),
    }));

  return {
    date: draws[0]?.drawDate ?? cleanFallbackDate,
    logoUrl,
    draws,
    tripleResults,
  };
}

/**
 * Performs the official direct JSON request to:
 * https://backend.serviciosintegradostriple7.com/api/v1/products/el-arrejuntao/results/?date=${currentDate}
 * with standard headers (`Accept: application/json`, browser `User-Agent`)
 * and a 5-second `AbortController` timeout.
 */
export async function fetchArrejuntaoOfficialResults(
  currentDate = lotteryDate(),
  forceRefresh = false,
): Promise<ArrejuntaoParsedPayload> {
  const targetDate = (currentDate || lotteryDate()).trim();
  const now = Date.now();

  if (
    !forceRefresh &&
    arrejuntaoCache &&
    arrejuntaoCache.date === targetDate &&
    now - arrejuntaoCache.at < SNAPSHOT_TTL_MS
  ) {
    return arrejuntaoCache.promise;
  }

  const run = (async (): Promise<ArrejuntaoParsedPayload> => {
    const url = buildArrejuntaoResultsUrl(targetDate);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), ARREJUNTAO_FETCH_TIMEOUT_MS);

    try {
      const response = await fetch(url, {
        method: "GET",
        headers: ARREJUNTAO_BROWSER_HEADERS,
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status} from ${url}`);
      }

      const json = (await response.json()) as unknown;
      const parsed = parseArrejuntaoResultsJson(json, targetDate);
      if (parsed.draws.length === 0 && arrejuntaoCache?.promise === run) {
        arrejuntaoCache = null;
      }
      return parsed;
    } catch (err) {
      if (arrejuntaoCache?.promise === run) {
        arrejuntaoCache = null;
      }
      const msg = err instanceof Error ? err.message : String(err);
      if (!msg.toLowerCase().includes("abort")) {
        console.warn("[arrejuntao-sync] Official API fetch warning:", msg);
      }
      return { date: targetDate, logoUrl: null, draws: [], tripleResults: [] };
    } finally {
      clearTimeout(timer);
    }
  })();

  arrejuntaoCache = { at: now, date: targetDate, promise: run };
  return run;
}

export async function fetchArrejuntaoDirectTriples(
  currentDate = lotteryDate(),
  forceRefresh = false,
): Promise<TripleResult[]> {
  const payload = await fetchArrejuntaoOfficialResults(currentDate, forceRefresh);
  return payload.tripleResults;
}

/**
 * Provider adapter for `synchronizeAutomaticResults` (`result-sync.server.ts`)
 * so any `arrejuntao` game entry in the `games` table is synchronized via the official API.
 */
export function createArrejuntaoProvider(): ResultsProvider {
  return {
    async fetchResults(_game: SyncGame): Promise<AutomaticDraw[]> {
      const today = lotteryDate();
      const payload = await fetchArrejuntaoOfficialResults(today, false);
      return payload.draws.map((d) => ({
        draw_date: d.drawDate,
        draw_time: d.drawTime,
        animal_number: d.animalNumber,
        animal_name: d.animalName,
      }));
    },
  };
}

function isMissingColumnError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { code?: unknown; message?: unknown };
  const code = typeof e.code === "string" ? e.code : "";
  const msg = typeof e.message === "string" ? e.message.toLowerCase() : "";
  return (
    code === "42703" ||
    code === "PGRST204" ||
    msg.includes("game_slug") ||
    msg.includes("could not find the")
  );
}

/**
 * Synchronizes El Arrejuntao (`arrejuntao`) from its official JSON endpoint,
 * maps each draw to the official `game_id` of `arrejuntao` in Supabase `games`,
 * and inserts/updates the normalized rows in the `results` table (plus in-memory stores).
 */
export async function synchronizeArrejuntaoOfficialData(options?: {
  currentDate?: string;
  forceRefresh?: boolean;
  resolveGameId?: (canonicalSlug: string) => string | undefined;
  currentAnimalResults?: Result[];
}): Promise<{
  payload: ArrejuntaoParsedPayload;
  officialGameId: string | null;
  upsertedResults: Result[];
  supabaseWritten: number;
}> {
  const targetDate = (options?.currentDate || lotteryDate()).trim();
  const payload = await fetchArrejuntaoOfficialResults(targetDate, Boolean(options?.forceRefresh));
  if (payload.draws.length === 0) {
    return {
      payload,
      officialGameId: null,
      upsertedResults: [],
      supabaseWritten: 0,
    };
  }

  const realClient = createRealSupabaseAdminClient();
  let officialGameId: string | null = options?.resolveGameId?.("arrejuntao") ?? null;

  // Look up official game_id of arrejuntao directly in Supabase `games` table if not already in memory
  if (!officialGameId && realClient) {
    try {
      const { data: gamesRows } = await realClient
        .from("games")
        .select("id, slug, name")
        .or("slug.eq.arrejuntao,slug.eq.el-arrejuntao,name.ilike.%arrejuntao%")
        .limit(1);
      if (Array.isArray(gamesRows) && gamesRows.length > 0 && gamesRows[0]?.id) {
        officialGameId = String(gamesRows[0].id).trim();
      }
    } catch {
      // ignore if games query fails
    }
  }

  const upsertedResults: Result[] = [];
  let supabaseWritten = 0;

  if (officialGameId) {
    for (const draw of payload.draws) {
      const existingManual = options?.currentAnimalResults?.find(
        (r) =>
          r.game_id === officialGameId &&
          r.draw_date === draw.drawDate &&
          (r.draw_time === draw.drawTime || r.draw_time.slice(0, 5) === draw.drawTimeShort) &&
          r.source === "manual",
      );
      if (existingManual) {
        continue;
      }

      const resultRow: Result = {
        id: `arrejuntao-${officialGameId}-${draw.drawDate}-${draw.drawTime}`,
        game_id: officialGameId,
        game_slug: "arrejuntao",
        draw_date: draw.drawDate,
        draw_time: draw.drawTime,
        animal_number: draw.animalNumber,
        animal_name: draw.animalName,
        source: "automatic",
        created_at: new Date().toISOString(),
      };
      upsertedResults.push(resultRow);

      if (realClient) {
        try {
          // 1. Try atomic sync_automatic_result RPC first (preserves manual edits in Supabase)
          const { data: rpcData, error: rpcError } = await realClient.rpc("sync_automatic_result", {
            p_game_id: officialGameId,
            p_draw_date: draw.drawDate,
            p_draw_time: draw.drawTime,
            p_animal_number: draw.animalNumber,
            p_animal_name: draw.animalName,
          });

          if (!rpcError) {
            if (rpcData === true) supabaseWritten++;
            continue;
          }

          // 2. Fallback to direct upsert on `results` table if RPC is not present
          const rowWithSlug: Record<string, unknown> = {
            game_id: officialGameId,
            game_slug: "arrejuntao",
            draw_date: draw.drawDate,
            draw_time: draw.drawTime,
            animal_number: draw.animalNumber,
            animal_name: draw.animalName,
            source: "automatic",
          };

          const { error: upsertErr } = await realClient
            .from("results")
            .upsert(rowWithSlug, { onConflict: "game_id,draw_date,draw_time" });

          if (upsertErr && isMissingColumnError(upsertErr)) {
            const { game_slug: _omit, ...rowWithoutSlug } = rowWithSlug;
            const { error: retryErr } = await realClient
              .from("results")
              .upsert(rowWithoutSlug, { onConflict: "game_id,draw_date,draw_time" });
            if (!retryErr) supabaseWritten++;
          } else if (!upsertErr) {
            supabaseWritten++;
          }
        } catch {
          // Non-fatal: local store still receives upsertedResults
        }
      }
    }
  }

  return {
    payload,
    officialGameId,
    upsertedResults,
    supabaseWritten,
  };
}
