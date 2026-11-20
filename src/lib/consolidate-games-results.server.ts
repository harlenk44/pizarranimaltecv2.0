import type { Game, Result } from "@/lib/types";
import {
  LEGACY_GAME_UUID_TO_CANONICAL_SLUG,
  deduplicateGamesList,
  normalizeGameSlug,
} from "@/lib/game-slugs";
import { isCustomUploadedGameLogo } from "@/lib/game-logos";
import { mockStore } from "@/lib/mock-db";

export interface ConsolidationReport {
  ok: boolean;
  canonicalGamesCount: number;
  normalizedSlugs: Array<{ gameId: string; fromSlug: string; toSlug: string }>;
  deduplicatedGames: Array<{
    removedId: string;
    removedSlug: string;
    mergedIntoId: string;
    canonicalSlug: string;
  }>;
  migratedResults: number;
  deletedConflictResults: number;
  backfilledGameSlugs: number;
  unresolvedOrphans: Array<{ orphanGameId: string; count: number; sampleDrawTimes: string[] }>;
  errors: string[];
}

interface RawResultRow {
  id: string;
  game_id: string;
  game_slug?: string | null;
  draw_date: string;
  draw_time: string;
  animal_number: number;
  animal_name: string;
  source?: string | null;
  created_at?: string | null;
}

interface RawGameRow {
  id: string;
  name?: string | null;
  slug?: string | null;
  color?: string | null;
  logo_url?: string | null;
  display_order?: number | null;
  is_active?: boolean | null;
  loading_mode?: string | null;
  schedule_times?: string[] | null;
  created_at?: string | null;
}

function isMissingColumnError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { code?: unknown; message?: unknown };
  const code = typeof e.code === "string" ? e.code : "";
  const msg = typeof e.message === "string" ? e.message.toLowerCase() : "";
  return (
    code === "42703" ||
    code === "PGRST204" ||
    msg.includes("could not find the 'game_slug' column") ||
    msg.includes('column "game_slug"') ||
    msg.includes("game_slug does not exist")
  );
}

function extractMinute(drawTime?: string | null): string | null {
  if (!drawTime) return null;
  const match = /^\d{1,2}:(\d{2})/.exec(drawTime.trim());
  return match ? match[1]! : null;
}

/**
 * Infers the canonical slug for a group of orphaned results sharing the same orphan `game_id`.
 * Order of precedence:
 *  1. Explicit override map (if supplied)
 *  2. `game_slug` column on any row in the group
 *  3. Known legacy hardcoded UUID map (`LEGACY_GAME_UUID_TO_CANONICAL_SLUG`)
 *  4. Exact draw overlap against known official results (same draw_date + draw_time + animal_number)
 *  5. Unique schedule-minute + max animal_number fingerprint
 */
