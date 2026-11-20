// Server-only adapter: reads today's results with LoteriaDeHoy as primary source
// and TuAzar as safety fallback, normalizing them for sync_automatic_result.
// The origins are fixed in code; no user-supplied URLs are ever fetched.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { mockStore } from "@/lib/mock-db";
import type { ResultsProvider, SyncGame } from "@/lib/result-sync";
import { hourTo24h, normalizeName, parseTuazarResults, type TuazarPage } from "@/lib/tuazar-parser";
import {
  parseLoteriaDeHoyResults,
  matchGameClass,
  LOTERIADEHOY_GAME_MAPPINGS,
  type LoteriaDeHoyPage,
} from "@/lib/loteriadehoy-parser";
import { getGameScheduleTimes, normalizeScheduleTime } from "@/lib/game-schedules";
import { resolveCanonicalAnimal, SLUG_TO_GAME_ID } from "@/lib/official-animals";
import { normalizeGameSlug } from "@/lib/game-slugs";
import { lotteryDate } from "@/lib/lottery-date";

export const LOTERIADEHOY_PRIMARY_URL = "https://loteriadehoy.com/animalitos/resultados/";
export const TUAZAR_PRIMARY_URL = "https://tuazar.com/loteria/animalitos/resultados/";
export const TUAZAR_FALLBACK_URL = "https://www.tuazar.com/loteria/animalitos/resultados/";

const FETCH_TIMEOUT_MS = 6_000;
const SNAPSHOT_TTL_MS = 20_000;

const BROWSER_HEADERS: Record<string, string> = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "es-VE,es;q=0.9,en;q=0.8",
  "Cache-Control": "no-cache",
};

// Game slug (canonical + legacy aliases) -> game name as printed by tuazar.com.
export const TUAZAR_GAME_NAMES: Readonly<Record<string, string>> = {
  "lotto-activo": "LOTTO ACTIVO",
  "guacharo-activo": "GUACHARO ACTIVO",
  guacharo: "GUACHARO ACTIVO",
  "el-guacharito-millonario": "EL GUACHARITO MILLONARIO",
  guacharito: "EL GUACHARITO MILLONARIO",
  "selva-plus": "SELVA PLUS",
  "loto-chaim-a": "LOTO CHAIMA",
  "la-granjita": "LA GRANJITA",
  granjita: "LA GRANJITA",
  "monje-millonario": "MONJE MILLONARIO",
  "lotto-activo-internacional": "LOTTO ACTIVO RD INTERNACIONAL",
  "la-ricachona": "LA RICACHONA",
};

let ldhSnapshot: { at: number; page: Promise<LoteriaDeHoyPage> } | null = null;
let tuazarSnapshot: { at: number; page: Promise<TuazarPage> } | null = null;

async function fetchHtmlWithTimeout(url: string): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      headers: BROWSER_HEADERS,
      signal: controller.signal,
      redirect: "follow",
    });
    if (!response.ok) throw new Error(`HTTP ${response.status} from ${url}`);
    return await response.text();
  } finally {
    clearTimeout(timer);
  }
}

async function downloadLoteriaDeHoyPage(): Promise<LoteriaDeHoyPage> {
  const html = await fetchHtmlWithTimeout(LOTERIADEHOY_PRIMARY_URL);
  return parseLoteriaDeHoyResults(html);
}

function getLoteriaDeHoyPage(): Promise<LoteriaDeHoyPage> {
  const now = Date.now();
  if (ldhSnapshot && now - ldhSnapshot.at < SNAPSHOT_TTL_MS) return ldhSnapshot.page;
  const page = downloadLoteriaDeHoyPage();
  ldhSnapshot = { at: now, page };
  page.catch(() => {
    if (ldhSnapshot?.page === page) ldhSnapshot = null;
  });
  return page;
}

async function downloadTuazarPage(): Promise<TuazarPage> {
  try {
    const html = await fetchHtmlWithTimeout(TUAZAR_PRIMARY_URL);
    return parseTuazarResults(html);
  } catch {
    try {
      const fallbackHtml = await fetchHtmlWithTimeout(TUAZAR_FALLBACK_URL);
      return parseTuazarResults(fallbackHtml);
    } catch {
      return { date: todayInCaracas(), results: [] };
    }
  }
}

function getTuazarPage(): Promise<TuazarPage> {
  const now = Date.now();
  if (tuazarSnapshot && now - tuazarSnapshot.at < SNAPSHOT_TTL_MS) return tuazarSnapshot.page;
  const page = downloadTuazarPage();
  tuazarSnapshot = { at: now, page };
  page.catch(() => {
    if (tuazarSnapshot?.page === page) tuazarSnapshot = null;
  });
  return page;
}

function todayInCaracas(): string {
  return lotteryDate();
}

