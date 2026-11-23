import type { Result } from "@/lib/types";
import { normalizeHour, hourTo24h } from "@/lib/tuazar-parser";
import { normalizeScheduleTime } from "@/lib/game-schedules";
import {
  parseCanonicalAnimalNumber,
  resolveCanonicalAnimal,
  SLUG_TO_GAME_ID,
} from "@/lib/official-animals";
import type { AutomaticDraw, ResultsProvider, SyncGame } from "@/lib/result-sync";
import { createRealSupabaseAdminClient } from "@/integrations/supabase/client.server";
import { lotteryDate } from "@/lib/lottery-date";

export const LOTTO_ACTIVO_PROCESS_URL = "https://www.lottoactivo.com/core/process.php";
export const LOTTO_ACTIVO_RESULTS_PAGE_URL = "https://www.lottoactivo.com/resultados/lotto_activo/";

export const LOTTO_ACTIVO_OPTION_TOKEN =
  "UVRwLXA0WVNFdGF5VU1rSWVtQ0VEdyRDMkRQYk00WnpNTjB1UjFIR2ZIWXRSdWxxUm9KMTJsdjNubjFaWU4xSUZPREZwOXo4RWxyVHp2cnVqNzVmQlZ0WTFBUEdKTH9BV1Bqb3IPRGdzVkJtQT09";

export const LOTTO_ACTIVO_VERIFIED_OPTION_TOKEN =
  "WnVibEhGYk45U1dJeUJWWkprczhRdyQ5dnl6TENMbExxYm9Ia1M1UlNRMjVJRERDdzBIVHB4ai9GeHFwaFVyVzNlYW5mcGVRaldqVFB5Uldjd08wM2hYbUxOamNxUHdtTXhVNGFscE8vOE1qQT09";

export const LOTTO_ACTIVO_FETCH_TIMEOUT_MS = 4_500;
const SNAPSHOT_TTL_MS = 12_000;

export const LOTTO_ACTIVO_REQUIRED_HEADERS: Record<string, string> = {
  "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
  Origin: "https://www.lottoactivo.com",
  Referer: "https://www.lottoactivo.com/lotto_activo/",
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
};

export interface LottoActivoNormalizedDraw {
  drawDate: string;
  /** 24h time in HH:MM:00 format for Supabase `results` table */
  drawTime: string;
  /** 24h time in HH:MM format */
  drawTimeShort: string;
  /** Raw `number_animal` string from `datos` (e.g. "0", "00", "05", "20", "36") */
  rawNumberAnimal: string;
  /** Canonical integer animal_number (0 = Delfín, 1..36 = Carnero..Culebra, 37 = Ballena "00") */
  animalNumber: number;
  animalLabel: string;
  animalName: string;
}

export interface LottoActivoParsedPayload {
  date: string;
  draws: LottoActivoNormalizedDraw[];
}

interface CachedLottoActivoFetch {
  at: number;
  date: string;
  promise: Promise<LottoActivoParsedPayload>;
}

let lottoActivoCache: CachedLottoActivoFetch | null = null;
let cachedValidOptionToken: string = LOTTO_ACTIVO_VERIFIED_OPTION_TOKEN;

export function buildLottoActivoRequestBody(
  currentDate: string,
  optionToken: string = LOTTO_ACTIVO_OPTION_TOKEN,
): string {
  const cleanDate = (currentDate || lotteryDate()).trim();
  return new URLSearchParams({
    option: optionToken,
    loteria: "lotto_activo",
    fecha: cleanDate,
  }).toString();
}

/**
 * Normalizes `time_schedule` ("08:00:00") or `time_s` ("08:00 AM")
 * into `{ full: "HH:MM:00", short: "HH:MM" }`.
 */
