// Official animal lists sourced from the lottery operators' pages.
// Guacharo: 77 animals (0, 00, 01-75) — guacharoactivo.com.ve
// Guacharito: 101 animals (0, 00, 01-99) — elguacharitomillonario.com
// Selva Plus: 101 animals (0, 00, 01-99) — selvaplus.com
// LottoPantera: 50 animals (0, 00, 01-48) — api.multiloterias.net

export interface OfficialAnimal {
  number: number;
  name: string;
  label?: string;
}

export interface CanonicalAnimalResolution {
  number: number;
  label: string;
  name: string;
  imageUrl: string;
}

// Map known game UUIDs to their canonical slug
export const GAME_ID_TO_SLUG: Readonly<Record<string, string>> = {
  "7d21a00b-0dfa-4bdc-9edf-8115802df1d6": "lotto-activo",
  "01da9c54-392a-45e3-ab66-9a08befe7694": "guacharo",
  "0519825d-e7ea-4e59-bf7d-cef2c832edd3": "guacharito",
  "8f3aa087-6a0c-41a1-9ed3-5f6d5ed6918e": "selva-plus",
  "1efc5373-a547-4f7f-9955-845b5ede5ce2": "loto-chaim-a",
  "ca8a0400-0000-4000-8000-000000000006": "granjita",
  "0f766e00-0000-4000-8000-000000000007": "monje-millonario",
  "1e40af00-0000-4000-8000-000000000008": "lotto-activo-internacional",
  "d953f80c-4335-4bc9-9f78-9b56193286fe": "lotoanimalito",
  "61580ccf-5a2d-4d10-877e-4883515135e4": "lottopantera",
  "3b92f700-0000-4000-8000-000000000011": "la-ricachona",
};

export function resolveGameSlug(gameIdOrSlug?: string | null): string {
  if (!gameIdOrSlug) return "lotto-activo";
  const clean = gameIdOrSlug.trim().toLowerCase();
  return GAME_ID_TO_SLUG[clean] ?? clean;
}

export function getBallenaInternalNumber(gameIdOrSlug?: string | null): number {
  const slug = resolveGameSlug(gameIdOrSlug);
  switch (slug) {
    case "lottopantera":
      return 49;
    case "loto-chaim-a":
      return 56;
    case "guacharo":
    case "monje-millonario":
      return 76;
    case "guacharito":
    case "selva-plus":
      return 100;
    default:
      return 37;
  }
}

