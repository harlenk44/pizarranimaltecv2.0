import type { Game } from "@/lib/types";

/**
 * Slugs canónicos oficiales de las loterías de animalitos.
 * Todas las consultas, escrituras a Supabase y respuestas de /api/public/results/sync
 * deben normalizarse estrictamente a estas claves canónicas.
 */
export const CANONICAL_GAME_SLUGS = [
  "lotto-activo",
  "guacharo-activo",
  "el-guacharito-millonario",
  "selva-plus",
  "loto-chaim-a",
  "la-granjita",
  "monje-millonario",
  "lotto-activo-internacional",
  "lotoanimalito",
  "lottopantera",
  "la-ricachona",
  "lotto-activo-rdominicana",
  "ruleta-activa",
] as const;

export type CanonicalGameSlug = (typeof CANONICAL_GAME_SLUGS)[number];

/**
 * Mapa estricto de variantes/alias conocidos (slugs históricos, nombres y clases) -> slug canónico.
 */
export const GAME_SLUG_ALIAS_MAP: Readonly<Record<string, CanonicalGameSlug>> = {
  // Lotto Activo
  "lotto-activo": "lotto-activo",
  lottoactivo: "lotto-activo",
  "lotto activo": "lotto-activo",
  "lotto-activo-1": "lotto-activo",

  // Guácharo Activo
  "guacharo-activo": "guacharo-activo",
  guacharo: "guacharo-activo",
  "el-guacharo": "guacharo-activo",
  guacharoactivo: "guacharo-activo",
  "guacharo activo": "guacharo-activo",
  "el guacharo": "guacharo-activo",

  // El Guacharito Millonario
  "el-guacharito-millonario": "el-guacharito-millonario",
  guacharito: "el-guacharito-millonario",
  "el-guacharito": "el-guacharito-millonario",
  "guacharito-millonario": "el-guacharito-millonario",
  elguacharitomillonario: "el-guacharito-millonario",
  guacharitomillonario: "el-guacharito-millonario",
  "el guacharito": "el-guacharito-millonario",
  "el guacharito millonario": "el-guacharito-millonario",
  "guacharito millonario": "el-guacharito-millonario",

  // Selva Plus
  "selva-plus": "selva-plus",
  selvaplus: "selva-plus",
  "selva plus": "selva-plus",

  // Loto Chaima
  "loto-chaim-a": "loto-chaim-a",
  "loto-chaima": "loto-chaim-a",
  lotochaima: "loto-chaim-a",
  "loto chaima": "loto-chaim-a",

  // La Granjita
  "la-granjita": "la-granjita",
  granjita: "la-granjita",
  lagranjita: "la-granjita",
  "la granjita": "la-granjita",

  // Monje Millonario
  "monje-millonario": "monje-millonario",
  monjemillonario: "monje-millonario",
  "monje millonario": "monje-millonario",
  lottoactivo2: "monje-millonario",
  "lottoactivo2(monjemillonario)": "monje-millonario",

  // Lotto Activo RD Internacional
  "lotto-activo-internacional": "lotto-activo-internacional",
  "lotto-activo-rd": "lotto-activo-internacional",
  "lotto-activo-rd-internacional": "lotto-activo-internacional",
  lottoactivord: "lotto-activo-internacional",
  lottoactivordint: "lotto-activo-internacional",
  "lotto activo rd": "lotto-activo-internacional",
  "lotto activo rd internacional": "lotto-activo-internacional",
  "lotto activo internacional": "lotto-activo-internacional",

  // Lotto Activo RDominicana
  "lotto-activo-rdominicana": "lotto-activo-rdominicana",
  "lotto-activo-rd-dominicana": "lotto-activo-rdominicana",
  "lotto-activo-dominicana": "lotto-activo-rdominicana",
  lottoactivordominicana: "lotto-activo-rdominicana",
  "lotto activo rdominicana": "lotto-activo-rdominicana",
  "lotto activo dominicana": "lotto-activo-rdominicana",
  "lotto activo rd ( lotto activo rdominicana )": "lotto-activo-rdominicana",
  "lotto activo rd (lotto activo rdominicana)": "lotto-activo-rdominicana",

  // Ruleta Activa
  "ruleta-activa": "ruleta-activa",
  ruletaactiva: "ruleta-activa",
  "ruleta activa": "ruleta-activa",

  // LotoAnimalito
  lotoanimalito: "lotoanimalito",
  "loto-animalito": "lotoanimalito",
  "loto animalito": "lotoanimalito",

  // LottoPantera
  lottopantera: "lottopantera",
  "lotto-pantera": "lottopantera",
  "lotto pantera": "lottopantera",

  // La Ricachona
  "la-ricachona": "la-ricachona",
  laricachona: "la-ricachona",
  ricachona: "la-ricachona",
  "la ricachona": "la-ricachona",
};