export function normalizeLottoActivoTime(
  timeSchedule?: unknown,
  timeS?: unknown,
): { full: string; short: string } | null {
  for (const candidate of [timeSchedule, timeS]) {
    if (typeof candidate !== "string" || !candidate.trim()) continue;
    const trimmed = candidate.trim();

    // 1. Direct 24h HH:MM:SS or HH:MM (e.g. "08:00:00", "13:00:00")
    const sched = normalizeScheduleTime(trimmed);
    if (sched && !/\b(?:am|pm)\b/i.test(trimmed)) {
      return { full: `${sched}:00`, short: sched };
    }

    // 2. 12h AM/PM format (e.g. "08:00 AM", "01:00 PM")
    const normHr = normalizeHour(trimmed);
    if (normHr) {
      const h24 = hourTo24h(normHr);
      if (h24) {
        const short = h24.slice(0, 5);
        return { full: `${short}:00`, short };
      }
    }

    if (sched) {
      return { full: `${sched}:00`, short: sched };
    }
  }

  return null;
}

/**
 * Parses the JSON response from `https://www.lottoactivo.com/core/process.php`.
 * When `status === true` and `Array.isArray(datos)`, extracts each item's
 * `time_schedule` / `time_s`, `number_animal`, and `name_animal`.
 */
export function parseLottoActivoResultsJson(
  payload: unknown,
  fallbackDate: string,
): LottoActivoParsedPayload {
  const cleanFallbackDate = (fallbackDate || lotteryDate()).trim();
  if (!payload || typeof payload !== "object") {
    return { date: cleanFallbackDate, draws: [] };
  }

  const root = payload as Record<string, unknown>;
  if (root["status"] !== true || !Array.isArray(root["datos"])) {
    return { date: cleanFallbackDate, draws: [] };
  }

  const rawList = root["datos"] as unknown[];
  const drawsByTime = new Map<string, LottoActivoNormalizedDraw>();

  for (const item of rawList) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;

    const rawDate =
      typeof row["date_result"] === "string" && row["date_result"].trim()
        ? row["date_result"].trim().slice(0, 10)
        : typeof row["fecha"] === "string" && row["fecha"].trim()
          ? row["fecha"].trim().slice(0, 10)
          : cleanFallbackDate;

    const normTime = normalizeLottoActivoTime(row["time_schedule"], row["time_s"]);
    if (!normTime) continue;

    const rawNumber = row["number_animal"];
    if (rawNumber === undefined || rawNumber === null) continue;
    const rawNumberAnimal = String(rawNumber).trim();
    if (!rawNumberAnimal) continue;

    const rawName =
      typeof row["name_animal"] === "string" && row["name_animal"].trim()
        ? row["name_animal"].trim()
        : null;

    const canonical = resolveCanonicalAnimal("lotto-activo", rawNumberAnimal, rawName);
    const animalNumber = parseCanonicalAnimalNumber("lotto-activo", rawNumberAnimal, rawName);
    const animalLabel =
      rawNumberAnimal === "00" ? "00" : rawNumberAnimal === "0" ? "0" : canonical.label;
    const animalName = canonical.name || rawName || `Animal ${animalLabel}`;

    const normalizedDraw: LottoActivoNormalizedDraw = {
      drawDate: rawDate,
      drawTime: normTime.full,
      drawTimeShort: normTime.short,
      rawNumberAnimal,
      animalNumber,
      animalLabel,
      animalName,
    };

    drawsByTime.set(`${rawDate}|${normTime.short}`, normalizedDraw);
  }

  const draws = [...drawsByTime.values()].sort((a, b) => a.drawTime.localeCompare(b.drawTime));

  return {
    date: draws[0]?.drawDate ?? cleanFallbackDate,
    draws,
  };
}

/**
 * Tolerantly parses JSON from `process.php` even if PHP concatenates two JSON objects
 * (e.g. `{"status":true,"msg":"Permiso concebido","datos":""}{"msg":"Error Controller","status":false}`).
 */