export function createTuazarProvider(tuazarGameName: string, gameSlug?: string): ResultsProvider {
  const wantedTuazar = normalizeName(tuazarGameName);
  const rawTargetSlug =
    gameSlug ??
    Object.entries(TUAZAR_GAME_NAMES).find(([, name]) => normalizeName(name) === wantedTuazar)?.[0];
  const targetSlug = rawTargetSlug ? normalizeGameSlug(rawTargetSlug) : undefined;
  const ldhMeta = targetSlug
    ? (LOTERIADEHOY_GAME_MAPPINGS[targetSlug] ??
      (rawTargetSlug ? LOTERIADEHOY_GAME_MAPPINGS[rawTargetSlug] : undefined))
    : undefined;

  return {
    async fetchResults(game: SyncGame): Promise<unknown[]> {
      const effectiveSlug = targetSlug ?? normalizeGameSlug(game.slug);
      // 1. Fetch game catalog for valid matching
      let catalogEntries: Array<{ number: number; name: string; label?: string }> = [];
      try {
        const { data: entries, error } = await supabaseAdmin
          .from("animal_entries")
          .select("number, name, label")
          .eq("game_id", game.id);
        if (!error && Array.isArray(entries) && entries.length > 0) {
          catalogEntries = entries;
        }
      } catch {
        // Fallback to mockStore.animal_entries
      }
      if (catalogEntries.length === 0) {
        catalogEntries = mockStore.animal_entries.filter((e) => e.game_id === game.id);
      }
      if (catalogEntries.length === 0 && effectiveSlug) {
        const defaultUuid = SLUG_TO_GAME_ID[effectiveSlug];
        if (defaultUuid) {
          catalogEntries = mockStore.animal_entries.filter((e) => e.game_id === defaultUuid);
        }
      }
      const scheduledTimes = getGameScheduleTimes(effectiveSlug || game.slug);
      const validScheduleSet = new Set(scheduledTimes.map((t) => normalizeScheduleTime(t) ?? t));
      if (effectiveSlug === "la-ricachona") {
        for (const t of getGameScheduleTimes("la-ricachona")) {
          validScheduleSet.add(normalizeScheduleTime(t) ?? t);
        }
      }

      // 2. Primary Source: LoteriaDeHoy (faster updates, structured HTML)
      if (ldhMeta) {
        try {
          const ldhPage = await getLoteriaDeHoyPage();
          const drawDate = ldhPage.date ?? todayInCaracas();

          const ldhDraws = ldhPage.results.filter(
            (r) =>
              matchGameClass(r.gameClass, ldhMeta.className) ||
              r.gameClass === ldhMeta.className.toLowerCase(),
          );

          if (ldhDraws.length > 0) {
            const draws: unknown[] = [];
            for (const item of ldhDraws) {
              const drawTime = item.drawTime;
              if (!drawTime) continue;

              const normTime = normalizeScheduleTime(drawTime) ?? drawTime;
              if (!validScheduleSet.has(normTime)) continue;

              const canonical = resolveCanonicalAnimal(
                targetSlug ?? game.slug,
                item.number,
                item.animal,
              );
              const normAnimal = normalizeName(item.animal);

              let matchedEntry = catalogEntries.find((entry) => {
                if (item.number === "00" || normAnimal === "BALLENA") {
                  return entry.label === "00" || normalizeName(entry.name) === "BALLENA";
                }
                if (item.number === "0" || normAnimal === "DELFIN") {
                  return (
                    (entry.number === 0 && entry.label !== "00") ||
                    normalizeName(entry.name) === "DELFIN"
                  );
                }
                return entry.number === canonical.number;
              });

              if (!matchedEntry) {
                matchedEntry = catalogEntries.find((e) => normalizeName(e.name) === normAnimal);
              }

              const finalAnimalNumber = matchedEntry ? matchedEntry.number : canonical.number;
              const finalAnimalName = matchedEntry ? matchedEntry.name : canonical.name;

              draws.push({
                draw_date: drawDate,
                draw_time: drawTime,
                animal_number: finalAnimalNumber,
                animal_name: finalAnimalName,
              });
            }

            if (draws.length > 0) {
              return draws;
            }
          }
        } catch {
          // LoteriaDeHoy unavailable or no matching draws; cleanly use TuAzar fallback
        }
      }

      // 3. Fallback Source: TuAzar
      try {
        const page = await getTuazarPage();
        const drawDate = page.date ?? todayInCaracas();
        const draws: unknown[] = [];

        for (const result of page.results) {
          if (normalizeName(result.game) !== wantedTuazar) continue;
          const drawTime = hourTo24h(result.hour);
          if (!drawTime) continue;

          const normTime = normalizeScheduleTime(drawTime) ?? drawTime;
          if (!validScheduleSet.has(normTime)) continue;

          const canonical = resolveCanonicalAnimal(
            targetSlug ?? game.slug,
            result.number,
            result.animal,
          );
          const normalizedResultAnimal = normalizeName(result.animal);

          let matchedEntry = catalogEntries.find((entry) => {
            if (result.number === "00" || normalizedResultAnimal === "BALLENA") {
              return entry.label === "00" || normalizeName(entry.name) === "BALLENA";
            }
            if (result.number === "0" || normalizedResultAnimal === "DELFIN") {
              return (
                (entry.number === 0 && entry.label !== "00") ||
                normalizeName(entry.name) === "DELFIN"
              );
            }
            return entry.number === canonical.number;
          });

          if (!matchedEntry) {
            matchedEntry = catalogEntries.find(
              (e) => normalizeName(e.name) === normalizedResultAnimal,
            );
          }

          const finalAnimalNumber = matchedEntry ? matchedEntry.number : canonical.number;
          const finalAnimalName = matchedEntry ? matchedEntry.name : canonical.name;

          draws.push({
            draw_date: drawDate,
            draw_time: drawTime,
            animal_number: finalAnimalNumber,
            animal_name: finalAnimalName,
          });
        }

        return draws;
      } catch {
        return [];
      }
    },
  };
}
