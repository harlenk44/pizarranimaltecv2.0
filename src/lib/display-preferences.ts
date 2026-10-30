export const DISPLAY_STORAGE_KEY = "animalitos-display-v1";
export const DEFAULT_DISPLAY = {
  resultScale: 125,
  logoSize: 72,
  fontSizeScale: 100,
  heroCardScale: 100,
  animalScale: 100,
};
export type DisplayPreferences = typeof DEFAULT_DISPLAY;

export function parseDisplayPreferences(raw: string | null): DisplayPreferences {
  try {
    const value = JSON.parse(raw ?? "null");
    const bounded = (n: unknown, min: number, max: number, fallback: number) =>
      typeof n === "number" && Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
    return {
      resultScale: bounded(value?.resultScale, 75, 250, DEFAULT_DISPLAY.resultScale),
      logoSize: bounded(value?.logoSize, 16, 240, DEFAULT_DISPLAY.logoSize),
      fontSizeScale: bounded(value?.fontSizeScale, 60, 220, DEFAULT_DISPLAY.fontSizeScale),
      heroCardScale: bounded(value?.heroCardScale, 60, 220, DEFAULT_DISPLAY.heroCardScale),
      animalScale: bounded(value?.animalScale, 40, 220, DEFAULT_DISPLAY.animalScale),
    };
  } catch {
    return { ...DEFAULT_DISPLAY };
  }
}