function parseProcessPhpText(text: string): unknown {
  const trimmed = text.trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed);
  } catch {
    // Handle concatenated JSON objects if process.php emitted two blocks
    const lastBraceOpen = trimmed.lastIndexOf('{"msg"');
    if (lastBraceOpen > 0) {
      try {
        return JSON.parse(trimmed.slice(lastBraceOpen));
      } catch {
        // ignore
      }
    }
    return null;
  }
}

async function postLottoActivoWithToken(
  targetDate: string,
  optionToken: string,
  signal: AbortSignal,
): Promise<{ ok: boolean; parsed: LottoActivoParsedPayload }> {
  const response = await fetch(LOTTO_ACTIVO_PROCESS_URL, {
    method: "POST",
    headers: LOTTO_ACTIVO_REQUIRED_HEADERS,
    body: buildLottoActivoRequestBody(targetDate, optionToken),
    signal,
  });

  const text = await response.text();
  const json = parseProcessPhpText(text);
  if (
    response.ok &&
    json &&
    typeof json === "object" &&
    (json as Record<string, unknown>)["status"] === true &&
    Array.isArray((json as Record<string, unknown>)["datos"])
  ) {
    return {
      ok: true,
      parsed: parseLottoActivoResultsJson(json, targetDate),
    };
  }

  return {
    ok: false,
    parsed: { date: targetDate, draws: [] },
  };
}

