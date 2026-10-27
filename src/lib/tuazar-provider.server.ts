// Server-only adapter: reads today's results from tuazar.com and normalizes them for sync_automatic_result.
// The origin is fixed in code; no user-supplied URLs are ever fetched.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { ResultsProvider, SyncGame } from "@/lib/result-sync";
import { hourTo24h, normalizeName, parseTuazarResults, type TuazarPage } from "@/lib/tuazar-parser";

const PRIMARY_SOURCE_URL = "https://tuazar.com/loteria/animalitos/resultados/";
const FALLBACK_SOURCE_URL = "https://www.tuazar.com/loteria/animalitos/resultados/";
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

let snapshot: { at: number; page: Promise<TuazarPage> } | null = null;

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

async function downloadPage(): Promise<TuazarPage> {
  try {
    const html = await fetchHtmlWithTimeout(PRIMARY_SOURCE_URL);
    return parseTuazarResults(html);
  } catch (primaryErr) {
    console.warn(`[tuazar] Primary fetch failed (${primaryErr}), trying fallback`);
    const fallbackHtml = await fetchHtmlWithTimeout(FALLBACK_SOURCE_URL);
    return parseTuazarResults(fallbackHtml);
  }
}

/** One download per sync run: every game shares the same page. */
function getPage(): Promise<TuazarPage> {
  const now = Date.now();
  if (snapshot && now - snapshot.at < SNAPSHOT_TTL_MS) return snapshot.page;
  const page = downloadPage();
  snapshot = { at: now, page };
  page.catch(() => {
    if (snapshot?.page === page) snapshot = null; // never cache a failure
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

export function createTuazarProvider(tuazarGameName: string): ResultsProvider {
  const wanted = normalizeName(tuazarGameName);
  return {
    async fetchResults(game: SyncGame): Promise<unknown[]> {
      const page = await getPage();
      const drawDate = page.date ?? todayInCaracas();

      // Only animals that exist in this game's catalog (with label awareness) are accepted.
      const { data: entries, error } = await supabaseAdmin
        .from("animal_entries")
        .select("number, name, label")
        .eq("game_id", game.id);
      if (error) throw error;
      const catalogEntries = entries ?? [];

      const draws: unknown[] = [];
      for (const result of page.results) {
        if (normalizeName(result.game) !== wanted) continue;
        const drawTime = hourTo24h(result.hour);
        if (!drawTime) continue;

        const normalizedResultAnimal = normalizeName(result.animal);
        const numVal = Number(result.number);

        // Find matching entry in the game's catalog with number/label/name alignment
        const matchedEntry = catalogEntries.find((entry) => {
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

        if (!matchedEntry) continue;

        draws.push({
          draw_date: drawDate,
          draw_time: drawTime,
          animal_number: matchedEntry.number,
          animal_name: matchedEntry.name,
        });

        if (result.imageUrl) {
          try {
            await supabaseAdmin.from("animal_images").upsert(
              {
                game_id: game.id,
                animal_number: matchedEntry.number,
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
    },
  };
}
