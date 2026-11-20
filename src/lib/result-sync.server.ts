import {
  synchronizeGame,
  type AutomaticDraw,
  type ResultsProvider,
  type SyncGame,
  type SyncReport,
} from "@/lib/result-sync";
import { createRealSupabaseAdminClient } from "@/integrations/supabase/client.server";
import { createMockSupabaseClient, mockStore } from "@/lib/mock-db";
import { createTuazarProvider, TUAZAR_GAME_NAMES } from "@/lib/tuazar-provider.server";
import { deduplicateGamesList, normalizeGameSlug, type CanonicalGameSlug } from "@/lib/game-slugs";
import { isCustomUploadedGameLogo } from "@/lib/game-logos";
import { remapInMemoryStoreIds } from "@/lib/consolidate-games-results.server";
import { lotteryDate } from "@/lib/lottery-date";
import type { Game } from "@/lib/types";

// Trusted, fixed-origin adapters indexed by canonical slug.
// Games without an entry stay "pending_configuration".
// No user-supplied URLs or placeholder results are used.
const providersByCanonicalSlug: Readonly<Record<string, ResultsProvider>> = (() => {
  const map: Record<string, ResultsProvider> = {};
  for (const [slug, name] of Object.entries(TUAZAR_GAME_NAMES)) {
    const canonical = normalizeGameSlug(slug, name);
    if (canonical && !map[canonical]) {
      map[canonical] = createTuazarProvider(name, canonical);
    }
  }
  return map;
})();

export function getResultsProviderForSlug(
  slug?: string | null,
  fallbackName?: string | null,
): ResultsProvider | undefined {
  const canonical = normalizeGameSlug(slug, fallbackName);
  if (!canonical) return undefined;
  return providersByCanonicalSlug[canonical];
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

function isMissingRpcError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { code?: unknown; message?: unknown };
  const code = typeof e.code === "string" ? e.code : "";
  const msg = typeof e.message === "string" ? e.message.toLowerCase() : "";
  return (
    code === "PGRST202" ||
    code === "42883" ||
    msg.includes("could not find the function") ||
    msg.includes("sync_automatic_result")
  );
}

let supabaseSupportsGameSlugColumn = true;
let persistedCloudDrawDate = "";
const persistedCloudDrawKeys = new Set<string>();

function makeDrawPersistKey(
  gameId: string,
  drawDate: string,
  drawTime: string,
  animalNumber: number,
  animalName: string,
): string {
  return `${gameId}|${drawDate}|${drawTime.slice(0, 5)}|${animalNumber}|${animalName.trim().toLowerCase()}`;
}

function resetPersistedDrawCacheIfNewDay() {
  const today = lotteryDate();
  if (persistedCloudDrawDate !== today) {
    persistedCloudDrawDate = today;
    persistedCloudDrawKeys.clear();
  }
}

export function markCloudDrawPersisted(
  gameId: string,
  drawDate: string,
  drawTime: string,
  animalNumber: number,
  animalName: string,
): void {
  resetPersistedDrawCacheIfNewDay();
  if (drawDate === persistedCloudDrawDate) {
    persistedCloudDrawKeys.add(
      makeDrawPersistKey(gameId, drawDate, drawTime, animalNumber, animalName),
    );
  }
}

