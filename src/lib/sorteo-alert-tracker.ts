import { lotteryDate } from "@/lib/lottery-date";

const KNOWN_GAME_ALIASES: Record<string, string> = {
  // UUIDs to canonical slugs
  "7d21a00b-0dfa-4bdc-9edf-8115802df1d6": "lotto-activo",
  "01da9c54-392a-45e3-ab66-9a08befe7694": "guacharo",
  "0519825d-e7ea-4e59-bf7d-cef2c832edd3": "guacharito",
  "8f3aa087-6a0c-41a1-9ed3-5f6d5ed6918e": "selva-plus",
  "1efc5373-a547-4f7f-9955-845b5ede5ce2": "loto-chaim-a",
  "ca8a0400-0000-4000-8000-000000000006": "granjita",
  "0f766e00-0000-4000-8000-000000000007": "monje-millonario",
  "b84da000-0000-4000-8000-000000000008": "lotto-activo-internacional",
};

/** Normalize time string (whether "11:15", "11:15:00", "11:15 AM", "01:00 PM") to 24-hour "HH:MM" */
export function normalizeTimeTo24h(timeStr?: string | null): string {
  if (!timeStr) return "00:00";
  const clean = timeStr.trim().toUpperCase();
  const isPM = clean.includes("PM");
  const isAM = clean.includes("AM");
  const withoutMeridiem = clean.replace(/AM|PM/g, "").trim();
  const parts = withoutMeridiem.split(":");
  let hour = parseInt(parts[0] ?? "0", 10);
  const minute = parseInt(parts[1] ?? "0", 10);

  if (isNaN(hour)) hour = 0;
  if (isPM && hour < 12) hour += 12;
  if (isAM && hour === 12) hour = 0;

  return `${String(hour).padStart(2, "0")}:${String(isNaN(minute) ? 0 : minute).padStart(2, "0")}`;
}

/** Normalize game identifier across UUIDs, slugs, or display names */
export function normalizeGameIdentifier(gameIdOrName?: string | null): string {
  if (!gameIdOrName) return "unknown";
  const trimmed = gameIdOrName.trim().toLowerCase();
  if (KNOWN_GAME_ALIASES[trimmed]) {
    return KNOWN_GAME_ALIASES[trimmed];
  }
  const simplified = trimmed.replace(/[^a-z0-9]/g, "");
  if (simplified.includes("selvaplus")) return "selva-plus";
  if (simplified.includes("lottoactivointer") || simplified.includes("internacional"))
    return "lotto-activo-internacional";
  if (simplified.includes("lottoactivo")) return "lotto-activo";
  if (simplified.includes("guacharito")) return "guacharito";
  if (simplified.includes("guacharo")) return "guacharo";
  if (simplified.includes("granjita")) return "granjita";
  if (simplified.includes("monje")) return "monje-millonario";
  if (simplified.includes("chaima")) return "loto-chaim-a";
  return simplified || trimmed;
}

export interface SorteoIdentifiable {
  gameId?: string;
  game_id?: string;
  gameName?: string;
  drawDate?: string;
  draw_date?: string;
  drawTime?: string;
  draw_time?: string;
  id?: string;
}

/**
 * Returns a unique canonical string identifying a draw/sorteo:
 * Format: `sorteo:<game>:<date>:<24h-time>`
 * Example: `sorteo:selva-plus:2026-10-31:11:15`
 */
export function getSorteoAlertKey(item: SorteoIdentifiable): string {
  const game = normalizeGameIdentifier(item.gameId || item.game_id || item.gameName);
  const date = (item.drawDate || item.draw_date || lotteryDate()).trim();
  const time = normalizeTimeTo24h(item.drawTime || item.draw_time);
  return `sorteo:${game}:${date}:${time}`;
}

const STORAGE_KEY = "pizarra_alerted_sorteos_registry";

class SorteoAlertTracker {
  private inMemoryAlerted = new Set<string>();

  constructor() {
    this.hydrateFromStorage();
  }

  private hydrateFromStorage(): void {
    if (typeof window === "undefined") return;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          for (const key of parsed) {
            if (typeof key === "string") {
              this.inMemoryAlerted.add(key);
            }
          }
        }
      }
    } catch {
      // storage unavailable or corrupt
    }
  }

  private persistToStorage(): void {
    if (typeof window === "undefined") return;
    try {
      const arr = Array.from(this.inMemoryAlerted).slice(-300);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(arr));
    } catch {
      // ignore
    }
  }

  public hasBeenAlerted(item: SorteoIdentifiable | string): boolean {
    const key = typeof item === "string" ? item : getSorteoAlertKey(item);
    if (this.inMemoryAlerted.has(key)) return true;
    if (typeof window !== "undefined") {
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw && raw.includes(key)) {
          this.inMemoryAlerted.add(key);
          return true;
        }
      } catch {
        // ignore
      }
    }
    return false;
  }

  public markAsAlerted(item: SorteoIdentifiable | string): void {
    const key = typeof item === "string" ? item : getSorteoAlertKey(item);
    this.inMemoryAlerted.add(key);
    this.persistToStorage();
  }

  public markMultipleAsAlerted(items: (SorteoIdentifiable | string)[]): void {
    let changed = false;
    for (const item of items) {
      const key = typeof item === "string" ? item : getSorteoAlertKey(item);
      if (!this.inMemoryAlerted.has(key)) {
        this.inMemoryAlerted.add(key);
        changed = true;
      }
    }
    if (changed) {
      this.persistToStorage();
    }
  }

  public clear(): void {
    this.inMemoryAlerted.clear();
    if (typeof window !== "undefined") {
      try {
        localStorage.removeItem(STORAGE_KEY);
      } catch {
        // ignore
      }
    }
  }
}

export const sorteoAlertTracker = new SorteoAlertTracker();
