import type { Result } from "@/lib/types";
import type { TripleResult } from "@/lib/triples";
import { normalizeScheduleTime } from "@/lib/game-schedules";
import { resolveCanonicalAnimal } from "@/lib/official-animals";
import fs from "fs";

export const MULTILOTERIAS_RESULTS_URL = "https://api.multiloterias.net/api/public/results/today";
export const MULTILOTERIAS_BASE_URL = "https://api.multiloterias.net/api/public";

const CACHE_FILE_ITEMS = "/tmp/multiloterias_items_cache.json";
const FETCH_TIMEOUT_MS = 10_000;

export interface MultiloteriasItem {
  number: string;
  name: string;
  imageUrl: string;
}

export interface MultiloteriasDraw {
  hora: string;
  numero: string;
  nombre: string;
}

export interface MultiloteriasGameData {
  nombre: string;
  sorteos: MultiloteriasDraw[];
}

export interface MultiloteriasTodayResponse {
  fecha: string;
  juegos: Record<string, MultiloteriasGameData>;
}

// Fixed UUID mapping from Multiloterias API
export const MULTILOTERIAS_GAMES_INFO = {
  lotoanimalito: {
    uuid: "d953f80c-4335-4bc9-9f78-9b56193286fe",
    slug: "lotoanimalito",
    name: "LOTOANIMALITO",
    category: "animalitos" as const,
  },
  lottopantera: {
    uuid: "61580ccf-5a2d-4d10-877e-4883515135e4",
    slug: "lottopantera",
    name: "LOTTOPANTERA",
    category: "animalitos" as const,
  },
  "triple-pantera": {
    uuid: "69efc4d7-52cb-41a6-951d-be299590f393",
    slug: "triple-pantera",
    name: "TRIPLE PANTERA",
    category: "triples" as const,
  },
  "terminal-pantera": {
    uuid: "741ef8e9-129b-446b-abad-d00f68323f1c",
    slug: "terminal-pantera",
    name: "TERMINAL PANTERA",
    category: "triples" as const,
  },
};

const SERVER_HEADERS: Record<string, string> = {
  "User-Agent": "LotteryBoardServer/2.0 (Compatible; Node.js/Fetch)",
  Accept: "application/json, text/plain, */*",
  "Cache-Control": "no-cache",
};

/**
 * Fetch Multiloterias today's results without any browser Origin header
 * to strictly prevent CORS 500 error from the Multiloterias server.
 */