/**
 * Mapa de UUIDs históricos/hardcodeados de INITIAL_GAMES -> slug canónico.
 * Permite detectar y consolidar registros huérfanos en Supabase que apuntan a un UUID local antiguo.
 */
export const LEGACY_GAME_UUID_TO_CANONICAL_SLUG: Readonly<Record<string, CanonicalGameSlug>> = {
  "7d21a00b-0dfa-4bdc-9edf-8115802df1d6": "lotto-activo",
  "01da9c54-392a-45e3-ab66-9a08befe7694": "guacharo-activo",
  "0519825d-e7ea-4e59-bf7d-cef2c832edd3": "el-guacharito-millonario",
  "8f3aa087-6a0c-41a1-9ed3-5f6d5ed6918e": "selva-plus",
  "1efc5373-a547-4f7f-9955-845b5ede5ce2": "loto-chaim-a",
  "ca8a0400-0000-4000-8000-000000000006": "la-granjita",
  "0f766e00-0000-4000-8000-000000000007": "monje-millonario",
  "1e40af00-0000-4000-8000-000000000008": "lotto-activo-internacional",
  "b84da000-0000-4000-8000-000000000008": "lotto-activo-internacional",
  "d953f80c-4335-4bc9-9f78-9b56193286fe": "lotoanimalito",
  "61580ccf-5a2d-4d10-877e-4883515135e4": "lottopantera",
  "3b92f700-0000-4000-8000-000000000011": "la-ricachona",
  "4c82e900-0000-4000-8000-000000000012": "lotto-activo-rdominicana",
  "5d93fa00-0000-4000-8000-000000000013": "ruleta-activa",
};

export const CANONICAL_SLUG_TO_DEFAULT_UUID: Readonly<Record<CanonicalGameSlug, string>> = {
  "lotto-activo": "7d21a00b-0dfa-4bdc-9edf-8115802df1d6",
  "guacharo-activo": "01da9c54-392a-45e3-ab66-9a08befe7694",
  "el-guacharito-millonario": "0519825d-e7ea-4e59-bf7d-cef2c832edd3",
  "selva-plus": "8f3aa087-6a0c-41a1-9ed3-5f6d5ed6918e",
  "loto-chaim-a": "1efc5373-a547-4f7f-9955-845b5ede5ce2",
  "la-granjita": "ca8a0400-0000-4000-8000-000000000006",
  "monje-millonario": "0f766e00-0000-4000-8000-000000000007",
  "lotto-activo-internacional": "1e40af00-0000-4000-8000-000000000008",
  lotoanimalito: "d953f80c-4335-4bc9-9f78-9b56193286fe",
  lottopantera: "61580ccf-5a2d-4d10-877e-4883515135e4",
  "la-ricachona": "3b92f700-0000-4000-8000-000000000011",
  "lotto-activo-rdominicana": "4c82e900-0000-4000-8000-000000000012",
  "ruleta-activa": "5d93fa00-0000-4000-8000-000000000013",
};

export const CANONICAL_GAME_DISPLAY_NAMES: Readonly<Record<CanonicalGameSlug, string>> = {
  "lotto-activo": "LOTTO ACTIVO",
  "guacharo-activo": "GUACHARO ACTIVO",
  "el-guacharito-millonario": "EL GUACHARITO MILLONARIO",
  "selva-plus": "SELVA PLUS",
  "loto-chaim-a": "LOTO CHAIMA",
  "la-granjita": "LA GRANJITA",
  "monje-millonario": "MONJE MILLONARIO",
  "lotto-activo-internacional": "LOTTO ACTIVO RD INTERNACIONAL",
  lotoanimalito: "LOTOANIMALITO",
  lottopantera: "LOTTOPANTERA",
  "la-ricachona": "LA RICACHONA",
  "lotto-activo-rdominicana": "LOTTO ACTIVO RDOMINICANA",
  "ruleta-activa": "RULETA ACTIVA",
};

