import type { ResultAlertItem } from "@/components/ResultAlertModal";
import { getMasterTripleProducts } from "@/lib/master-products";

export interface TripleGameConfig {
  id: string;
  slug: string;
  name: string;
  color: string;
  logo_url: string;
  columns: ("A" | "B" | "C" | "SIGN")[];
  columnLabels: {
    A: string;
    B?: string;
    C?: string;
    SIGN?: string;
  };
  schedule_times: string[];
  display_order: number;
}

export interface TripleResult {
  id: string;
  game_id: string;
  game_slug: string;
  draw_date: string;
  draw_time: string;
  triple_a: string;
  triple_b?: string | null;
  triple_c?: string | null;
  zodiac_sign?: string | null;
  source: "manual" | "automatic";
  created_at: string;
}

const HOURLY_8_TO_7 = [
  "08:00:00",
  "09:00:00",
  "10:00:00",
  "11:00:00",
  "12:00:00",
  "13:00:00",
  "14:00:00",
  "15:00:00",
  "16:00:00",
  "17:00:00",
  "18:00:00",
  "19:00:00",
];

const HOURLY_9_TO_7 = [
  "09:00:00",
  "10:00:00",
  "11:00:00",
  "12:00:00",
  "13:00:00",
  "14:00:00",
  "15:00:00",
  "16:00:00",
  "17:00:00",
  "18:00:00",
  "19:00:00",
];

const RICACHONA_HOURLY = [
  "08:05:00",
  "09:05:00",
  "10:05:00",
  "11:05:00",
  "12:05:00",
  "13:05:00",
  "14:05:00",
  "15:05:00",
  "16:05:00",
  "17:05:00",
  "18:05:00",
  "19:05:00",
];

export const ZODIAC_SIGNS: { code: string; name: string }[] = [
  { code: "ARI", name: "Aries" },
  { code: "TAU", name: "Tauro" },
  { code: "GEM", name: "Géminis" },
  { code: "CAN", name: "Cáncer" },
  { code: "LEO", name: "Leo" },
  { code: "VIR", name: "Virgo" },
  { code: "LIB", name: "Libra" },
  { code: "ESC", name: "Escorpio" },
  { code: "SAG", name: "Sagitario" },
  { code: "CAP", name: "Capricornio" },
  { code: "ACU", name: "Acuario" },
  { code: "PIS", name: "Piscis" },
];

export function formatZodiacSign(raw?: string | null): string {
  if (!raw) return "";
  const clean = raw.trim().toUpperCase().slice(0, 3);
  const found = ZODIAC_SIGNS.find((s) => s.code === clean);
  return found ? found.code : raw.trim().toUpperCase();
}

export function formatZodiacFullName(raw?: string | null): string {
  if (!raw) return "";
  const clean = raw.trim().toUpperCase().slice(0, 3);
  const found = ZODIAC_SIGNS.find((s) => s.code === clean);
  return found ? found.name : raw.trim();
}

export const TRIPLE_GAMES: TripleGameConfig[] = getMasterTripleProducts().map((p) => ({
  id: p.id,
  slug: p.slug,
  name: p.name,
  color: p.color,
  logo_url: p.logo_url,
  columns: p.columns || ["A"],
  columnLabels: p.columnLabels || { A: "Triple" },
  schedule_times: p.schedule_times,
  display_order: p.display_order,
}));

export function formatTripleSummary(res: TripleResult, game?: TripleGameConfig): string {
  const resolvedGame =
    game ?? TRIPLE_GAMES.find((g) => g.id === res.game_id || g.slug === res.game_slug);
  const singleLabel =
    resolvedGame?.columnLabels?.A ||
    (res.game_slug?.includes("terminal") || res.game_id?.includes("terminal")
      ? "Terminal"
      : "Triple");

  const parts: string[] = [];
  if (res.triple_b) {
    parts.push(`A: ${res.triple_a}`);
    parts.push(`B: ${res.triple_b}`);
  } else {
    parts.push(`${singleLabel}: ${res.triple_a}`);
  }
  if (res.triple_c) {
    const signStr = res.zodiac_sign ? ` ${formatZodiacFullName(res.zodiac_sign)}` : "";
    parts.push(`C: ${res.triple_c}${signStr}`);
  } else if (res.zodiac_sign) {
    parts.push(`Signo: ${formatZodiacFullName(res.zodiac_sign)}`);
  }
  return parts.join(" · ");
}

export function buildTripleAlertItem(res: TripleResult, game?: TripleGameConfig): ResultAlertItem {
  const resolvedGame =
    game ?? TRIPLE_GAMES.find((g) => g.id === res.game_id || g.slug === res.game_slug);
  const parsedNum = parseInt(res.triple_a.replace(/\D/g, ""), 10);
  const numValue = Number.isFinite(parsedNum) ? parsedNum : 0;

  return {
    id: `triple-${res.game_id}-${res.draw_date}-${res.draw_time}-${res.triple_a}`,
    gameId: resolvedGame?.id ?? res.game_id,
    gameName: resolvedGame?.name ?? res.game_id,
    gameColor: resolvedGame?.color ?? "#f59e0b",
    gameLogoUrl: resolvedGame?.logo_url || null,
    drawDate: res.draw_date,
    drawTime: res.draw_time,
    animalNumber: numValue,
    animalLabel: res.triple_a,
    animalName: formatTripleSummary(res, resolvedGame),
    animalEmoji: "🎰",
  };
}