async function persistAutomaticDrawToSupabase(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  realClient: any,
  gameId: string,
  canonicalSlug: string,
  draw: AutomaticDraw,
): Promise<boolean | null> {
  if (!realClient) return null;

  try {
    // 1. Atomic write via sync_automatic_result RPC (preserves manual corrections atomically)
    const { data: rpcData, error: rpcError } = await realClient.rpc("sync_automatic_result", {
      p_game_id: gameId,
      p_draw_date: draw.draw_date,
      p_draw_time: draw.draw_time,
      p_animal_number: draw.animal_number,
      p_animal_name: draw.animal_name,
    });

    if (!rpcError) {
      // Backfill canonical game_slug if the table supports it (best-effort)
      if (supabaseSupportsGameSlugColumn) {
        const { error: slugErr } = await realClient
          .from("results")
          .update({ game_slug: canonicalSlug })
          .eq("game_id", gameId)
          .eq("draw_date", draw.draw_date)
          .eq("draw_time", draw.draw_time);
        if (slugErr && isMissingColumnError(slugErr)) {
          supabaseSupportsGameSlugColumn = false;
        }
      }
      return rpcData === true;
    }

    // 2. Fallback only if sync_automatic_result RPC does not exist in this Supabase project
    if (isMissingRpcError(rpcError)) {
      const { data: existing } = await realClient
        .from("results")
        .select("id, source")
        .eq("game_id", gameId)
        .eq("draw_date", draw.draw_date)
        .eq("draw_time", draw.draw_time)
        .maybeSingle();

      if (existing && (existing as { source?: string }).source === "manual") {
        // Strictly preserve manual corrections
        return false;
      }

      const rowPayload: Record<string, unknown> = {
        game_id: gameId,
        ...(supabaseSupportsGameSlugColumn ? { game_slug: canonicalSlug } : {}),
        draw_date: draw.draw_date,
        draw_time: draw.draw_time,
        animal_number: draw.animal_number,
        animal_name: draw.animal_name,
        source: "automatic",
      };

      if (existing && (existing as { id?: string }).id) {
        let { error: updErr } = await realClient
          .from("results")
          .update(rowPayload)
          .eq("id", (existing as { id: string }).id);
        if (updErr && isMissingColumnError(updErr)) {
          supabaseSupportsGameSlugColumn = false;
          delete rowPayload["game_slug"];
          const retry = await realClient
            .from("results")
            .update(rowPayload)
            .eq("id", (existing as { id: string }).id);
          updErr = retry.error;
        }
        return !updErr;
      }

      let { error: insErr } = await realClient.from("results").insert(rowPayload);
      if (insErr && isMissingColumnError(insErr)) {
        supabaseSupportsGameSlugColumn = false;
        delete rowPayload["game_slug"];
        const retry = await realClient.from("results").insert(rowPayload);
        insErr = retry.error;
      }
      return !insErr;
    }
  } catch {
    // Non-fatal: local store already recorded the draw
  }
  return null;
}

export interface SynchronizeAutomaticOptions {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabaseClient?: any;
  providersOverride?: Readonly<Record<string, ResultsProvider>>;
}

/**
 * Consulta primero la tabla `games` de Supabase para obtener el `id` (UUID) real de cada
 * juego mediante su slug canónico oficial, unifica cualquier duplicado de alias
 * (`guacharo` -> `guacharo-activo`, `guacharito` -> `el-guacharito-millonario`, etc.)
 * y guarda cada resultado con ese mismo `game_id` oficial y `game_slug` canónico.
 */
