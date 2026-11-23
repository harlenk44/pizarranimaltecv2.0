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

export const SELVA_PLUS_API_BASE_URL = "https://api.lotterly.co/v1/results/selva-plus/";

export const SELVA_PLUS_FETCH_TIMEOUT_MS = 4_500;
const SNAPSHOT_TTL_MS = 12_000;

export const SELVA_PLUS_REQUIRED_HEADERS: Record<string, string> = {
  Accept: "application/json",
  Origin: "https://www.selvaplus.com",
  Referer: "https://www.selvaplus.com/",
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
};

export interface SelvaPlusNormalizedDraw {
  drawDate: string;
  /** 24h time in HH:MM:00 format for Supabase `results` table */
  drawTime: string;
  /** 24h time in HH:MM format */
  drawTimeShort: string;
  /** Raw result code from `results[0].result` (e.g. "0", "00", "05", "20", "36") */
  rawResultCode: string;
  /** Canonical integer animal_number (0 = Delfín, 1..36 = Carnero..Culebra, 37 = Ballena "00") */
  animalNumber: number;
  animalLabel: string;
  animalName: string;
}

export interface SelvaPlusParsedPayload {
  date: string;
  draws: SelvaPlusNormalizedDraw[];
}

interface CachedSelvaPlusFetch {
  at: number;
  date: string;
  promise: Promise<SelvaPlusParsedPayload>;
}

let selvaPlusCache: CachedSelvaPlusFetch | null = null;

export function buildSelvaPlusResultsUrl(currentDate: string): string {
  const cleanDate = (currentDate || lotteryDate()).trim();
  return `${SELVA_PLUS_API_BASE_URL}?exact_date=${encodeURIComponent(cleanDate)}&extended=true`;
}

/**
 * Normalizes `time` from Lotterly API ("08:00:00", "13:00:00", "08:00", "8:00 AM")
 * into `{ full: "HH:MM:00", short: "HH:MM" }`.
 */
export function normalizeSelvaPlusTime(rawTime?: unknown): { full: string; short: string } | null {
  if (typeof rawTime !== "string" || !rawTime.trim()) return null;
  const trimmed = rawTime.trim();

  // 1. Direct 24h HH:MM:SS or HH:MM (standard Lotterly format: "08:00:00")
  const sched = normalizeScheduleTime(trimmed);
  if (sched) {
    return { full: `${sched}:00`, short: sched };
  }

  // 2. 12h AM/PM fallback
  const normHr = normalizeHour(trimmed);
  if (normHr) {
    const h24 = hourTo24h(normHr);
    if (h24) {
      const short = h24.slice(0, 5);
      return { full: `${short}:00`, short };
    }
  }

  return null;
}

/**
 * Parses the JSON response from:
 * https://api.lotterly.co/v1/results/selva-plus/?exact_date=${currentDate}&extended=true
 * Extracts only draws where `status === "PUBLISHED"`, takes `time` for the schedule,
 * and `results[0].result` for the winning number.
 */
