export interface CustomAnimalEntry {
  id?: string;
  game_id: string;
  animal_number: number;
  image_url: string;
}

let _cachedCatalog: CustomAnimalEntry[] | null = null;
let _catalogImageUrlSet: Set<string> = new Set();
let _loadPromise: Promise<CustomAnimalEntry[]> | null = null;

/**
 * Carga diferida (lazy / dynamic import) del catálogo maestro de imágenes.
 * Al usar import() dinámico en lugar de una importación estática en la raíz,
 * Vite y Nitro generan un chunk separado para este archivo JSON de 7.5MB.
 * Esto evita saturar el paquete principal (index.js), reduce el tiempo de arranque
 * de la app a menos de un segundo y previene errores de timeout en la preview.
 */
export async function loadCustomAnimalCatalog(): Promise<CustomAnimalEntry[]> {
  if (_cachedCatalog) return _cachedCatalog;
  if (_loadPromise) return _loadPromise;

  _loadPromise = (async () => {
    try {
      const module = await import("./custom-animal-catalog.json");
      const rawCatalog = (module && "default" in module ? module.default : module) as unknown;
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
 * Esto permite distinguir entre el catálogo base (que se carga por separado bajo demanda)
 * y las imágenes subidas/modificadas explícitamente por el administrador.
 */
export function isEmbeddedCatalogImageUrl(url?: string | null): boolean {
  if (!url) return false;
  return _catalogImageUrlSet.has(url);
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