/**
 * Normalizes a triple draw_time string to "HH:MM" for stable slot comparison
 * across sources (e.g. "08:00:00", "8:00", "08:00" -> "08:00").
 */
export function normalizeTripleDrawTimeKey(rawTime?: string | null): string {
  if (!rawTime) return "";
  const match = /^(\d{1,2}):(\d{2})/.exec(rawTime.trim());
  if (!match) return rawTime.trim().slice(0, 5);
  return `${match[1]!.padStart(2, "0")}:${match[2]!}`;
}

/**
 * Normalizes a triple draw_time string to "HH:MM:00" for consistent storage/UI matching.
 */
export function normalizeTripleDrawTime(rawTime?: string | null): string {
  const hhmm = normalizeTripleDrawTimeKey(rawTime);
  if (!hhmm) return "";
  return hhmm.length === 5 ? `${hhmm}:00` : hhmm;
}

function isNonEmptyTripleValue(val?: string | null): val is string {
  if (!val) return false;
  const clean = val.trim();
  return Boolean(clean && clean !== "-" && clean !== "—");
}

/**
 * Merges incoming triple results with existing ones while strictly preserving:
 * - Today's already-loaded results if an incoming payload is empty or partial
 *   (prevents triples from flickering/disappearing across cold serverless isolates)
 * - Manual admin overrides against automatic scraper updates
 * - Field enrichment (triple_b, triple_c, zodiac_sign) across multiple sources
 * - Explicit admin deletions via deletedIds
 */
export function mergeTripleResultsPreserveToday(
  existing: TripleResult[],
  incoming: TripleResult[],
  todayDate?: string,
  deletedIds?: string[],
): TripleResult[] {
  const deletedSet = new Set<string>(deletedIds ?? []);
  const byKey = new Map<string, TripleResult>();

  const makeKey = (item: TripleResult): string => {
    const gameKey = (item.game_slug || item.game_id || "").trim().toLowerCase();
    const timeKey = normalizeTripleDrawTimeKey(item.draw_time);
    return `${gameKey}|${item.draw_date}|${timeKey}`;
  };

  for (const item of existing) {
    if (!item || !item.game_id || !item.draw_date || !item.draw_time) continue;
    if (deletedSet.has(item.id)) continue;
    if (todayDate && item.draw_date !== todayDate) continue;
    if (!isNonEmptyTripleValue(item.triple_a)) continue;

    const normalizedTime = normalizeTripleDrawTime(item.draw_time);
    const cleanItem: TripleResult = {
      ...item,
      game_slug: item.game_slug || item.game_id,
      draw_time: normalizedTime,
      triple_a: item.triple_a.trim(),
      triple_b: isNonEmptyTripleValue(item.triple_b) ? item.triple_b.trim() : null,
      triple_c: isNonEmptyTripleValue(item.triple_c) ? item.triple_c.trim() : null,
      zodiac_sign: isNonEmptyTripleValue(item.zodiac_sign) ? item.zodiac_sign.trim() : null,
    };
    byKey.set(makeKey(cleanItem), cleanItem);
  }

  for (const inc of incoming) {
    if (!inc || !inc.game_id || !inc.draw_date || !inc.draw_time) continue;
    if (deletedSet.has(inc.id)) continue;
    if (todayDate && inc.draw_date !== todayDate) continue;
    if (!isNonEmptyTripleValue(inc.triple_a)) continue;

    const normalizedTime = normalizeTripleDrawTime(inc.draw_time);
    const cleanInc: TripleResult = {
      ...inc,
      game_slug: inc.game_slug || inc.game_id,
      draw_time: normalizedTime,
      triple_a: inc.triple_a.trim(),
      triple_b: isNonEmptyTripleValue(inc.triple_b) ? inc.triple_b.trim() : null,
      triple_c: isNonEmptyTripleValue(inc.triple_c) ? inc.triple_c.trim() : null,
      zodiac_sign: isNonEmptyTripleValue(inc.zodiac_sign) ? inc.zodiac_sign.trim() : null,
    };

    const key = makeKey(cleanInc);
    const curr = byKey.get(key);

    if (!curr) {
      byKey.set(key, cleanInc);
      continue;
    }

    // Never allow automatic sync to overwrite a manual admin correction
    if (curr.source === "manual" && cleanInc.source !== "manual") {
      continue;
    }

    // If incoming is manual, apply it directly
    if (cleanInc.source === "manual") {
      byKey.set(key, {
        ...curr,
        ...cleanInc,
        draw_time: normalizedTime,
      });
      continue;
    }

    // Both automatic: enrich missing fields without dropping already-known fields
    byKey.set(key, {
      ...curr,
      triple_a: cleanInc.triple_a || curr.triple_a,
      triple_b: cleanInc.triple_b ?? curr.triple_b ?? null,
      triple_c: cleanInc.triple_c ?? curr.triple_c ?? null,
      zodiac_sign: cleanInc.zodiac_sign ?? curr.zodiac_sign ?? null,
    });
  }

  return [...byKey.values()].sort((a, b) => {
    if (a.draw_date !== b.draw_date) return a.draw_date.localeCompare(b.draw_date);
    if (a.draw_time !== b.draw_time) return a.draw_time.localeCompare(b.draw_time);
    return a.game_id.localeCompare(b.game_id);
  });
}
