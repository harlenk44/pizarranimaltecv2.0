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

function hydrateCatalogFromRaw(rawCatalog: unknown): CustomAnimalEntry[] {
  if (!Array.isArray(rawCatalog)) {
    _cachedCatalog = [];
    return _cachedCatalog;
  }
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
  return _cachedCatalog;
}

/**
 * Carga diferida del catálogo maestro de imágenes (451 animalitos) desde `/custom-animal-catalog.json`
 * servido como archivo estático en `public/` (cero peso en el bundle de Cloudflare Worker).
 */
export async function loadCustomAnimalCatalog(): Promise<CustomAnimalEntry[]> {
  if (_cachedCatalog && _cachedCatalog.length > 0) return _cachedCatalog;
  if (_loadPromise) return _loadPromise;

  _loadPromise = (async () => {
    try {
      if (typeof window !== "undefined") {
        const res = await fetch("/custom-animal-catalog.json", { cache: "force-cache" });
        if (res.ok) {
          const rawCatalog = (await res.json()) as unknown;
          return hydrateCatalogFromRaw(rawCatalog);
        }
        return _cachedCatalog ?? [];
      }

      // Server-side (Node.js dev/build): read directly from public/custom-animal-catalog.json
      try {
        const fsMod = await import(/* @vite-ignore */ "node:fs");
        const pathMod = await import(/* @vite-ignore */ "node:path");
        const candidates = [
          pathMod.join(process.cwd(), "public", "custom-animal-catalog.json"),
          pathMod.join(process.cwd(), "dist", "custom-animal-catalog.json"),
        ];
        for (const filePath of candidates) {
          if (fsMod.existsSync(filePath)) {
            const parsed = JSON.parse(fsMod.readFileSync(filePath, "utf-8")) as unknown;
            return hydrateCatalogFromRaw(parsed);
          }
        }
      } catch {
        // Cloudflare Workers runtime does not have local filesystem; static CDN serves /custom-animal-catalog.json
      }

      return _cachedCatalog ?? [];
    } catch (err) {
      console.warn("No se pudo cargar el catálogo diferido de animales:", err);
      return _cachedCatalog ?? [];
    } finally {
      _loadPromise = null;
    }
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