const CANONICAL_TO_ALL_ALIASES: Record<string, string[]> = {};
for (const canonical of CANONICAL_GAME_SLUGS) {
  CANONICAL_TO_ALL_ALIASES[canonical] = [canonical];
}
for (const [alias, canonical] of Object.entries(GAME_SLUG_ALIAS_MAP)) {
  if (!CANONICAL_TO_ALL_ALIASES[canonical].includes(alias)) {
    CANONICAL_TO_ALL_ALIASES[canonical].push(alias);
  }
}

function stripDiacritics(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function matchByCompactToken(raw: string): CanonicalGameSlug | null {
  const clean = stripDiacritics(raw).replace(/[^a-z0-9]/g, "");
  if (!clean) return null;

  // Orden estricto: variantes compuestas antes que sus prefijos
  if (clean.includes("monje") || clean.includes("lottoactivo2")) {
    return "monje-millonario";
  }
  if (clean.includes("rdominicana") || clean.includes("dominicana")) {
    return "lotto-activo-rdominicana";
  }
  if (
    clean.includes("rdint") ||
    clean.includes("internacional") ||
    clean.includes("lottoactivord")
  ) {
    return "lotto-activo-internacional";
  }
  if (clean.includes("ruletaactiva")) {
    return "ruleta-activa";
  }
  if (clean.includes("guacharito")) {
    return "el-guacharito-millonario";
  }
  if (clean.includes("guacharo")) {
    return "guacharo-activo";
  }
  if (clean.includes("granjita")) {
    return "la-granjita";
  }
  if (clean.includes("selvaplus") || clean === "selva") {
    return "selva-plus";
  }
  if (clean.includes("chaima") || clean.includes("chaim")) {
    return "loto-chaim-a";
  }
  if (clean.includes("ricachona") && !clean.includes("triple")) {
    return "la-ricachona";
  }
  if (clean.includes("lotoanimalito")) {
    return "lotoanimalito";
  }
  if (
    clean.includes("lottopantera") ||
    (clean.includes("pantera") && !clean.includes("triple") && !clean.includes("terminal"))
  ) {
    return "lottopantera";
  }
  if (clean === "lottoactivo" || clean === "lottoactivo1") {
    return "lotto-activo";
  }

  return null;
}

const SPECIAL_NON_ANIMALITO_ALIASES: Readonly<Record<string, string>> = {
  arrejuntao: "arrejuntao",
  "el-arrejuntao": "arrejuntao",
  elarrejuntao: "arrejuntao",
  "el arrejuntao": "arrejuntao",
};

/**
 * Normaliza estrictamente cualquier slug, nombre de lotería o UUID histórico a una única clave canónica.
 * Ejemplos:
 *  - "guacharo" | "GUÁCHARO ACTIVO" | "guacharo-activo" -> "guacharo-activo"
 *  - "guacharito" | "El Guacharito" | "el-guacharito-millonario" -> "el-guacharito-millonario"
 *  - "granjita" | "LA GRANJITA" | "la-granjita" -> "la-granjita"
 */
export function normalizeGameSlug(slugOrId?: string | null, fallbackName?: string | null): string {
  const candidates = [slugOrId, fallbackName]
    .map((v) => (typeof v === "string" ? v.trim() : ""))
    .filter(Boolean);

  for (const candidate of candidates) {
    const lower = candidate.toLowerCase();
    if (LEGACY_GAME_UUID_TO_CANONICAL_SLUG[lower]) {
      return LEGACY_GAME_UUID_TO_CANONICAL_SLUG[lower];
    }
    const stripped = stripDiacritics(candidate);
    if (GAME_SLUG_ALIAS_MAP[stripped]) {
      return GAME_SLUG_ALIAS_MAP[stripped];
    }
    if (SPECIAL_NON_ANIMALITO_ALIASES[stripped]) {
      return SPECIAL_NON_ANIMALITO_ALIASES[stripped];
    }
    const hyphenated = stripped.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
    if (GAME_SLUG_ALIAS_MAP[hyphenated]) {
      return GAME_SLUG_ALIAS_MAP[hyphenated];
    }
    if (SPECIAL_NON_ANIMALITO_ALIASES[hyphenated]) {
      return SPECIAL_NON_ANIMALITO_ALIASES[hyphenated];
    }
    const tokenMatch = matchByCompactToken(stripped);
    if (tokenMatch) {
      return tokenMatch;
    }
    if (stripped.replace(/[^a-z0-9]/g, "").includes("arrejuntao")) {
      return "arrejuntao";
    }
  }

  // Para juegos personalizados desconocidos, generar slug limpio estable
  const primary = candidates[0] ?? "";
  if (!primary) return "";
  return stripDiacritics(primary)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Retorna true si el slug normalizado corresponde a una lotería oficial conocida.
 */
export function isKnownCanonicalGameSlug(slug?: string | null): slug is CanonicalGameSlug {
  if (!slug) return false;
  return (CANONICAL_GAME_SLUGS as readonly string[]).includes(slug);
}

/**
 * Devuelve todos los alias históricos y canónicos equivalentes para un slug dado.
 */
export function getGameSlugAliases(slugOrNameOrId?: string | null): string[] {
  const canonical = normalizeGameSlug(slugOrNameOrId);
  if (!canonical) return [];
  if (canonical === "arrejuntao") {
    return ["arrejuntao", "el-arrejuntao", "elarrejuntao", "el arrejuntao"];
  }
  const known = CANONICAL_TO_ALL_ALIASES[canonical];
  if (known) return [...known];
  const raw = typeof slugOrNameOrId === "string" ? slugOrNameOrId.trim().toLowerCase() : "";
  return raw && raw !== canonical ? [canonical, raw] : [canonical];
}

/**
 * Determina si dos objetos de juego representan la misma lotería canónica.
 */
export function areSameCanonicalGame(
  a: { id?: string | null; slug?: string | null; name?: string | null },
  b: { id?: string | null; slug?: string | null; name?: string | null },
): boolean {
  if (a.id && b.id && a.id.trim().toLowerCase() === b.id.trim().toLowerCase()) {
    return true;
  }
  const slugA = normalizeGameSlug(a.slug || a.id, a.name);
  const slugB = normalizeGameSlug(b.slug || b.id, b.name);
  return Boolean(slugA && slugB && slugA === slugB);
}

const LEGACY_HARDCODED_UUID_SET = new Set<string>(Object.keys(LEGACY_GAME_UUID_TO_CANONICAL_SLUG));

export function isLegacyHardcodedGameUuid(id?: string | null): boolean {
  if (!id) return false;
  return LEGACY_HARDCODED_UUID_SET.has(id.trim().toLowerCase());
}

/**
 * Deduplica una lista de juegos por su slug canónico, unificando siempre el campo `slug`
 * a su clave canónica y generando un mapa `idRemap` (oldId -> winningId) para reasignar
 * resultados, entradas e imágenes sin dejar registros huérfanos.
 */
export function deduplicateGamesList<T extends Game>(
  games: T[],
  options?: {
    preferredCloudIds?: Set<string>;
    isCustomLogo?: (url?: string | null) => boolean;
  },
): { games: T[]; idRemap: Map<string, string> } {
  const preferredCloudIds = options?.preferredCloudIds ?? new Set<string>();
  const isCustomLogo = options?.isCustomLogo;
  const byCanonical = new Map<string, T>();
  const idRemap = new Map<string, string>();

  const scoreGame = (g: T, canonicalSlug: string): number => {
    let score = 0;
    const idLower = (g.id || "").trim().toLowerCase();
    if (preferredCloudIds.has(g.id) || preferredCloudIds.has(idLower)) score += 1000;
    if (!isLegacyHardcodedGameUuid(idLower)) score += 200;
    if ((g.slug || "").trim().toLowerCase() === canonicalSlug) score += 100;
    if (g.is_active) score += 20;
    if (isCustomLogo && isCustomLogo(g.logo_url)) score += 10;
    return score;
  };

  for (const rawGame of games) {
    if (!rawGame || (!rawGame.id && !rawGame.slug && !rawGame.name)) continue;
    const canonicalSlug = normalizeGameSlug(rawGame.slug || rawGame.id, rawGame.name);
    if (!canonicalSlug) continue;

    const normalizedGame: T = {
      ...rawGame,
      slug: canonicalSlug,
    };

    const existing = byCanonical.get(canonicalSlug);
    if (!existing) {
      byCanonical.set(canonicalSlug, normalizedGame);
      continue;
    }

    const existingScore = scoreGame(existing, canonicalSlug);
    const incomingScore = scoreGame(rawGame, canonicalSlug);

    const winner = incomingScore > existingScore ? normalizedGame : existing;
    const loser = incomingScore > existingScore ? existing : normalizedGame;

    // Preservar logo personalizado y horarios configurados al fusionar
    const winnerHasCustomLogo = isCustomLogo ? isCustomLogo(winner.logo_url) : false;
    const loserHasCustomLogo = isCustomLogo ? isCustomLogo(loser.logo_url) : false;
    const mergedLogo = winnerHasCustomLogo
      ? winner.logo_url
      : loserHasCustomLogo
        ? loser.logo_url
        : winner.logo_url || loser.logo_url;

    const mergedSchedule =
      Array.isArray(winner.schedule_times) && winner.schedule_times.length > 0
        ? winner.schedule_times
        : Array.isArray(loser.schedule_times) && loser.schedule_times.length > 0
          ? loser.schedule_times
          : undefined;

    const merged: T = {
      ...loser,
      ...winner,
      id: winner.id,
      slug: canonicalSlug,
      logo_url: mergedLogo,
      ...(mergedSchedule ? { schedule_times: mergedSchedule } : {}),
      display_order:
        typeof winner.display_order === "number"
          ? winner.display_order
          : (loser.display_order ?? 99),
    };

    byCanonical.set(canonicalSlug, merged);
    if (loser.id && winner.id && loser.id !== winner.id) {
      idRemap.set(loser.id, winner.id);
    }
  }

  // Resolver cadenas transitivas en idRemap (A -> B -> C => A -> C)
  for (const [fromId, toId] of Array.from(idRemap.entries())) {
    let cur = toId;
    const visited = new Set<string>([fromId]);
    while (idRemap.has(cur) && !visited.has(cur)) {
      visited.add(cur);
      cur = idRemap.get(cur)!;
    }
    idRemap.set(fromId, cur);
  }

  const deduped = Array.from(byCanonical.values()).sort(
    (a, b) => (a.display_order ?? 99) - (b.display_order ?? 99),
  );
  return { games: deduped, idRemap };
}

/**
 * Empareja los resultados de un juego tanto por su `game_id` exacto (UUID oficial)
 * como por su slug canónico (`game_slug` o UUID legado -> slug canónico), garantizando
 * que juegos como LA GRANJITA, GUACHARO ACTIVO o EL GUACHARITO MILLONARIO muestren
 * siempre sus sorteos incluso si el navegador inició con IDs semilla o alias históricos.
 */
export function matchResultsForGame<
  T extends {
    id: string;
    game_id: string;
    game_slug?: string | null;
    draw_date: string;
    draw_time: string;
    source?: string | null;
  },
>(
  game: { id: string; slug?: string | null; name?: string | null },
  allResults: T[],
  drawDate?: string,
): T[] {
  const targetId = (game.id || "").trim();
  const targetCanonicalSlug = normalizeGameSlug(game.slug || targetId, game.name);
  const bySlot = new Map<string, T>();

  for (const r of allResults) {
    if (!r || !r.draw_date || !r.draw_time) continue;
    if (drawDate && r.draw_date !== drawDate) continue;

    const exactIdMatch = Boolean(targetId && r.game_id === targetId);
    let slugMatch = false;
    if (!exactIdMatch && targetCanonicalSlug) {
      const rSlug = r.game_slug ? normalizeGameSlug(r.game_slug) : "";
      if (rSlug && rSlug === targetCanonicalSlug) {
        slugMatch = true;
      } else if (r.game_id) {
        const legacySlug = LEGACY_GAME_UUID_TO_CANONICAL_SLUG[r.game_id.trim().toLowerCase()];
        if (legacySlug && legacySlug === targetCanonicalSlug) {
          slugMatch = true;
        }
      }
    }

    if (!exactIdMatch && !slugMatch) continue;

    const normSlot = r.draw_time.substring(0, 5).replace(/^0/, "");
    const slotKey = `${r.draw_date}|${normSlot}`;
    const existing = bySlot.get(slotKey);
    const normalizedRow: T = exactIdMatch || !targetId ? r : { ...r, game_id: targetId };

    if (!existing) {
      bySlot.set(slotKey, normalizedRow);
      continue;
    }

    const incomingManual = r.source === "manual";
    const existingManual = existing.source === "manual";
    if (incomingManual && !existingManual) {
      bySlot.set(slotKey, normalizedRow);
    } else if (incomingManual === existingManual && exactIdMatch && existing.game_id !== targetId) {
      bySlot.set(slotKey, normalizedRow);
    }
  }

  return Array.from(bySlot.values()).sort((a, b) => a.draw_time.localeCompare(b.draw_time));
}