// Shared base list (0-75) used by both Guacharo and Guacharito/Selva Plus
const BASE_ANIMALS: OfficialAnimal[] = [
  { number: 0, name: "Delfín", label: "0" },
  { number: 1, name: "Carnero" },
  { number: 2, name: "Toro" },
  { number: 3, name: "Ciempiés" },
  { number: 4, name: "Alacrán" },
  { number: 5, name: "León" },
  { number: 6, name: "Rana" },
  { number: 7, name: "Perico" },
  { number: 8, name: "Ratón" },
  { number: 9, name: "Águila" },
  { number: 10, name: "Tigre" },
  { number: 11, name: "Gato" },
  { number: 12, name: "Caballo" },
  { number: 13, name: "Mono" },
  { number: 14, name: "Paloma" },
  { number: 15, name: "Zorro" },
  { number: 16, name: "Oso" },
  { number: 17, name: "Pavo" },
  { number: 18, name: "Burro" },
  { number: 19, name: "Chivo" },
  { number: 20, name: "Cochino" },
  { number: 21, name: "Gallo" },
  { number: 22, name: "Camello" },
  { number: 23, name: "Cebra" },
  { number: 24, name: "Iguana" },
  { number: 25, name: "Gallina" },
  { number: 26, name: "Vaca" },
  { number: 27, name: "Perro" },
  { number: 28, name: "Zamuro" },
  { number: 29, name: "Elefante" },
  { number: 30, name: "Caimán" },
  { number: 31, name: "Lapa" },
  { number: 32, name: "Ardilla" },
  { number: 33, name: "Pescado" },
  { number: 34, name: "Venado" },
  { number: 35, name: "Jirafa" },
  { number: 36, name: "Culebra" },
  { number: 37, name: "Tortuga" },
  { number: 38, name: "Búfalo" },
  { number: 39, name: "Lechuza" },
  { number: 40, name: "Avispa" },
  { number: 41, name: "Canguro" },
  { number: 42, name: "Tucán" },
  { number: 43, name: "Mariposa" },
  { number: 44, name: "Chigüire" },
  { number: 45, name: "Garza" },
  { number: 46, name: "Puma" },
  { number: 47, name: "Pavo Real" },
  { number: 48, name: "Puercoespín" },
  { number: 49, name: "Pereza" },
  { number: 50, name: "Canario" },
  { number: 51, name: "Pelícano" },
  { number: 52, name: "Pulpo" },
  { number: 53, name: "Caracol" },
  { number: 54, name: "Grillo" },
  { number: 55, name: "Oso Hormiguero" },
  { number: 56, name: "Tiburón" },
  { number: 57, name: "Pato" },
  { number: 58, name: "Hormiga" },
  { number: 59, name: "Pantera" },
  { number: 60, name: "Camaleón" },
  { number: 61, name: "Panda" },
  { number: 62, name: "Cachicamo" },
  { number: 63, name: "Cangrejo" },
  { number: 64, name: "Gavilán" },
  { number: 65, name: "Araña" },
  { number: 66, name: "Lobo" },
  { number: 67, name: "Avestruz" },
  { number: 68, name: "Jaguar" },
  { number: 69, name: "Conejo" },
  { number: 70, name: "Bisonte" },
  { number: 71, name: "Guacamaya" },
  { number: 72, name: "Gorila" },
  { number: 73, name: "Hipopótamo" },
  { number: 74, name: "Turpial" },
  { number: 75, name: "Guácharo" },
];

// Guacharo: 77 animals (00-76) — 0 Delfín, 01-75, 76 Ballena ("00")
export const GUACHARO_ANIMALS: OfficialAnimal[] = [
  ...BASE_ANIMALS,
  { number: 76, name: "Ballena", label: "00" },
];

// Guacharito: 101 animals (00-100) — 0 Delfín, 100 Ballena ("00")
export const GUACHARITO_ANIMALS: OfficialAnimal[] = [
  ...BASE_ANIMALS,
  { number: 76, name: "Rinoceronte" },
  { number: 77, name: "Pingüino" },
  { number: 78, name: "Antílope" },
  { number: 79, name: "Calamar" },
  { number: 80, name: "Murciélago" },
  { number: 81, name: "Cuervo" },
  { number: 82, name: "Cucaracha" },
  { number: 83, name: "Búho" },
  { number: 84, name: "Camarón" },
  { number: 85, name: "Hámster" },
  { number: 86, name: "Buey" },
  { number: 87, name: "Cabra" },
  { number: 88, name: "Erizo de Mar" },
  { number: 89, name: "Anguila" },
  { number: 90, name: "Hurón" },
  { number: 91, name: "Morrocoy" },
  { number: 92, name: "Cisne" },
  { number: 93, name: "Gaviota" },
  { number: 94, name: "Paujil" },
  { number: 95, name: "Escarabajo" },
  { number: 96, name: "Caballito de Mar" },
  { number: 97, name: "Loro" },
  { number: 98, name: "Cocodrilo" },
  { number: 99, name: "Guacharito" },
  { number: 100, name: "Ballena", label: "00" },
];