async function fetchDynamicOptionTokenFromPage(signal: AbortSignal): Promise<string | null> {
  try {
    const res = await fetch(LOTTO_ACTIVO_RESULTS_PAGE_URL, {
      method: "GET",
      headers: {
        "User-Agent": LOTTO_ACTIVO_REQUIRED_HEADERS["User-Agent"],
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
      signal,
    });
    if (!res.ok) return null;
    const html = await res.text();
    const match = html.match(
      /function\s+results_image\s*\(\)\s*\{[\s\S]*?['"]option['"]\s*:\s*['"]([^'"]+)['"]/,
    );
    return match?.[1]?.trim() || null;
  } catch {
    return null;
  }
}

/**
 * Performs the official direct POST request to `https://www.lottoactivo.com/core/process.php`
 * with the required headers (`Content-Type`, `Origin`, `Referer`, `User-Agent`),
 * URL-encoded body (`option`, `loteria: 'lotto_activo'`, `fecha: currentDate`),
 * and a strict 4.5-second `AbortController` timeout.
 */
export async function fetchLottoActivoOfficialResults(
  currentDate = lotteryDate(),
  forceRefresh = false,
): Promise<LottoActivoParsedPayload> {
  const targetDate = (currentDate || lotteryDate()).trim();
  const now = Date.now();

  if (
    !forceRefresh &&
    lottoActivoCache &&
    lottoActivoCache.date === targetDate &&
    now - lottoActivoCache.at < SNAPSHOT_TTL_MS
  ) {
    return lottoActivoCache.promise;
  }

  const run = (async (): Promise<LottoActivoParsedPayload> => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), LOTTO_ACTIVO_FETCH_TIMEOUT_MS);

    try {
      // Candidate tokens in priority order: active cached token -> configured token -> verified fallback
      const candidateTokens = Array.from(
        new Set([
          cachedValidOptionToken,
          LOTTO_ACTIVO_OPTION_TOKEN,
          LOTTO_ACTIVO_VERIFIED_OPTION_TOKEN,
        ]),
      );

      for (const token of candidateTokens) {
        const attempt = await postLottoActivoWithToken(targetDate, token, controller.signal);
        if (attempt.ok) {
          cachedValidOptionToken = token;
          if (attempt.parsed.draws.length === 0 && lottoActivoCache?.promise === run) {
            lottoActivoCache = null;
          }
          return attempt.parsed;
        }
      }

      // Self-healing fallback: refresh encrypted `option` token from lottoactivo.com if rotated
      const freshToken = await fetchDynamicOptionTokenFromPage(controller.signal);
      if (freshToken && !candidateTokens.includes(freshToken)) {
        const retryAttempt = await postLottoActivoWithToken(
          targetDate,
          freshToken,
          controller.signal,
        );
        if (retryAttempt.ok) {
          cachedValidOptionToken = freshToken;
          if (retryAttempt.parsed.draws.length === 0 && lottoActivoCache?.promise === run) {
            lottoActivoCache = null;
          }
          return retryAttempt.parsed;
        }
      }

      if (lottoActivoCache?.promise === run) {
        lottoActivoCache = null;
      }
      return { date: targetDate, draws: [] };
    } catch (err) {
      if (lottoActivoCache?.promise === run) {
        lottoActivoCache = null;
      }
      const msg = err instanceof Error ? err.message : String(err);
      if (!msg.toLowerCase().includes("abort")) {
        console.warn("[lotto-activo-sync] Official POST fetch warning:", msg);
      }
      return { date: targetDate, draws: [] };
    } finally {
      clearTimeout(timer);
    }
  })();

  lottoActivoCache = { at: now, date: targetDate, promise: run };
  return run;
}

/**
 * Provider adapter for `synchronizeAutomaticResults` (`result-sync.server.ts`)
 * so `lotto-activo` uses the direct POST endpoint `https://www.lottoactivo.com/core/process.php`
 * as primary source, with optional fallback if unreachable.
 */
export function createLottoActivoProvider(fallbackProvider?: ResultsProvider): ResultsProvider {
  return {
    async fetchResults(game: SyncGame): Promise<unknown[]> {
      const today = lotteryDate();
      const payload = await fetchLottoActivoOfficialResults(today, false);
      if (payload.draws.length > 0) {
        const directDraws: AutomaticDraw[] = payload.draws.map((d) => ({
          draw_date: d.drawDate,
          draw_time: d.drawTime,
          animal_number: d.animalNumber,
          animal_name: d.animalName,
        }));
        return directDraws;
      }
      if (fallbackProvider) {
        return fallbackProvider.fetchResults(game);
      }
      return [];
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
 * Synchronizes Lotto Activo (`lotto-activo`) directly from `https://www.lottoactivo.com/core/process.php`,
 * maps each draw to the official `game_id` of `lotto-activo` in the `games` table,
 * and inserts/updates them in Supabase `results`.
 */
export async function synchronizeLottoActivoOfficialData(options?: {
  currentDate?: string;
  forceRefresh?: boolean;
  resolveGameId?: (canonicalSlug: string) => string | undefined;
  currentAnimalResults?: Result[];
  onPersistDraw?: (
    gameId: string,
    drawDate: string,
    drawTime: string,
    animalNumber: number,
    animalName: string,
  ) => void;
}): Promise<{
  payload: LottoActivoParsedPayload;
  officialGameId: string | null;
  upsertedResults: Result[];
  supabaseWritten: number;
}> {
  const targetDate = (options?.currentDate || lotteryDate()).trim();
  const payload = await fetchLottoActivoOfficialResults(targetDate, Boolean(options?.forceRefresh));
  if (payload.draws.length === 0) {
    return {
      payload,
      officialGameId: null,
      upsertedResults: [],
      supabaseWritten: 0,
    };
  }

  const realClient = createRealSupabaseAdminClient();
  let officialGameId: string | null = options?.resolveGameId?.("lotto-activo") ?? null;

  // Query Supabase `games` table for the official `game_id` of `lotto-activo` if not already in memory
  if (!officialGameId && realClient) {
    try {
      const { data: gamesRows } = await realClient
        .from("games")
        .select("id, slug, name")
        .or("slug.eq.lotto-activo,slug.eq.lotto_activo,name.ilike.lotto activo")
        .limit(1);
      if (Array.isArray(gamesRows) && gamesRows.length > 0 && gamesRows[0]?.id) {
        officialGameId = String(gamesRows[0].id).trim();
      }
    } catch {
      // ignore if games query fails
    }
  }

  if (!officialGameId) {
    officialGameId = SLUG_TO_GAME_ID["lotto-activo"] ?? "7d21a00b-0dfa-4bdc-9edf-8115802df1d6";
  }

  const upsertedResults: Result[] = [];
  let supabaseWritten = 0;

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
      id: `lotto-activo-${officialGameId}-${draw.drawDate}-${draw.drawTime}`,
      game_id: officialGameId,
      game_slug: "lotto-activo",
      draw_date: draw.drawDate,
      draw_time: draw.drawTime,
      animal_number: draw.animalNumber,
      animal_name: draw.animalName,
      source: "automatic",
      created_at: new Date().toISOString(),
    };
    upsertedResults.push(resultRow);

    const alreadySameInMemory = options?.currentAnimalResults?.some(
      (r) =>
        r.game_id === officialGameId &&
        r.draw_date === draw.drawDate &&
        r.draw_time.slice(0, 5) === draw.drawTimeShort &&
        r.animal_number === draw.animalNumber &&
        r.animal_name.trim().toLowerCase() === draw.animalName.trim().toLowerCase(),
    );

    if (realClient && !alreadySameInMemory) {
      try {
        // 1. Atomic write via sync_automatic_result RPC (preserves manual edits in Supabase)
        const { data: rpcData, error: rpcError } = await realClient.rpc("sync_automatic_result", {
          p_game_id: officialGameId,
          p_draw_date: draw.drawDate,
          p_draw_time: draw.drawTime,
          p_animal_number: draw.animalNumber,
          p_animal_name: draw.animalName,
        });

        if (!rpcError) {
          await realClient
            .from("results")
            .update({ game_slug: "lotto-activo" })
            .eq("game_id", officialGameId)
            .eq("draw_date", draw.drawDate)
            .eq("draw_time", draw.drawTime);
          options?.onPersistDraw?.(
            officialGameId,
            draw.drawDate,
            draw.drawTime,
            draw.animalNumber,
            draw.animalName,
          );
          if (rpcData === true) supabaseWritten++;
          continue;
        }

        // 2. Direct table update/insert fallback on `results`
        const { data: existing } = await realClient
          .from("results")
          .select("id, source")
          .eq("game_id", officialGameId)
          .eq("draw_date", draw.drawDate)
          .eq("draw_time", draw.drawTime)
          .maybeSingle();

        if (existing && (existing as { source?: string }).source === "manual") {
          continue;
        }

        const rowWithSlug: Record<string, unknown> = {
          game_id: officialGameId,
          game_slug: "lotto-activo",
          draw_date: draw.drawDate,
          draw_time: draw.drawTime,
          animal_number: draw.animalNumber,
          animal_name: draw.animalName,
          source: "automatic",
        };

        if (existing && (existing as { id?: string }).id) {
          let { error: updErr } = await realClient
            .from("results")
            .update(rowWithSlug)
            .eq("id", (existing as { id: string }).id);
          if (updErr && isMissingColumnError(updErr)) {
            const { game_slug: _omit, ...rowWithoutSlug } = rowWithSlug;
            const retry = await realClient
              .from("results")
              .update(rowWithoutSlug)
              .eq("id", (existing as { id: string }).id);
            updErr = retry.error;
          }
          if (!updErr) {
            supabaseWritten++;
            options?.onPersistDraw?.(
              officialGameId,
              draw.drawDate,
              draw.drawTime,
              draw.animalNumber,
              draw.animalName,
            );
          }
        } else {
          let { error: insErr } = await realClient.from("results").insert(rowWithSlug);
          if (insErr && isMissingColumnError(insErr)) {
            const { game_slug: _omit, ...rowWithoutSlug } = rowWithSlug;
            const retry = await realClient.from("results").insert(rowWithoutSlug);
            insErr = retry.error;
          }
          if (!insErr) {
            supabaseWritten++;
            options?.onPersistDraw?.(
              officialGameId,
              draw.drawDate,
              draw.drawTime,
              draw.animalNumber,
              draw.animalName,
            );
          }
        }
      } catch {
        // Non-fatal: local store still receives upsertedResults
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
