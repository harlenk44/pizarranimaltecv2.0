export interface CustomAnimalEntry {
  id?: string;
  game_id: string;
  animal_number: number;
  image_url: string;
}

let _cachedCatalog: CustomAnimalEntry[] | null = null;
let _catalogImageUrlSet: Set<string> = new Set();
let _catalogByKey: Map<string, string> = new Map();
let _loadPromise: Promise<CustomAnimalEntry[]> | null = null;

async function fetchRawCatalog(): Promise<unknown> {
  if (typeof window !== "undefined") {
    try {
      const origin =
        typeof window.location?.origin === "string" && window.location.origin.startsWith("http")
          ? window.location.origin
          : "";
      const res = await fetch(`${origin}/custom-animal-catalog.json`, {
        headers: { Accept: "application/json" },
      });
      if (res.ok) {
        return await res.json();
      }
    } catch {
      // In jsdom test environments, fall through to filesystem read below
    }
  }

  // Server environment: try local filesystem first (Node.js dev/test/build),
  // fallback to static CDN asset on Cloudflare Pages without bundling 7.5MB into _worker.js
  try {
    const fsMod = await import("node:fs/promises");
    const pathMod = await import("node:path");
    const filePath = pathMod.join(process.cwd(), "public", "custom-animal-catalog.json");
    const content = await fsMod.readFile(filePath, "utf8");
    return JSON.parse(content) as unknown;
  } catch {
    try {
      const res = await fetch("https://pizarraanimal.servhm.com/custom-animal-catalog.json", {
        headers: { Accept: "application/json" },
      });
      if (res.ok) {
        return await res.json();
      }
    } catch {
      // ignore
    }
  }
  return [];
}

/**
 * Carga diferida del catálogo maestro de 451 imágenes desde el archivo estático
 * `/custom-animal-catalog.json` en `public/`.
 * Al servirse como archivo estático desde Cloudflare Pages CDN, no se empaqueta
 * dentro de `dist/_worker.js` (manteniendo el Worker en ~2.5MB, muy por debajo
 * del límite de Cloudflare Free) y no consume peticiones del Worker.
 */
export async function loadCustomAnimalCatalog(): Promise<CustomAnimalEntry[]> {
  if (_cachedCatalog) return _cachedCatalog;
  if (_loadPromise) return _loadPromise;

  _loadPromise = (async () => {
    try {
      const rawCatalog = await fetchRawCatalog();
      if (Array.isArray(rawCatalog)) {
        _cachedCatalog = (rawCatalog as CustomAnimalEntry[]).filter(
          (item) =>
            item &&
            typeof item.game_id === "string" &&
            typeof item.animal_number === "number" &&
            typeof item.image_url === "string" &&
            !item.image_url.includes("/api/media?file="),
        );
        _catalogImageUrlSet = new Set(_cachedCatalog.map((item) => item.image_url));
        const nextMap = new Map<string, string>();
        for (const item of _cachedCatalog) {
          nextMap.set(`${item.game_id}:${item.animal_number}`, item.image_url);
        }
        _catalogByKey = nextMap;
      } else {
        _cachedCatalog = [];
      }
    } catch (err) {
      console.warn("No se pudo cargar el catálogo diferido de animales:", err);
      _cachedCatalog = [];
    } finally {
      _loadPromise = null;
    }
    return _cachedCatalog;
  })();

  return _loadPromise;
}

/**
 * Retorna true si la URL pertenece al catálogo base de 451 animalitos (`custom-animal-catalog.json`).
 */
export function isEmbeddedCatalogImageUrl(url?: string | null): boolean {
  if (!url) return false;
  return _catalogImageUrlSet.has(url);
}

/**
 * Busca directamente en el catálogo base en memoria por game_id y animal_number.
 */
export function getEmbeddedCatalogImageUrl(
  gameId: string,
  animalNumber: number,
): string | undefined {
  return _catalogByKey.get(`${gameId}:${animalNumber}`);
}

/**
 * Retorna las imágenes del catálogo si ya han sido cargadas en memoria,
 * o un array vacío si la carga asíncrona todavía no ha finalizado.
 */
export function getLoadedCustomAnimalImages(): CustomAnimalEntry[] {
  return _cachedCatalog ?? [];
}

/**
 * Mantenemos la constante exportada para preservar compatibilidad con código existente.
 */
export const EMBEDDED_CUSTOM_ANIMAL_IMAGES: CustomAnimalEntry[] = [];