// Selva Plus: 101 animals (0 Delfín, 01-99 Halcón, 100 Ballena "00")
export const SELVA_PLUS_ANIMALS: OfficialAnimal[] = [
  ...BASE_ANIMALS,
  { number: 76, name: "Rinoceronte" },
  { number: 77, name: "Pingüino" },
  { number: 78, name: "Antílope" },
  { number: 79, name: "Calamar" },
  { number: 80, name: "Murciélago" },
  { number: 81, name: "Cuervo" },
  { number: 82, name: "Cucaracha" },
  { number: 83, name: "Búho" },
  { number: 84, name: "Camarón" },
  { number: 85, name: "Hámster" },
  { number: 86, name: "Buey" },
  { number: 87, name: "Cabra" },
  { number: 88, name: "Erizo de Mar" },
  { number: 89, name: "Anguila" },
  { number: 90, name: "Hurón" },
  { number: 91, name: "Morrocoy" },
  { number: 92, name: "Cisne" },
  { number: 93, name: "Gaviota" },
  { number: 94, name: "Paujil" },
  { number: 95, name: "Escarabajo" },
  { number: 96, name: "Caballito de Mar" },
  { number: 97, name: "Loro" },
  { number: 98, name: "Cocodrilo" },
  { number: 99, name: "Halcón" },
  { number: 100, name: "Ballena", label: "00" },
];

// Loto Chaima: 57 animals (0 Delfín, 01-55 Oso Hormiguero, 56 Ballena "00") — lotochaima.com
export const LOTO_CHAIMA_ANIMALS: OfficialAnimal[] = [
  ...BASE_ANIMALS.slice(0, 56), // 0-55 (Delfín through Oso Hormiguero)
  { number: 56, name: "Ballena", label: "00" },
];

// Lotto Activo: 38 animals (0 Delfín, 01-36 Culebra, 37 Ballena "00") — lottoactivo.com
export const LOTTO_ACTIVO_ANIMALS: OfficialAnimal[] = [
  ...BASE_ANIMALS.slice(0, 37), // 0-36 (Delfín through Culebra)
  { number: 37, name: "Ballena", label: "00" },
];

// Monje Millonario (Lotto Activo 2): 77 animals (0 Delfín, 01-74, 75 Patronus, 76 Ballena "00")
export const MONJE_MILLONARIO_ANIMALS: OfficialAnimal[] = [
  ...BASE_ANIMALS.slice(0, 75), // 0-74 (Delfín through Turpial)
  { number: 75, name: "Patronus" },
  { number: 76, name: "Ballena", label: "00" },
];

// Lotto Pantera: 50 figures (0 Delfín, 01-48, 49 Ballena "00")
export const LOTTOPANTERA_ANIMALS: OfficialAnimal[] = [
  ...BASE_ANIMALS.slice(0, 37), // 0 to 36
  { number: 37, name: "Chigüire" },
  { number: 38, name: "Turpial" },
  { number: 39, name: "Araña" },
  { number: 40, name: "Pantera" },
  { number: 41, name: "Conejo" },
  { number: 42, name: "Guacamaya" },
  { number: 43, name: "Tortuga" },
  { number: 44, name: "Búho" },
  { number: 45, name: "Pato" },
  { number: 46, name: "Tiburón" },
  { number: 47, name: "Cangrejo" },
  { number: 48, name: "Tucán" },
  { number: 49, name: "Ballena", label: "00" },
];

// Map game slug -> official animal list
export const OFFICIAL_ANIMALS: Record<string, OfficialAnimal[]> = {
  guacharo: GUACHARO_ANIMALS,
  guacharito: GUACHARITO_ANIMALS,
  "selva-plus": SELVA_PLUS_ANIMALS,
  "loto-chaim-a": LOTO_CHAIMA_ANIMALS,
  "lotto-activo": LOTTO_ACTIVO_ANIMALS,
  granjita: LOTTO_ACTIVO_ANIMALS,
  "monje-millonario": MONJE_MILLONARIO_ANIMALS,
  "lotto-activo-internacional": LOTTO_ACTIVO_ANIMALS,
  lotoanimalito: LOTTO_ACTIVO_ANIMALS,
  lottopantera: LOTTOPANTERA_ANIMALS,
  "la-ricachona": LOTTO_ACTIVO_ANIMALS,
};

/**
 * Converts a raw string/number code (strictly preserving "0" vs "00") into
 * the canonical internal integer number for a given lottery.
 */