export function inferCanonicalSlugForOrphanGroup(
  orphanGameId: string,
  orphanRows: RawResultRow[],
  officialGamesBySlug: Map<string, { id: string; slug: string }>,
  knownOfficialResults: RawResultRow[] = [],
  explicitOverrides?: Record<string, string>,
): string | null {
  const idLower = orphanGameId.trim().toLowerCase();

  // 1. Explicit override
  if (explicitOverrides) {
    const override = explicitOverrides[orphanGameId] ?? explicitOverrides[idLower];
    if (override) {
      const norm = normalizeGameSlug(override);
      if (norm && officialGamesBySlug.has(norm)) return norm;
    }
  }

  // 2. game_slug present on orphan rows
  for (const row of orphanRows) {
    if (typeof row.game_slug === "string" && row.game_slug.trim()) {
      const norm = normalizeGameSlug(row.game_slug);
      if (norm && officialGamesBySlug.has(norm)) return norm;
    }
  }

  // 3. Legacy hardcoded UUID
  const legacySlug = LEGACY_GAME_UUID_TO_CANONICAL_SLUG[idLower];
  if (legacySlug && officialGamesBySlug.has(legacySlug)) {
    return legacySlug;
  }

  // 4. Exact draw overlap with existing official results
  if (knownOfficialResults.length > 0 && orphanRows.length > 0) {
    const idToSlug = new Map<string, string>();
    for (const [slug, g] of officialGamesBySlug.entries()) {
      idToSlug.set(g.id, slug);
    }
    const overlapScores = new Map<string, number>();
    for (const orphan of orphanRows) {
      for (const known of knownOfficialResults) {
        const knownSlug = idToSlug.get(known.game_id);
        if (!knownSlug) continue;
        if (
          known.draw_date === orphan.draw_date &&
          known.draw_time === orphan.draw_time &&
          known.animal_number === orphan.animal_number
        ) {
          overlapScores.set(knownSlug, (overlapScores.get(knownSlug) ?? 0) + 1);
        }
      }
    }
    const ranked = Array.from(overlapScores.entries()).sort((a, b) => b[1] - a[1]);
    if (ranked.length === 1 && ranked[0]![1] >= 1) {
      return ranked[0]![0];
    }
    if (ranked.length > 1 && ranked[0]![1] > ranked[1]![1] && ranked[0]![1] >= 2) {
      return ranked[0]![0];
    }
  }

  // 5. Unique schedule minute + animal number range fingerprint
  const minutes = new Set<string>();
  let maxAnimalNum = -1;
  for (const row of orphanRows) {
    const mm = extractMinute(row.draw_time);
    if (mm) minutes.add(mm);
    if (typeof row.animal_number === "number" && row.animal_number > maxAnimalNum) {
      maxAnimalNum = row.animal_number;
    }
  }

  if (minutes.size === 1) {
    const onlyMin = Array.from(minutes)[0]!;
    if (onlyMin === "05" && officialGamesBySlug.has("monje-millonario")) {
      return "monje-millonario";
    }
    if (onlyMin === "10" && officialGamesBySlug.has("la-ricachona")) {
      return "la-ricachona";
    }
    if (onlyMin === "15" && officialGamesBySlug.has("selva-plus")) {
      return "selva-plus";
    }
    if (onlyMin === "30") {
      if (maxAnimalNum > 37 && officialGamesBySlug.has("el-guacharito-millonario")) {
        return "el-guacharito-millonario";
      }
    }
    if (onlyMin === "00") {
      if (maxAnimalNum > 56 && officialGamesBySlug.has("guacharo-activo")) {
        return "guacharo-activo";
      }
      if (maxAnimalNum > 49 && maxAnimalNum <= 56 && officialGamesBySlug.has("loto-chaim-a")) {
        return "loto-chaim-a";
      }
      if (maxAnimalNum > 37 && maxAnimalNum <= 49 && officialGamesBySlug.has("lottopantera")) {
        return "lottopantera";
      }
    }
  }

  return null;
}

/**
 * Remaps in-memory `mockStore` references (`results`, `animal_entries`, `animal_images`)
 * from old/duplicate game IDs to canonical official game IDs, resolving conflicts cleanly
 * while preserving `manual` overrides.
 */
export function remapInMemoryStoreIds(
  idRemap: Map<string, string>,
  gamesById: Map<string, Game>,
): number {
  let remappedCount = 0;

  // 1. Remap and deduplicate results
  const dedupedResults = new Map<string, Result>();
  for (const r of mockStore.results) {
    if (!r || !r.game_id) continue;
    const nextGameId = idRemap.get(r.game_id) ?? r.game_id;
    if (nextGameId !== r.game_id) {
      remappedCount++;
    }
    const officialGame = gamesById.get(nextGameId);
    const canonicalSlug = officialGame
      ? normalizeGameSlug(officialGame.slug, officialGame.name)
      : r.game_slug
        ? normalizeGameSlug(r.game_slug)
        : undefined;

    const normalizedResult: Result = {
      ...r,
      game_id: nextGameId,
      ...(canonicalSlug ? { game_slug: canonicalSlug } : {}),
    };

    const key = `${normalizedResult.game_id}|${normalizedResult.draw_date}|${normalizedResult.draw_time}`;
    const existing = dedupedResults.get(key);
    if (!existing) {
      dedupedResults.set(key, normalizedResult);
    } else if (existing.source !== "manual" && normalizedResult.source === "manual") {
      dedupedResults.set(key, normalizedResult);
    }
  }
  mockStore.results = Array.from(dedupedResults.values());

  // 2. Remap animal_entries
  if (idRemap.size > 0) {
    const seenEntries = new Set<string>();
    const nextEntries: typeof mockStore.animal_entries = [];
    for (const entry of mockStore.animal_entries) {
      const nextGameId = idRemap.get(entry.game_id) ?? entry.game_id;
      const key = `${nextGameId}|${entry.number}`;
      if (seenEntries.has(key)) continue;
      seenEntries.add(key);
      nextEntries.push({
        ...entry,
        game_id: nextGameId,
      });
    }
    mockStore.animal_entries = nextEntries;

    // 3. Remap animal_images
    const seenImages = new Map<string, (typeof mockStore.animal_images)[number]>();
    for (const img of mockStore.animal_images) {
      const nextGameId = idRemap.get(img.game_id) ?? img.game_id;
      const key = `${nextGameId}|${img.animal_number}`;
      const existing = seenImages.get(key);
      if (!existing) {
        seenImages.set(key, { ...img, game_id: nextGameId });
      }
    }
    mockStore.animal_images = Array.from(seenImages.values());
  }

  return remappedCount;
}

