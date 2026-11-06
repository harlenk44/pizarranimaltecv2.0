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