export async function synchronizeAutomaticResults(
  options?: SynchronizeAutomaticOptions,
): Promise<SyncReport[]> {
  const mockSupabase = createMockSupabaseClient();
  const realClient =
    options?.supabaseClient !== undefined
      ? options.supabaseClient
      : createRealSupabaseAdminClient();

  let cloudGames: Game[] = [];
  const preferredCloudIds = new Set<string>();

  if (realClient) {
    try {
      const { data, error } = await realClient
        .from("games")
        .select("*")
        .order("display_order", { ascending: true });
      if (!error && Array.isArray(data) && data.length > 0) {
        cloudGames = (data as Array<Record<string, unknown>>)
          .filter((row) => Boolean(row?.["id"]))
          .map((row) => {
            const id = String(row["id"]).trim();
            const rawSlug = String(row["slug"] || "").trim();
            const name = String(row["name"] || rawSlug || "JUEGO");
            const canonicalSlug = normalizeGameSlug(rawSlug || id, name);
            preferredCloudIds.add(id);
            const effectiveMode =
              row["loading_mode"] === "manual" ? ("manual" as const) : ("automatic" as const);
            return {
              id,
              name,
              slug: canonicalSlug || rawSlug || id,
              color: typeof row["color"] === "string" ? row["color"] : "#1a56db",
              logo_url: typeof row["logo_url"] === "string" ? row["logo_url"] : null,
              display_order: typeof row["display_order"] === "number" ? row["display_order"] : 99,
              is_active: typeof row["is_active"] === "boolean" ? row["is_active"] : true,
              loading_mode: effectiveMode,
              mode: effectiveMode,
              schedule_times: Array.isArray(row["schedule_times"])
                ? (row["schedule_times"] as string[])
                : undefined,
              created_at:
                typeof row["created_at"] === "string"
                  ? row["created_at"]
                  : new Date().toISOString(),
            };
          });
      }
    } catch {
      // Fallback to mockStore.games when external Supabase is unreachable
    }
  }

  // Deduplicar y adoptar los UUIDs oficiales de Supabase dentro de mockStore.games
  const combinedSource: Game[] =
    cloudGames.length > 0 ? [...cloudGames, ...mockStore.games] : [...mockStore.games];

  const { games: authoritativeGames, idRemap } = deduplicateGamesList(combinedSource, {
    preferredCloudIds,
    isCustomLogo: isCustomUploadedGameLogo,
  });

  if (cloudGames.length > 0 || idRemap.size > 0) {
    mockStore.games = authoritativeGames;
    const gamesById = new Map<string, Game>(authoritativeGames.map((g) => [g.id, g]));
    remapInMemoryStoreIds(idRemap, gamesById);
  }

  // Cuando hay juegos en Supabase, solo sincronizamos los que existen en Supabase (o todos los canónicos si no hay Supabase)
  const targetGames: Game[] =
    cloudGames.length > 0
      ? deduplicateGamesList(cloudGames, {
          preferredCloudIds,
          isCustomLogo: isCustomUploadedGameLogo,
        }).games
      : authoritativeGames;

  const automaticGames = targetGames.filter((g) => {
    const effectiveMode = (g.mode ?? g.loading_mode ?? "automatic").toLowerCase();
    return effectiveMode === "automatic" && g.is_active !== false;
  });

  const providerMap = options?.providersOverride ?? providersByCanonicalSlug;
  const useCloudSkipCache = options?.supabaseClient === undefined;
  resetPersistedDrawCacheIfNewDay();

  // Run all games concurrently (upstream HTML pages are already deduplicated/cached in tuazar-provider.server)
  const reports: SyncReport[] = await Promise.all(
    automaticGames.map(async (game): Promise<SyncReport> => {
      const canonicalSlug = normalizeGameSlug(game.slug, game.name) as CanonicalGameSlug;
      const provider = providerMap[canonicalSlug] ?? providerMap[game.slug];

      try {
        const syncGame: SyncGame = {
          id: game.id,
          slug: canonicalSlug || game.slug,
          loading_mode: "automatic",
          mode: "automatic",
          is_active: game.is_active !== false,
        };

        return await synchronizeGame(syncGame, provider, async (draw) => {
          const localPayload = {
            p_game_id: game.id,
            p_game_slug: canonicalSlug || game.slug,
            p_draw_date: draw.draw_date,
            p_draw_time: draw.draw_time,
            p_animal_number: draw.animal_number,
            p_animal_name: draw.animal_name,
          };
          const { data: localData } = await mockSupabase.rpc("sync_automatic_result", localPayload);

          const drawKey = makeDrawPersistKey(
            game.id,
            draw.draw_date,
            draw.draw_time,
            draw.animal_number,
            draw.animal_name,
          );
          if (useCloudSkipCache && persistedCloudDrawKeys.has(drawKey)) {
            return localData === true;
          }

          const cloudResult = await persistAutomaticDrawToSupabase(
            realClient,
            game.id,
            canonicalSlug || game.slug,
            draw,
          );
          if (useCloudSkipCache && cloudResult !== null) {
            persistedCloudDrawKeys.add(drawKey);
          }
          return localData === true || cloudResult === true;
        });
      } catch {
        return { game_id: game.id, status: "error", written: 0, preserved: 0 };
      }
    }),
  );

  return reports;
}
