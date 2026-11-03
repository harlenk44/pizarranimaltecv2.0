import type { ResultAlertItem } from "@/components/ResultAlertModal";

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

export const TRIPLE_GAMES: TripleGameConfig[] = [
  {
    id: "triple-facil",
    slug: "triple-facil",
    name: "Triple Fácil",
    color: "#3b82f6",
    logo_url: "https://loteriadehoy.com/dist/files_img/48-Triple_Facil.webp",
    columns: ["A"],
    columnLabels: { A: "Triple" },
    schedule_times: HOURLY_8_TO_7,
    display_order: 1,
  },
  {
    id: "trio-activo",
    slug: "trio-activo",
    name: "Trío Activo",
    color: "#10b981",
    logo_url: "https://loteriadehoy.com/dist/files_img/48-Trio_Activo.webp",
    columns: ["A"],
    columnLabels: { A: "Triple" },
    schedule_times: HOURLY_8_TO_7,
    display_order: 2,
  },
  {
    id: "triple-chance",
    slug: "triple-chance",
    name: "Triple Chance",
    color: "#f59e0b",
    logo_url: "https://loteriadehoy.com/dist/files_img/48-Triple_Chance.webp",
    columns: ["A", "B", "C", "SIGN"],
    columnLabels: { A: "Triple A", B: "Triple B", C: "Astral", SIGN: "Signo" },
    schedule_times: HOURLY_9_TO_7,
    display_order: 3,
  },
  {
    id: "triple-zulia",
    slug: "triple-zulia",
    name: "Triple Zulia",
    color: "#eab308",
    logo_url: "https://loteriadehoy.com/dist/files_img/48-Triple_Zulia.webp",
    columns: ["A", "B", "C", "SIGN"],
    columnLabels: { A: "Triple A", B: "Triple B", C: "Zodiaco", SIGN: "Signo" },
    schedule_times: ["12:45:00", "16:45:00", "19:05:00"],
    display_order: 4,
  },
  {
    id: "triple-caliente",
    slug: "triple-caliente",
    name: "Triple Caliente",
    color: "#ef4444",
    logo_url: "https://loteriadehoy.com/dist/files_img/48-Triple_Caliente.webp",
    columns: ["A", "B", "C", "SIGN"],
    columnLabels: { A: "Triple A", B: "Triple B", C: "Signo C", SIGN: "Signo" },
    schedule_times: ["13:00:00", "16:30:00", "19:10:00"],
    display_order: 5,
  },
  {
    id: "triple-caracas",
    slug: "triple-caracas",
    name: "Triple Caracas",
    color: "#ec4899",
    logo_url: "https://loteriadehoy.com/dist/files_img/48-Triple_Caracas.webp",
    columns: ["A", "B", "C", "SIGN"],
    columnLabels: { A: "Triple A", B: "Triple B", C: "Zodiacal", SIGN: "Signo" },
    schedule_times: ["13:00:00", "16:30:00", "19:00:00"],
    display_order: 6,
  },
  {
    id: "triple-pantera",
    slug: "triple-pantera",
    name: "Triple Pantera",
    color: "#a855f7",
    logo_url: "",
    columns: ["A", "B", "C", "SIGN"],
    columnLabels: { A: "Triple A", B: "Triple B", C: "Triple C", SIGN: "Signo" },
    schedule_times: HOURLY_8_TO_7,
    display_order: 7,
  },
  {
    id: "arrejuntao",
    slug: "arrejuntao",
    name: "Arrejuntao",
    color: "#06b6d4",
    logo_url: "https://tuazar.com/in/loteria/logo_el_arrejuntao.png",
    columns: ["A", "B", "C", "SIGN"],
    columnLabels: { A: "Triple A", B: "Triple B", C: "Triple +", SIGN: "Signo" },
    schedule_times: ["10:00:00", "13:00:00", "16:00:00", "19:00:00", "23:00:00"],
    display_order: 8,
  },
];

export function formatTripleSummary(res: TripleResult): string {
  const parts: string[] = [];
  if (res.triple_b) {
    parts.push(`A: ${res.triple_a}`);
    parts.push(`B: ${res.triple_b}`);
  } else {
    parts.push(`Triple: ${res.triple_a}`);
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
    animalName: formatTripleSummary(res),
    animalEmoji: "🎰",
  };
}
