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
import { isFutureLotteryDrawTime, lotteryDate } from "@/lib/lottery-date";

export const GUACHARITO_API_BASE_URL =
  "https://api.lotterly.co/v1/results/el-guacharito-millonario/";

export const GUACHARITO_FETCH_TIMEOUT_MS = 4_500;
const SNAPSHOT_TTL_MS = 12_000;

export const GUACHARITO_REQUIRED_HEADERS: Record<string, string> = {
  Accept: "application/json",
  Origin: "https://elguacharitomillonario.com",
  Referer: "https://elguacharitomillonario.com/",
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
};

export interface GuacharitoNormalizedDraw {
  drawDate: string;
  /** 24h time in HH:MM:00 format for Supabase `results` table */
  drawTime: string;
  /** 24h time in HH:MM format */
  drawTimeShort: string;
  /** Raw result code from `results[0].result` (e.g. "0", "00", "05", "63", "99") */
  rawResultCode: string;
  /** Canonical integer animal_number (0 = Delfín, 1..99 = Carnero..Corazón, 100 = Ballena "00") */
  animalNumber: number;
  animalLabel: string;
  animalName: string;
}

export interface GuacharitoParsedPayload {
  date: string;
  draws: GuacharitoNormalizedDraw[];
}

interface CachedGuacharitoFetch {
  at: number;
  date: string;
  promise: Promise<GuacharitoParsedPayload>;
}

let guacharitoCache: CachedGuacharitoFetch | null = null;

export function buildGuacharitoResultsUrl(currentDate: string): string {
  const cleanDate = (currentDate || lotteryDate()).trim();
  return `${GUACHARITO_API_BASE_URL}?exact_date=${encodeURIComponent(cleanDate)}&extended=true`;
}

/**
 * Normalizes `time` from Lotterly API ("08:00:00", "13:00:00", "08:30", "8:30 AM")
 * into `{ full: "HH:MM:00", short: "HH:MM" }`.
 */
