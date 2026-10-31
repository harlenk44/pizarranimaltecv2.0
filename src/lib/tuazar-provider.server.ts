// Server-only adapter: reads today's results with LoteriaDeHoy as primary source
// and TuAzar as safety fallback, normalizing them for sync_automatic_result.
// The origins are fixed in code; no user-supplied URLs are ever fetched.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { ResultsProvider, SyncGame } from "@/lib/result-sync";
import { hourTo24h, normalizeName, parseTuazarResults, type TuazarPage } from "@/lib/tuazar-parser";
import {
  parseLoteriaDeHoyResults,
  matchGameClass,
  LOTERIADEHOY_GAME_MAPPINGS,
  type LoteriaDeHoyPage,
} from "@/lib/loteriadehoy-parser";

export const LOTERIADEHOY_PRIMARY_URL = "https://loteriadehoy.com/animalitos/resultados/";
export const TUAZAR_PRIMARY_URL = "https://tuazar.com/loteria/animalitos/resultados/";
export const TUAZAR_FALLBACK_URL = "https://www.tuazar.com/loteria/animalitos/resultados/";

const FETCH_TIMEOUT_MS = 10_000;
const SNAPSHOT_TTL_MS = 20_000;
const TIMEZONE = "America/Caracas";

const BROWSER_HEADERS: Record<string, string> = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "es-VE,es;q=0.9,en;q=0.8",
  "Cache-Control": "no-cache",
};