/**
 * Normalizes and deduplicates `mockStore.games` by canonical slug and consolidates any
 * orphaned `mockStore.results` to the official `game.id` and `game_slug`.
 */
export function consolidateInMemoryGamesAndResults(options?: {
  preferredCloudIds?: Set<string>;
  explicitOrphanOverrides?: Record<string, string>;
}): { idRemap: Map<string, string>; remappedResults: number } {
  const { games: dedupedGames, idRemap } = deduplicateGamesList(mockStore.games, {
    preferredCloudIds: options?.preferredCloudIds,
    isCustomLogo: isCustomUploadedGameLogo,
  });
  mockStore.games = dedupedGames;

  const gamesById = new Map<string, Game>();
  const gamesBySlug = new Map<string, Game>();
  for (const g of mockStore.games) {
    gamesById.set(g.id, g);
    gamesBySlug.set(g.slug, g);
  }

  // Group any remaining orphan results in mockStore.results
  const orphanGroups = new Map<string, RawResultRow[]>();
  const knownOfficialResults: RawResultRow[] = [];
  for (const r of mockStore.results) {
    if (!r || !r.game_id) continue;
    const mappedId = idRemap.get(r.game_id) ?? r.game_id;
    if (gamesById.has(mappedId)) {
      knownOfficialResults.push({ ...r, game_id: mappedId });
    } else {
      const group = orphanGroups.get(r.game_id) ?? [];
      group.push(r);
      orphanGroups.set(r.game_id, group);
    }
  }

  for (const [orphanGameId, rows] of orphanGroups.entries()) {
    const inferredSlug = inferCanonicalSlugForOrphanGroup(
      orphanGameId,
      rows,
      gamesBySlug,
      knownOfficialResults,
      options?.explicitOrphanOverrides,
    );
    if (inferredSlug) {
      const officialGame = gamesBySlug.get(inferredSlug);
      if (officialGame) {
        idRemap.set(orphanGameId, officialGame.id);
      }
    }
  }

  const remappedResults = remapInMemoryStoreIds(idRemap, gamesById);
  return { idRemap, remappedResults };
}

/**
 * Ejecuta la normalización de `games` (eliminando duplicados por alias de slug) y la
 * consolidación de `results` huérfanos directamente contra Supabase.
 * Preserva siempre las correcciones manuales (`source = 'manual'`) ante conflictos.
 */