export function normalizeGuacharitoTime(rawTime?: unknown): { full: string; short: string } | null {
  if (typeof rawTime !== "string" || !rawTime.trim()) return null;
  const trimmed = rawTime.trim();

  // 1. Direct 24h HH:MM:SS or HH:MM (standard Lotterly format: "08:30:00")
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
 * https://api.lotterly.co/v1/results/el-guacharito-millonario/?exact_date=${currentDate}&extended=true
 * Extracts only draws where `status === "PUBLISHED"`, takes `time` for the schedule,
 * and `results[0].result` for the winning number.
 */
export function parseGuacharitoResultsJson(
  payload: unknown,
  fallbackDate: string,
): GuacharitoParsedPayload {
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

  const drawsByTime = new Map<string, GuacharitoNormalizedDraw>();

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

    const normTime = normalizeGuacharitoTime(drawObj["time"] ?? drawObj["draw_time"]);
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

    const canonical = resolveCanonicalAnimal("el-guacharito-millonario", rawResultCode);
    const animalNumber = parseCanonicalAnimalNumber("el-guacharito-millonario", rawResultCode);
    const animalLabel =
      rawResultCode === "00" ? "00" : rawResultCode === "0" ? "0" : canonical.label;
    const animalName = canonical.name;

    const normalizedDraw: GuacharitoNormalizedDraw = {
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
 * Queries the official Lotterly endpoint for Guacharito Millonario (`el-guacharito-millonario`):
 * https://api.lotterly.co/v1/results/el-guacharito-millonario/?exact_date=${currentDate}&extended=true
 * with the required Origin/Referer/User-Agent headers and a 4.5-second AbortController timeout.
 */
export async function fetchGuacharitoOfficialResults(
  currentDate = lotteryDate(),
  forceRefresh = false,
): Promise<GuacharitoParsedPayload> {
  const targetDate = (currentDate || lotteryDate()).trim();
  const now = Date.now();

  if (
    !forceRefresh &&
    guacharitoCache &&
    guacharitoCache.date === targetDate &&
    now - guacharitoCache.at < SNAPSHOT_TTL_MS
  ) {
    return guacharitoCache.promise;
  }

  const run = (async (): Promise<GuacharitoParsedPayload> => {
    const url = buildGuacharitoResultsUrl(targetDate);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), GUACHARITO_FETCH_TIMEOUT_MS);

    try {
      const response = await fetch(url, {
        method: "GET",
        headers: GUACHARITO_REQUIRED_HEADERS,
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status} from ${url}`);
      }

      const json = (await response.json()) as unknown;
      const parsed = parseGuacharitoResultsJson(json, targetDate);
      if (parsed.draws.length === 0 && guacharitoCache?.promise === run) {
        guacharitoCache = null;
      }
      return parsed;
    } catch (err) {
      if (guacharitoCache?.promise === run) {
        guacharitoCache = null;
      }
      const msg = err instanceof Error ? err.message : String(err);
      if (!msg.toLowerCase().includes("abort")) {
        console.warn("[guacharito-sync] Official Lotterly API fetch warning:", msg);
      }
      return { date: targetDate, draws: [] };
    } finally {
      clearTimeout(timer);
    }
  })();

  guacharitoCache = { at: now, date: targetDate, promise: run };
  return run;
}

/**
 * Provider adapter for `synchronizeAutomaticResults` (`result-sync.server.ts`)
 * so `el-guacharito-millonario` uses the direct Lotterly API as primary source, with
 * optional fallback provider if the API is temporarily unreachable.
 */
export function createGuacharitoProvider(fallbackProvider?: ResultsProvider): ResultsProvider {
  return {
    async fetchResults(game: SyncGame): Promise<unknown[]> {
      const today = lotteryDate();
      const payload = await fetchGuacharitoOfficialResults(today, false);
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
 * Synchronizes Guacharito Millonario (`el-guacharito-millonario`) directly from its official Lotterly JSON endpoint,
 * maps each PUBLISHED draw to the official `game_id` of Guacharito Millonario in the `games` table,
 * and saves them in Supabase under `game_slug: "el-guacharito-millonario"`.
 */
export async function synchronizeGuacharitoOfficialData(options?: {
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
  payload: GuacharitoParsedPayload;
  officialGameId: string | null;
  upsertedResults: Result[];
  supabaseWritten: number;
}> {
  const targetDate = (options?.currentDate || lotteryDate()).trim();
  const payload = await fetchGuacharitoOfficialResults(targetDate, Boolean(options?.forceRefresh));
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
    options?.resolveGameId?.("el-guacharito-millonario") ??
    options?.resolveGameId?.("guacharito-millonario") ??
    options?.resolveGameId?.("guacharito") ??
    null;

  // Query Supabase `games` table for the official `game_id` of Guacharito Millonario if not already resolved
  if (!officialGameId && realClient) {
    try {
      const { data: gamesRows } = await realClient
        .from("games")
        .select("id, slug, name")
        .or(
          "slug.eq.el-guacharito-millonario,slug.eq.guacharito-millonario,slug.eq.guacharito,slug.eq.el-guacharito,name.ilike.%guacharito%",
        )
        .limit(1);
      if (Array.isArray(gamesRows) && gamesRows.length > 0 && gamesRows[0]?.id) {
        officialGameId = String(gamesRows[0].id).trim();
      }
    } catch {
      // ignore if games query fails
    }
  }

  if (!officialGameId) {
    officialGameId =
      SLUG_TO_GAME_ID["el-guacharito-millonario"] ?? "0519825d-e7ea-4e59-bf7d-cef2c832edd3";
  }

  const upsertedResults: Result[] = [];
  let supabaseWritten = 0;

  for (const draw of payload.draws) {
    if (isFutureLotteryDrawTime(draw.drawDate, draw.drawTime)) {
      continue;
    }
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
      id: `guacharito-${officialGameId}-${draw.drawDate}-${draw.drawTime}`,
      game_id: officialGameId,
      game_slug: "el-guacharito-millonario",
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
          // Best-effort update of game_slug = "el-guacharito-millonario"
          await realClient
            .from("results")
            .update({ game_slug: "el-guacharito-millonario" })
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

        // 2. Fallback to direct table update/insert on `results` (handles numbers 37..100 if RPC has legacy check constraint)
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
          game_slug: "el-guacharito-millonario",
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
