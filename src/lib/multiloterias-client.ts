import type { AnimalImage } from "@/lib/types";

export interface MultiloteriasClientItem {
  number: string;
  name: string;
  imageUrl: string;
}

const STORAGE_KEY = "multiloterias_catalog_items";

export async function fetchMultiloteriasGameItems(
  game: "lotoanimalito" | "lottopantera",
): Promise<MultiloteriasClientItem[]> {
  try {
    const res = await fetch(`/api/public/multiloterias/items?game=${game}`);
    if (!res.ok) return [];
    const json = await res.json();
    if (json && Array.isArray(json.data)) {
      return json.data;
    }
  } catch {
    // ignore
  }
  return [];
}

/**
 * Initializes and retrieves the Multiloterias items catalog cached in localStorage.
 * Guarantees numbers 0-36 (Lotoanimalito) and 0-48 (Lottopantera) have their official
 * images ready for cards and popup fallback.
 */
export async function initMultiloteriasCatalogCache(): Promise<AnimalImage[]> {
  if (typeof window === "undefined") return [];

  let cached: Record<string, MultiloteriasClientItem[]> = {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      cached = JSON.parse(raw);
    }
  } catch {
    cached = {};
  }

  const hasLoto = Array.isArray(cached["lotoanimalito"]) && cached["lotoanimalito"].length > 0;
  const hasPantera = Array.isArray(cached["lottopantera"]) && cached["lottopantera"].length >= 45;

  if (!hasLoto || !hasPantera) {
    try {
      const [loto, pantera] = await Promise.all([
        hasLoto ? cached["lotoanimalito"] : fetchMultiloteriasGameItems("lotoanimalito"),
        hasPantera ? cached["lottopantera"] : fetchMultiloteriasGameItems("lottopantera"),
      ]);

      cached = {
        lotoanimalito: loto,
        lottopantera: pantera,
      };

      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(cached));
      } catch {
        // ignore
      }
    } catch {
      // ignore
    }
  }

  const resultImages: AnimalImage[] = [];

  // Lotoanimalito
  if (Array.isArray(cached["lotoanimalito"])) {
    for (const item of cached["lotoanimalito"]) {
      const num = item.number === "00" ? 0 : parseInt(item.number, 10);
      if (Number.isFinite(num) && item.imageUrl) {
        resultImages.push({
          id: `ml-img-lotoanimalito-${item.number}`,
          game_id: "d953f80c-4335-4bc9-9f78-9b56193286fe",
          animal_number: num,
          image_url: item.imageUrl,
        });
        resultImages.push({
          id: `ml-img-lotoanimalito-slug-${item.number}`,
          game_id: "lotoanimalito",
          animal_number: num,
          image_url: item.imageUrl,
        });
      }
    }
  }

  // Lottopantera (0 to 48)
  if (Array.isArray(cached["lottopantera"])) {
    for (const item of cached["lottopantera"]) {
      const num = item.number === "00" ? 0 : parseInt(item.number, 10);
      if (Number.isFinite(num) && item.imageUrl) {
        resultImages.push({
          id: `ml-img-lottopantera-${item.number}`,
          game_id: "61580ccf-5a2d-4d10-877e-4883515135e4",
          animal_number: num,
          image_url: item.imageUrl,
        });
        resultImages.push({
          id: `ml-img-lottopantera-slug-${item.number}`,
          game_id: "lottopantera",
          animal_number: num,
          image_url: item.imageUrl,
        });
      }
    }
  }

  return resultImages;
}