export async function consolidateGamesAndOrphanResultsInSupabase(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  client: any,
  options?: {
    onlyDate?: string;
    explicitOrphanOverrides?: Record<string, string>;
    dryRun?: boolean;
  },
): Promise<ConsolidationReport> {
  const report: ConsolidationReport = {
    ok: true,
    canonicalGamesCount: 0,
    normalizedSlugs: [],
    deduplicatedGames: [],
    migratedResults: 0,
    deletedConflictResults: 0,
    backfilledGameSlugs: 0,
    unresolvedOrphans: [],
    errors: [],
  };

  if (!client) {
    report.ok = false;
    report.errors.push("Cliente de Supabase no configurado.");
    return report;
  }

  const dryRun = Boolean(options?.dryRun);

  // 1. Cargar todos los juegos desde Supabase
  const { data: rawGames, error: gamesError } = await client
    .from("games")
    .select("*")
    .order("display_order", { ascending: true });

  if (gamesError || !Array.isArray(rawGames)) {
    report.ok = false;
    report.errors.push(
      `Error consultando tabla games: ${gamesError?.message || String(gamesError)}`,
    );
    return report;
  }

  const gamesList = rawGames as RawGameRow[];
  const groups = new Map<string, RawGameRow[]>();
  for (const row of gamesList) {
    if (!row?.id) continue;
    const canonicalSlug = normalizeGameSlug(row.slug || row.id, row.name);
    if (!canonicalSlug) continue;
    const arr = groups.get(canonicalSlug) ?? [];
    arr.push(row);
    groups.set(canonicalSlug, arr);
  }

  const pickOfficialGameRow = (rows: RawGameRow[], canonicalSlug: string): RawGameRow => {
    return [...rows].sort((a, b) => {
      const aExact = (a.slug || "").trim().toLowerCase() === canonicalSlug ? 0 : 1;
      const bExact = (b.slug || "").trim().toLowerCase() === canonicalSlug ? 0 : 1;
      if (aExact !== bExact) return aExact - bExact;
      const aActive = a.is_active !== false ? 0 : 1;
      const bActive = b.is_active !== false ? 0 : 1;
      if (aActive !== bActive) return aActive - bActive;
      const aOrder = typeof a.display_order === "number" ? a.display_order : 999;
      const bOrder = typeof b.display_order === "number" ? b.display_order : 999;
      if (aOrder !== bOrder) return aOrder - bOrder;
      return String(a.created_at || "").localeCompare(String(b.created_at || ""));
    })[0]!;
  };

  const officialGamesBySlug = new Map<string, RawGameRow>();
  const officialGameIds = new Set<string>();
  const duplicateGameIdToCanonical = new Map<string, { targetId: string; canonicalSlug: string }>();

  for (const [canonicalSlug, rows] of groups.entries()) {
    const winner = pickOfficialGameRow(rows, canonicalSlug);
    officialGamesBySlug.set(canonicalSlug, winner);
    officialGameIds.add(winner.id);

    for (const row of rows) {
      if (row.id !== winner.id) {
        duplicateGameIdToCanonical.set(row.id, {
          targetId: winner.id,
          canonicalSlug,
        });
      }
    }
  }

  report.canonicalGamesCount = officialGamesBySlug.size;

  // Helper para migrar un conjunto de resultados desde un `fromGameId` hacia un `toGameId` + `canonicalSlug`
  let hasGameSlugColumn = true;
  const migrateResultRow = async (
    orphanRow: RawResultRow,
    targetGameId: string,
    canonicalSlug: string,
    existingTargetBySlot: Map<string, RawResultRow>,
  ) => {
    const slotKey = `${targetGameId}|${orphanRow.draw_date}|${orphanRow.draw_time}`;
    const existing = existingTargetBySlot.get(slotKey);

    if (existing) {
      // Conflicto en el mismo sorteo: preservar siempre `manual`
      if (existing.source !== "manual" && orphanRow.source === "manual") {
        if (!dryRun) {
          const updatePayload: Record<string, unknown> = {
            animal_number: orphanRow.animal_number,
            animal_name: orphanRow.animal_name,
            source: "manual",
            ...(hasGameSlugColumn ? { game_slug: canonicalSlug } : {}),
          };
          let { error: upErr } = await client
            .from("results")
            .update(updatePayload)
            .eq("id", existing.id);
          if (upErr && isMissingColumnError(upErr)) {
            hasGameSlugColumn = false;
            delete updatePayload["game_slug"];
            const retry = await client.from("results").update(updatePayload).eq("id", existing.id);
            upErr = retry.error;
          }
          if (upErr) {
            report.errors.push(
              `Error promoviendo resultado manual ${existing.id}: ${upErr.message}`,
            );
            return;
          }
          existing.source = "manual";
          existing.animal_number = orphanRow.animal_number;
          existing.animal_name = orphanRow.animal_name;
        }
      }
      if (!dryRun) {
        const { error: delErr } = await client.from("results").delete().eq("id", orphanRow.id);
        if (delErr) {
          report.errors.push(`Error eliminando duplicado ${orphanRow.id}: ${delErr.message}`);
          return;
        }
      }
      report.deletedConflictResults++;
      return;
    }

    // Sin conflicto: reasignar `game_id` (y `game_slug` si existe la columna)
    if (!dryRun) {
      const updatePayload: Record<string, unknown> = {
        game_id: targetGameId,
        ...(hasGameSlugColumn ? { game_slug: canonicalSlug } : {}),
      };
      let { error: updErr } = await client
        .from("results")
        .update(updatePayload)
        .eq("id", orphanRow.id);
      if (updErr && isMissingColumnError(updErr)) {
        hasGameSlugColumn = false;
        const retry = await client
          .from("results")
          .update({ game_id: targetGameId })
          .eq("id", orphanRow.id);
        updErr = retry.error;
      }
      if (updErr) {
        report.errors.push(
          `Error reasignando resultado ${orphanRow.id} -> ${targetGameId}: ${updErr.message}`,
        );
        return;
      }
    }
    existingTargetBySlot.set(slotKey, {
      ...orphanRow,
      game_id: targetGameId,
      game_slug: canonicalSlug,
    });
    report.migratedResults++;
  };

  // 2. Cargar resultados existentes (todos o los de la fecha solicitada)
  let resultsQuery = client.from("results").select("*");
  if (options?.onlyDate) {
    resultsQuery = resultsQuery.eq("draw_date", options.onlyDate);
  }
  const { data: rawResults, error: resultsError } = await resultsQuery;
  if (resultsError) {
    report.errors.push(`Error consultando tabla results: ${resultsError.message}`);
  }
  const allResults: RawResultRow[] = Array.isArray(rawResults)
    ? (rawResults as RawResultRow[])
    : [];

  const existingOfficialBySlot = new Map<string, RawResultRow>();
  const officialResultsList: RawResultRow[] = [];
  const nonOfficialGroups = new Map<string, RawResultRow[]>();

  for (const row of allResults) {
    if (!row?.id || !row?.game_id) continue;
    if (officialGameIds.has(row.game_id)) {
      const slotKey = `${row.game_id}|${row.draw_date}|${row.draw_time}`;
      existingOfficialBySlot.set(slotKey, row);
      officialResultsList.push(row);
    } else {
      const grp = nonOfficialGroups.get(row.game_id) ?? [];
      grp.push(row);
      nonOfficialGroups.set(row.game_id, grp);
    }
  }

  // 3. Migrar resultados de juegos duplicados y eliminar los juegos duplicados
  for (const [loserId, targetInfo] of duplicateGameIdToCanonical.entries()) {
    const loserGame = gamesList.find((g) => g.id === loserId);
    const loserResults = nonOfficialGroups.get(loserId) ?? [];
    for (const resRow of loserResults) {
      await migrateResultRow(
        resRow,
        targetInfo.targetId,
        targetInfo.canonicalSlug,
        existingOfficialBySlot,
      );
    }
    nonOfficialGroups.delete(loserId);

    if (!dryRun) {
      // Migrar animal_images del juego duplicado (ignorando conflictos)
      try {
        const { data: loserImgs } = await client
          .from("animal_images")
          .select("*")
          .eq("game_id", loserId);
        if (Array.isArray(loserImgs) && loserImgs.length > 0) {
          for (const img of loserImgs as Array<{ id: string; animal_number: number }>) {
            const { data: targetImg } = await client
              .from("animal_images")
              .select("id")
              .eq("game_id", targetInfo.targetId)
              .eq("animal_number", img.animal_number)
              .maybeSingle();
            if (targetImg) {
              await client.from("animal_images").delete().eq("id", img.id);
            } else {
              await client
                .from("animal_images")
                .update({ game_id: targetInfo.targetId })
                .eq("id", img.id);
            }
          }
        }
      } catch {
        // ignore if animal_images doesn't exist or RLS restricts
      }

      // Migrar animal_entries del juego duplicado
      try {
        const { data: loserEntries } = await client
          .from("animal_entries")
          .select("*")
          .eq("game_id", loserId);
        if (Array.isArray(loserEntries) && loserEntries.length > 0) {
          for (const ent of loserEntries as Array<{ id: string; number: number }>) {
            const { data: targetEnt } = await client
              .from("animal_entries")
              .select("id")
              .eq("game_id", targetInfo.targetId)
              .eq("number", ent.number)
              .maybeSingle();
            if (targetEnt) {
              await client.from("animal_entries").delete().eq("id", ent.id);
            } else {
              await client
                .from("animal_entries")
                .update({ game_id: targetInfo.targetId })
                .eq("id", ent.id);
            }
          }
        }
      } catch {
        // ignore
      }

      const { error: delGameErr } = await client.from("games").delete().eq("id", loserId);
      if (delGameErr) {
        report.errors.push(`Error eliminando juego duplicado ${loserId}: ${delGameErr.message}`);
      }
    }

    report.deduplicatedGames.push({
      removedId: loserId,
      removedSlug: String(loserGame?.slug || ""),
      mergedIntoId: targetInfo.targetId,
      canonicalSlug: targetInfo.canonicalSlug,
    });
  }

  // 4. Normalizar `games.slug` al slug canónico en todos los juegos oficiales sobrevivientes
  for (const [canonicalSlug, winner] of officialGamesBySlug.entries()) {
    const currentSlug = String(winner.slug || "").trim();
    if (currentSlug !== canonicalSlug) {
      if (!dryRun) {
        const { error: slugErr } = await client
          .from("games")
          .update({ slug: canonicalSlug })
          .eq("id", winner.id);
        if (slugErr) {
          report.errors.push(
            `Error normalizando slug del juego ${winner.id} (${currentSlug} -> ${canonicalSlug}): ${slugErr.message}`,
          );
          continue;
        }
      }
      report.normalizedSlugs.push({
        gameId: winner.id,
        fromSlug: currentSlug,
        toSlug: canonicalSlug,
      });
    }
  }

  // 5. Consolidar registros huérfanos restantes (cuyo game_id no existe en `games`)
  const officialLookup = new Map<string, { id: string; slug: string }>();
  for (const [slug, g] of officialGamesBySlug.entries()) {
    officialLookup.set(slug, { id: g.id, slug });
  }

  for (const [orphanGameId, orphanRows] of nonOfficialGroups.entries()) {
    const inferredSlug = inferCanonicalSlugForOrphanGroup(
      orphanGameId,
      orphanRows,
      officialLookup,
      officialResultsList,
      options?.explicitOrphanOverrides,
    );

    if (!inferredSlug) {
      report.unresolvedOrphans.push({
        orphanGameId,
        count: orphanRows.length,
        sampleDrawTimes: Array.from(new Set(orphanRows.map((r) => r.draw_time))).slice(0, 6),
      });
      continue;
    }

    const targetGame = officialLookup.get(inferredSlug);
    if (!targetGame) continue;

    for (const row of orphanRows) {
      await migrateResultRow(row, targetGame.id, inferredSlug, existingOfficialBySlot);
    }
  }

  // 6. Backfill `game_slug` en resultados oficiales si existe la columna y está vacía o con alias antiguo
  if (hasGameSlugColumn && !dryRun) {
    const officialIdToSlug = new Map<string, string>();
    for (const [slug, g] of officialGamesBySlug.entries()) {
      officialIdToSlug.set(g.id, slug);
    }

    for (const row of officialResultsList) {
      const canonicalSlug = officialIdToSlug.get(row.game_id);
      if (!canonicalSlug) continue;
      if (row.game_slug !== canonicalSlug) {
        const { error: bfErr } = await client
          .from("results")
          .update({ game_slug: canonicalSlug })
          .eq("id", row.id);
        if (bfErr) {
          if (isMissingColumnError(bfErr)) {
            hasGameSlugColumn = false;
            break;
          }
        } else {
          report.backfilledGameSlugs++;
        }
      }
    }
  }

  report.ok = report.errors.length === 0;
  return report;
}