export async function fetchMultiloteriasToday(): Promise<MultiloteriasTodayResponse | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(MULTILOTERIAS_RESULTS_URL, {
      method: "GET",
      headers: SERVER_HEADERS,
      signal: controller.signal,
    });
    if (!res.ok) {
      console.warn(`[multiloterias] Fetch today returned status ${res.status}`);
      return null;
    }
    const data = (await res.json()) as MultiloteriasTodayResponse;
    return data;
  } catch (err) {
    console.warn("[multiloterias] Fetch today failed:", err);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Fetch catalog items (animal figures and their official images)
 * for lotoanimalito and lottopantera.
 */
export async function fetchMultiloteriasItems(
  gameSlug: "lotoanimalito" | "lottopantera",
): Promise<MultiloteriasItem[]> {
  const url = `${MULTILOTERIAS_BASE_URL}/games/${gameSlug}/items`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: "GET",
      headers: SERVER_HEADERS,
      signal: controller.signal,
    });
    if (!res.ok) {
      console.warn(`[multiloterias] Fetch items for ${gameSlug} returned status ${res.status}`);
      return [];
    }
    const parsed = (await res.json()) as { success?: boolean; data?: MultiloteriasItem[] };
    if (parsed && Array.isArray(parsed.data)) {
      return parsed.data;
    }
    return [];
  } catch (err) {
    console.warn(`[multiloterias] Fetch items for ${gameSlug} failed:`, err);
    return [];
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Retrieves catalog items with local filesystem cache fallback
 */
export async function getCachedMultiloteriasItems(
  gameSlug: "lotoanimalito" | "lottopantera",
): Promise<MultiloteriasItem[]> {
  try {
    if (fs.existsSync(CACHE_FILE_ITEMS)) {
      const cache = JSON.parse(fs.readFileSync(CACHE_FILE_ITEMS, "utf-8"));
      if (cache && Array.isArray(cache[gameSlug]) && cache[gameSlug].length > 0) {
        return cache[gameSlug];
      }
    }
  } catch {
    // ignore
  }

  const items = await fetchMultiloteriasItems(gameSlug);
  if (items.length > 0) {
    try {
      let currentCache: Record<string, MultiloteriasItem[]> = {};
      if (fs.existsSync(CACHE_FILE_ITEMS)) {
        try {
          currentCache = JSON.parse(fs.readFileSync(CACHE_FILE_ITEMS, "utf-8"));
        } catch {
          currentCache = {};
        }
      }
      currentCache[gameSlug] = items;
      fs.writeFileSync(CACHE_FILE_ITEMS, JSON.stringify(currentCache, null, 2));
    } catch {
      // ignore
    }
  }
  return items;
}

/**
 * Converts a 24-hour time like "08:00" to "08:00:00"
 */
export function formatMultiloteriasDrawTime(horaStr: string): string {
  const norm = normalizeScheduleTime(horaStr);
  if (!norm) return `${horaStr}:00`;
  return `${norm}:00`;
}

/**
 * Synchronizes Multiloterias results into animal results and triple results
 */
export async function synchronizeMultiloteriasData(
  currentAnimalResults: Result[],
  currentTripleResults: TripleResult[],
): Promise<{
  animalResults: Result[];
  tripleResults: TripleResult[];
  newAnimalCount: number;
  newTripleCount: number;
}> {
  const data = await fetchMultiloteriasToday();
  if (!data || !data.juegos || !data.fecha) {
    return {
      animalResults: currentAnimalResults,
      tripleResults: currentTripleResults,
      newAnimalCount: 0,
      newTripleCount: 0,
    };
  }

  const drawDate = data.fecha;
  let newAnimalCount = 0;
  let newTripleCount = 0;

  const mergedAnimals = [...currentAnimalResults];
  const mergedTriples = [...currentTripleResults];

  for (const [uuid, gameData] of Object.entries(data.juegos)) {
    if (!gameData || !Array.isArray(gameData.sorteos)) continue;
    const normNombre = (gameData.nombre || "").trim().toUpperCase();

    // 1. LOTOANIMALITO
    if (normNombre === "LOTOANIMALITO" || uuid === MULTILOTERIAS_GAMES_INFO.lotoanimalito.uuid) {
      const targetGameId = MULTILOTERIAS_GAMES_INFO.lotoanimalito.uuid;
      for (const sorteo of gameData.sorteos) {
        if (!sorteo.hora || !sorteo.numero) continue;
        const drawTime = formatMultiloteriasDrawTime(sorteo.hora);
        const resolved = resolveCanonicalAnimal("lotoanimalito", sorteo.numero, sorteo.nombre);

        const existingIdx = mergedAnimals.findIndex(
          (r) =>
            (r.game_id === targetGameId || r.game_id === "lotoanimalito") &&
            r.draw_date === drawDate &&
            (r.draw_time === drawTime || r.draw_time.startsWith(sorteo.hora)),
        );

        if (existingIdx < 0) {
          mergedAnimals.push({
            id: `ml-lotoanimalito-${drawDate}-${drawTime}`,
            game_id: targetGameId,
            draw_date: drawDate,
            draw_time: drawTime,
            animal_number: resolved.number,
            animal_name: resolved.name,
            source: "automatic",
            created_at: new Date().toISOString(),
          });
          newAnimalCount++;
        }
      }
    }

    // 2. LOTTOPANTERA
    else if (normNombre === "LOTTOPANTERA" || uuid === MULTILOTERIAS_GAMES_INFO.lottopantera.uuid) {
      const targetGameId = MULTILOTERIAS_GAMES_INFO.lottopantera.uuid;
      for (const sorteo of gameData.sorteos) {
        if (!sorteo.hora || !sorteo.numero) continue;
        const drawTime = formatMultiloteriasDrawTime(sorteo.hora);
        const resolved = resolveCanonicalAnimal("lottopantera", sorteo.numero, sorteo.nombre);

        const existingIdx = mergedAnimals.findIndex(
          (r) =>
            (r.game_id === targetGameId || r.game_id === "lottopantera") &&
            r.draw_date === drawDate &&
            (r.draw_time === drawTime || r.draw_time.startsWith(sorteo.hora)),
        );

        if (existingIdx < 0) {
          mergedAnimals.push({
            id: `ml-lottopantera-${drawDate}-${drawTime}`,
            game_id: targetGameId,
            draw_date: drawDate,
            draw_time: drawTime,
            animal_number: resolved.number,
            animal_name: resolved.name,
            source: "automatic",
            created_at: new Date().toISOString(),
          });
          newAnimalCount++;
        }
      }
    }

    // 3. TRIPLE PANTERA
    else if (
      normNombre === "TRIPLE PANTERA" ||
      uuid === MULTILOTERIAS_GAMES_INFO["triple-pantera"].uuid
    ) {
      for (const sorteo of gameData.sorteos) {
        if (!sorteo.hora || !sorteo.numero) continue;
        const drawTime = formatMultiloteriasDrawTime(sorteo.hora);
        const tripleVal = String(sorteo.numero).trim();

        const existingIdx = mergedTriples.findIndex(
          (r) =>
            (r.game_id === "triple-pantera" ||
              r.game_slug === "triple-pantera" ||
              r.game_id === MULTILOTERIAS_GAMES_INFO["triple-pantera"].uuid) &&
            r.draw_date === drawDate &&
            (r.draw_time === drawTime || r.draw_time.startsWith(sorteo.hora)),
        );

        if (existingIdx >= 0) {
          mergedTriples[existingIdx] = {
            ...mergedTriples[existingIdx],
            triple_a: tripleVal,
          };
        } else {
          mergedTriples.push({
            id: `ml-triple-pantera-${drawDate}-${drawTime}`,
            game_id: "triple-pantera",
            game_slug: "triple-pantera",
            draw_date: drawDate,
            draw_time: drawTime,
            triple_a: tripleVal,
            source: "automatic",
            created_at: new Date().toISOString(),
          });
          newTripleCount++;
        }
      }
    }

    // 4. TERMINAL PANTERA
    else if (
      normNombre === "TERMINAL PANTERA" ||
      uuid === MULTILOTERIAS_GAMES_INFO["terminal-pantera"].uuid
    ) {
      for (const sorteo of gameData.sorteos) {
        if (!sorteo.hora || !sorteo.numero) continue;
        const drawTime = formatMultiloteriasDrawTime(sorteo.hora);
        const terminalVal = String(sorteo.numero).trim();

        const existingIdx = mergedTriples.findIndex(
          (r) =>
            (r.game_id === "terminal-pantera" ||
              r.game_slug === "terminal-pantera" ||
              r.game_id === MULTILOTERIAS_GAMES_INFO["terminal-pantera"].uuid) &&
            r.draw_date === drawDate &&
            (r.draw_time === drawTime || r.draw_time.startsWith(sorteo.hora)),
        );

        if (existingIdx >= 0) {
          mergedTriples[existingIdx] = {
            ...mergedTriples[existingIdx],
            triple_a: terminalVal,
          };
        } else {
          mergedTriples.push({
            id: `ml-terminal-pantera-${drawDate}-${drawTime}`,
            game_id: "terminal-pantera",
            game_slug: "terminal-pantera",
            draw_date: drawDate,
            draw_time: drawTime,
            triple_a: terminalVal,
            source: "automatic",
            created_at: new Date().toISOString(),
          });
          newTripleCount++;
        }
      }
    }
  }

  return {
    animalResults: mergedAnimals,
    tripleResults: mergedTriples,
    newAnimalCount,
    newTripleCount,
  };
}