export function parseSelvaPlusResultsJson(
  payload: unknown,
  fallbackDate: string,
): SelvaPlusParsedPayload {
  const cleanFallbackDate = (fallbackDate || lotteryDate()).trim();
  if (!payload) {
    return { date: cleanFallbackDate, draws: [] };
  }

  const rawList: unknown[] = Array.isArray(payload)
    ? payload
    : typeof payload === "object" && Array.isArray((payload as Record<string, unknown>)["results"])
      ? ((payload as Record<string, unknown>)["results"] as unknown[])
      : typeof payload === "object" && Array.isArray((payload as Record<string, unknown>)["data"])
        ? ((payload as Record<string, unknown>)["data"] as unknown[])
        : [];

  const drawsByTime = new Map<string, SelvaPlusNormalizedDraw>();

  for (const item of rawList) {
    if (!item || typeof item !== "object") continue;
    const drawObj = item as Record<string, unknown>;

    // Strictly filter draws where status === "PUBLISHED"
    const status = typeof drawObj["status"] === "string" ? drawObj["status"].trim() : "";
    if (status !== "PUBLISHED") continue;

    const rawDate =
      typeof drawObj["date"] === "string" && drawObj["date"].trim()
        ? drawObj["date"].trim().slice(0, 10)
        : typeof drawObj["draw_date"] === "string" && drawObj["draw_date"].trim()
          ? drawObj["draw_date"].trim().slice(0, 10)
          : cleanFallbackDate;

    const normTime = normalizeSelvaPlusTime(drawObj["time"] ?? drawObj["draw_time"]);
    if (!normTime) continue;

    const resultsArr = Array.isArray(drawObj["results"]) ? (drawObj["results"] as unknown[]) : [];
    const firstResultObj =
      resultsArr.length > 0 && resultsArr[0] && typeof resultsArr[0] === "object"
        ? (resultsArr[0] as Record<string, unknown>)
        : null;

    const rawWinner = firstResultObj?.["result"] ?? drawObj["result"];
    if (rawWinner === undefined || rawWinner === null) continue;

    const rawResultCode = String(rawWinner).trim();
    if (!rawResultCode) continue;

    const canonical = resolveCanonicalAnimal("selva-plus", rawResultCode);
    const animalNumber = parseCanonicalAnimalNumber("selva-plus", rawResultCode);
    const animalLabel =
      rawResultCode === "00" ? "00" : rawResultCode === "0" ? "0" : canonical.label;
    const animalName = canonical.name;

    const normalizedDraw: SelvaPlusNormalizedDraw = {
      drawDate: rawDate,
      drawTime: normTime.full,
      drawTimeShort: normTime.short,
      rawResultCode,
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
 * Queries the official Lotterly endpoint for Selva Plus (`selva-plus`):
 * https://api.lotterly.co/v1/results/selva-plus/?exact_date=${currentDate}&extended=true
 * with the required Origin/Referer/User-Agent headers and a 4.5-second AbortController timeout.
 */
export async function fetchSelvaPlusOfficialResults(
  currentDate = lotteryDate(),
  forceRefresh = false,
): Promise<SelvaPlusParsedPayload> {
  const targetDate = (currentDate || lotteryDate()).trim();
  const now = Date.now();

  if (
    !forceRefresh &&
    selvaPlusCache &&
    selvaPlusCache.date === targetDate &&
    now - selvaPlusCache.at < SNAPSHOT_TTL_MS
  ) {
    return selvaPlusCache.promise;
  }

  const run = (async (): Promise<SelvaPlusParsedPayload> => {
    const url = buildSelvaPlusResultsUrl(targetDate);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), SELVA_PLUS_FETCH_TIMEOUT_MS);

    try {
      const response = await fetch(url, {
        method: "GET",
        headers: SELVA_PLUS_REQUIRED_HEADERS,
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status} from ${url}`);
      }

      const json = (await response.json()) as unknown;
      const parsed = parseSelvaPlusResultsJson(json, targetDate);
      if (parsed.draws.length === 0 && selvaPlusCache?.promise === run) {
        selvaPlusCache = null;
      }
      return parsed;
    } catch (err) {
      if (selvaPlusCache?.promise === run) {
        selvaPlusCache = null;
      }
      const msg = err instanceof Error ? err.message : String(err);
      if (!msg.toLowerCase().includes("abort")) {
        console.warn("[selva-plus-sync] Official Lotterly API fetch warning:", msg);
      }
      return { date: targetDate, draws: [] };
    } finally {
      clearTimeout(timer);
    }
  })();

  selvaPlusCache = { at: now, date: targetDate, promise: run };
  return run;
}

/**
 * Provider adapter for `synchronizeAutomaticResults` (`result-sync.server.ts`)
 * so `selva-plus` uses the direct Lotterly API as primary source, with
 * optional fallback provider if the API is temporarily unreachable.
 */
export function createSelvaPlusProvider(fallbackProvider?: ResultsProvider): ResultsProvider {
  return {
    async fetchResults(game: SyncGame): Promise<unknown[]> {
      const today = lotteryDate();
      const payload = await fetchSelvaPlusOfficialResults(today, false);
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
 * Synchronizes Selva Plus (`selva-plus`) directly from its official Lotterly JSON endpoint,
 * maps each PUBLISHED draw to the official `game_id` of Selva Plus in the `games` table,
 * and saves them in Supabase under `game_slug: "selva-plus"`.
 */
export async function synchronizeSelvaPlusOfficialData(options?: {
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
  payload: SelvaPlusParsedPayload;
  officialGameId: string | null;
  upsertedResults: Result[];
  supabaseWritten: number;
}> {
  const targetDate = (options?.currentDate || lotteryDate()).trim();
  const payload = await fetchSelvaPlusOfficialResults(targetDate, Boolean(options?.forceRefresh));
  if (payload.draws.length === 0) {
    return {
      payload,
      officialGameId: null,
      upsertedResults: [],
      supabaseWritten: 0,
    };
  }

  const realClient = createRealSupabaseAdminClient();
  let officialGameId: string | null =
    options?.resolveGameId?.("selva-plus") ?? options?.resolveGameId?.("selvaplus") ?? null;

  // Query Supabase `games` table for the official `game_id` of `selva-plus` if not already resolved
  if (!officialGameId && realClient) {
    try {
      const { data: gamesRows } = await realClient
        .from("games")
        .select("id, slug, name")
        .or("slug.eq.selva-plus,slug.eq.selvaplus,name.ilike.%selva plus%")
        .limit(1);
      if (Array.isArray(gamesRows) && gamesRows.length > 0 && gamesRows[0]?.id) {
        officialGameId = String(gamesRows[0].id).trim();
      }
    } catch {
      // ignore if games query fails
    }
  }

  if (!officialGameId) {
    officialGameId = SLUG_TO_GAME_ID["selva-plus"] ?? "2f50625d-8862-4554-9530-9f509b88513c";
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
      id: `selva-plus-${officialGameId}-${draw.drawDate}-${draw.drawTime}`,
      game_id: officialGameId,
      game_slug: "selva-plus",
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
        // 1. Try atomic sync_automatic_result RPC first (preserves manual edits in Supabase)
        const { data: rpcData, error: rpcError } = await realClient.rpc("sync_automatic_result", {
          p_game_id: officialGameId,
          p_draw_date: draw.drawDate,
          p_draw_time: draw.drawTime,
          p_animal_number: draw.animalNumber,
          p_animal_name: draw.animalName,
        });

        if (!rpcError) {
          // Best-effort update of game_slug = "selva-plus"
          await realClient
            .from("results")
            .update({ game_slug: "selva-plus" })
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

        // 2. Fallback to direct table update/insert on `results` (handles number 37 if RPC has legacy check constraint)
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
          game_slug: "selva-plus",
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