// Game slug in this app -> game name as printed by tuazar.com.
export const TUAZAR_GAME_NAMES: Readonly<Record<string, string>> = {
  "lotto-activo": "LOTTO ACTIVO",
  guacharo: "GUACHARO ACTIVO",
  guacharito: "EL GUACHARITO MILLONARIO",
  "selva-plus": "SELVA PLUS",
  "loto-chaim-a": "LOTO CHAIMA",
  granjita: "LA GRANJITA",
  "monje-millonario": "MONJE MILLONARIO",
  "lotto-activo-internacional": "LOTTO ACTIVO RD INTERNACIONAL",
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
  } catch (primaryErr) {
    console.warn(`[tuazar] Primary fetch failed (${primaryErr}), trying fallback`);
    const fallbackHtml = await fetchHtmlWithTimeout(TUAZAR_FALLBACK_URL);
    return parseTuazarResults(fallbackHtml);
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
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export function createTuazarProvider(tuazarGameName: string, gameSlug?: string): ResultsProvider {
  const wantedTuazar = normalizeName(tuazarGameName);
  const targetSlug =
    gameSlug ??
    Object.entries(TUAZAR_GAME_NAMES).find(([, name]) => normalizeName(name) === wantedTuazar)?.[0];
  const ldhMeta = targetSlug ? LOTERIADEHOY_GAME_MAPPINGS[targetSlug] : undefined;

  return {
    async fetchResults(game: SyncGame): Promise<unknown[]> {
      // 1. Fetch game catalog for valid matching
      const { data: entries, error } = await supabaseAdmin
        .from("animal_entries")
        .select("number, name, label")
        .eq("game_id", game.id);
      if (error) throw error;
      const catalogEntries = entries ?? [];

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

              const normAnimal = normalizeName(item.animal);
              const numVal = Number(item.number);

              let matchedEntry = catalogEntries.find((entry) => {
                const nameMatches = normalizeName(entry.name) === normAnimal;
                if (!nameMatches) return false;
                const directNum = entry.number === numVal;
                const labelMatch = entry.label === item.number;
                const ballenaMatch =
                  (item.number === "00" || item.number === "0") &&
                  normalizeName(entry.name) === "BALLENA";
                const delfinMatch =
                  (item.number === "0" || item.number === "00") &&
                  normalizeName(entry.name) === "DELFIN";
                return directNum || labelMatch || ballenaMatch || delfinMatch;
              });

              if (!matchedEntry) {
                if (item.number === "00" || normAnimal === "BALLENA") {
                  matchedEntry = catalogEntries.find(
                    (e) => e.label === "00" || normalizeName(e.name) === "BALLENA",
                  );
                } else if (item.number === "0" || normAnimal === "DELFIN") {
                  matchedEntry = catalogEntries.find(
                    (e) => e.number === 0 || normalizeName(e.name) === "DELFIN",
                  );
                }
              }

              if (!matchedEntry && numVal > 0) {
                matchedEntry = catalogEntries.find((e) => e.number === numVal);
              }

              if (!matchedEntry) {
                matchedEntry = catalogEntries.find((e) => normalizeName(e.name) === normAnimal);
              }

              const finalAnimalNumber = matchedEntry
                ? matchedEntry.number
                : !Number.isNaN(numVal)
                  ? numVal
                  : 0;
              const finalAnimalName = matchedEntry ? matchedEntry.name : item.animal;

              draws.push({
                draw_date: drawDate,
                draw_time: drawTime,
                animal_number: finalAnimalNumber,
                animal_name: finalAnimalName,
              });

              if (item.imageUrl) {
                try {
                  await supabaseAdmin.from("animal_images").upsert(
                    {
                      game_id: game.id,
                      animal_number: finalAnimalNumber,
                      image_url: item.imageUrl,
                      updated_at: new Date().toISOString(),
                    },
                    { onConflict: "game_id,animal_number" },
                  );
                } catch {
                  // ignore
                }
              }
            }

            if (draws.length > 0) {
              return draws;
            }
          }
        } catch (ldhErr) {
          console.warn(
            `[sync-primary] LoteriaDeHoy failed for ${game.slug} (${ldhErr}), switching to TuAzar fallback`,
          );
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

          const normalizedResultAnimal = normalizeName(result.animal);
          const numVal = Number(result.number);

          let matchedEntry = catalogEntries.find((entry) => {
            const nameMatches = normalizeName(entry.name) === normalizedResultAnimal;
            if (!nameMatches) return false;
            const directNum = entry.number === numVal;
            const labelMatch = entry.label === result.number;
            const ballenaMatch =
              (result.number === "00" || result.number === "0") &&
              normalizeName(entry.name) === "BALLENA";
            const delfinMatch =
              (result.number === "0" || result.number === "00") &&
              normalizeName(entry.name) === "DELFIN";
            return directNum || labelMatch || ballenaMatch || delfinMatch;
          });

          if (!matchedEntry) {
            if (result.number === "00" || normalizedResultAnimal === "BALLENA") {
              matchedEntry = catalogEntries.find(
                (e) => e.label === "00" || normalizeName(e.name) === "BALLENA",
              );
            } else if (result.number === "0" || normalizedResultAnimal === "DELFIN") {
              matchedEntry = catalogEntries.find(
                (e) => e.number === 0 || normalizeName(e.name) === "DELFIN",
              );
            }
          }

          if (!matchedEntry && numVal > 0) {
            matchedEntry = catalogEntries.find((e) => e.number === numVal);
          }

          if (!matchedEntry) {
            matchedEntry = catalogEntries.find(
              (e) => normalizeName(e.name) === normalizedResultAnimal,
            );
          }

          const finalAnimalNumber = matchedEntry
            ? matchedEntry.number
            : !Number.isNaN(numVal)
              ? numVal
              : 0;
          const finalAnimalName = matchedEntry ? matchedEntry.name : result.animal;

          draws.push({
            draw_date: drawDate,
            draw_time: drawTime,
            animal_number: finalAnimalNumber,
            animal_name: finalAnimalName,
          });

          if (result.imageUrl) {
            try {
              await supabaseAdmin.from("animal_images").upsert(
                {
                  game_id: game.id,
                  animal_number: finalAnimalNumber,
                  image_url: result.imageUrl,
                  updated_at: new Date().toISOString(),
                },
                { onConflict: "game_id,animal_number" },
              );
            } catch {
              // ignore
            }
          }

          if (result.gameLogoUrl) {
            try {
              await supabaseAdmin
                .from("games")
                .update({ logo_url: result.gameLogoUrl })
                .eq("id", game.id);
            } catch {
              // ignore
            }
          }
        }

        return draws;
      } catch (tuazarErr) {
        console.error(`[sync-fallback] TuAzar also failed for ${game.slug}:`, tuazarErr);
        return [];
      }
    },
  };
}