export function parseCanonicalAnimalNumber(
  gameIdOrSlug: string | null | undefined,
  rawCode: string | number,
  rawName?: string | null,
): number {
  const strCode = String(rawCode ?? "").trim();
  const normName = (rawName ?? "").trim().toUpperCase();
  const ballenaNum = getBallenaInternalNumber(gameIdOrSlug);

  if (strCode === "00" || normName.includes("BALLENA")) {
    return ballenaNum;
  }
  if (strCode === "0" || normName === "DELFÍN" || normName === "DELFIN") {
    return 0;
  }
  const parsed = typeof rawCode === "number" ? rawCode : parseInt(strCode, 10);
  if (parsed === ballenaNum) {
    return ballenaNum;
  }
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

/**
 * Returns a single deterministic, immutable fallback image URL for a given lottery and animal.
 * Never depends on which external scraper responded last.
 */
export function getFixedAnimalImageUrl(
  gameIdOrSlug: string | null | undefined,
  canonicalNumber: number,
  canonicalLabel: string,
): string {
  const slug = resolveGameSlug(gameIdOrSlug);
  const isBallena = canonicalLabel === "00" || canonicalNumber === getBallenaInternalNumber(slug);

  if (slug === "lotoanimalito") {
    const code = isBallena ? "00" : canonicalNumber === 0 ? "0" : String(canonicalNumber);
    return `https://toteback.atilax.io/storage/bases/1/${code}.png`;
  }

  if (slug === "lottopantera") {
    const code = isBallena ? "00" : canonicalNumber === 0 ? "0" : String(canonicalNumber);
    return `https://toteback.atilax.io/storage/bases/2/${code}.png`;
  }

  const label = isBallena ? "00" : canonicalNumber === 0 ? "0" : canonicalLabel;
  return `/api/public/results/sync?animalImage=${encodeURIComponent(slug)}:${canonicalNumber}&label=${encodeURIComponent(label)}`;
}

/**
 * Master immutable resolver for any animalito draw across the entire application.
 * Guarantees:
 *  1. "0" is always DELFÍN and "00" is always BALLENA (never conflated via parseInt).
 *  2. Official animal name comes from the local immutable catalog for that lottery.
 *  3. Image priority is strictly: (1) Game-specific custom admin image -> (2) Fixed local bank.
 */
export function resolveCanonicalAnimal(
  gameIdOrSlug: string | null | undefined,
  rawNumberOrCode: number | string,
  rawAnimalName?: string | null,
  customImages?: Record<string, string>,
  customNames?: Record<string, string>,
  customLabels?: Record<string, string>,
): CanonicalAnimalResolution {
  const slug = resolveGameSlug(gameIdOrSlug);
  const gameKey = (gameIdOrSlug ?? slug).trim();
  const catalog = OFFICIAL_ANIMALS[slug] ?? LOTTO_ACTIVO_ANIMALS;
  const ballenaNum = getBallenaInternalNumber(slug);

  const canonicalNum = parseCanonicalAnimalNumber(slug, rawNumberOrCode, rawAnimalName);
  const isBallena = canonicalNum === ballenaNum;
  const isDelfin = !isBallena && canonicalNum === 0;

  const catalogEntry = catalog.find((a) => a.number === canonicalNum);

  const label = isBallena
    ? "00"
    : isDelfin
      ? "0"
      : (customLabels?.[`${gameKey}:${canonicalNum}`] ??
        customLabels?.[`${slug}:${canonicalNum}`] ??
        catalogEntry?.label ??
        String(canonicalNum).padStart(2, "0"));

  const name = isBallena
    ? "Ballena"
    : isDelfin
      ? "Delfín"
      : (customNames?.[`${gameKey}:${canonicalNum}`] ??
        customNames?.[`${slug}:${canonicalNum}`] ??
        catalogEntry?.name ??
        (rawAnimalName ? rawAnimalName.trim() : `Animal ${label}`));

  const customImg =
    customImages?.[`${gameKey}:${canonicalNum}`] ??
    customImages?.[`${slug}:${canonicalNum}`] ??
    (isBallena ? (customImages?.[`${gameKey}:00`] ?? customImages?.[`${slug}:00`]) : undefined);

  const imageUrl = customImg || getFixedAnimalImageUrl(slug, canonicalNum, label);

  return {
    number: canonicalNum,
    label,
    name,
    imageUrl,
  };
}
