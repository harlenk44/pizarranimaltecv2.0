import {
  MASTER_PRODUCTS_CATALOG,
  getMasterAnimalProducts,
  getMasterTripleProducts,
} from "@/lib/master-products";

export interface LotteryGameOption {
  id: string;
  slug: string;
  name: string;
  category: "animalitos" | "triples";
}

export const DEFAULT_ANIMAL_LOTTERIES: LotteryGameOption[] = getMasterAnimalProducts().map((p) => ({
  id: p.id,
  slug: p.slug,
  name: p.name,
  category: "animalitos",
}));

export const ALL_TRIPLE_LOTTERIES: LotteryGameOption[] = getMasterTripleProducts().map((p) => ({
  id: p.id,
  slug: p.slug,
  name: p.name,
  category: "triples",
}));

export const ALL_AVAILABLE_LOTTERIES: LotteryGameOption[] = MASTER_PRODUCTS_CATALOG.map((p) => ({
  id: p.id,
  slug: p.slug,
  name: p.name,
  category: p.category,
}));

const KNOWN_UUID_TO_SLUG: Record<string, string> = MASTER_PRODUCTS_CATALOG.reduce(
  (acc, p) => {
    if (p.uuid) {
      acc[p.uuid] = p.slug;
    }
    return acc;
  },
  {} as Record<string, string>,
);

/**
 * Parses client_name to extract clean display name and allowed lotteries array.
 * If rawName has no "||" delimiter, allowedLotteries is null (unrestricted access to all lotteries).
 */
export function parseClientLicenseName(rawName?: string | null): {
  cleanName: string;
  allowedLotteries: string[] | null;
} {
  if (!rawName) {
    return { cleanName: "Cliente", allowedLotteries: null };
  }

  const str = String(rawName).trim();
  if (!str.includes("||")) {
    return { cleanName: str || "Cliente", allowedLotteries: null };
  }

  const parts = str.split("||");
  const cleanName = parts[0]?.trim() || "Cliente";
  const lotteriesRaw = parts.slice(1).join("||").trim();

  if (!lotteriesRaw) {
    return { cleanName, allowedLotteries: null };
  }

  try {
    const parsed = JSON.parse(lotteriesRaw);
    if (Array.isArray(parsed)) {
      const sanitized = parsed.map((item) => String(item).trim()).filter(Boolean);
      return {
        cleanName,
        allowedLotteries: sanitized.length > 0 ? sanitized : null,
      };
    }
  } catch {
    // Fallback: comma-separated
    const items = lotteriesRaw
      .replace(/[[\]"']/g, "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (items.length > 0) {
      return { cleanName, allowedLotteries: items };
    }
  }

  return { cleanName, allowedLotteries: null };
}

/**
 * Formats clean client name with selected allowed lotteries.
 * If allowedLotteries is null or contains all available lotteries, returns just the clean name.
 */
export function formatClientLicenseName(
  cleanName: string,
  allowedLotteries: string[] | null,
  totalAvailableCount?: number,
): string {
  const name = cleanName.trim() || "Cliente";
  if (!allowedLotteries || allowedLotteries.length === 0) {
    return name;
  }

  if (totalAvailableCount && allowedLotteries.length >= totalAvailableCount) {
    return name;
  }

  return `${name}||${JSON.stringify(allowedLotteries)}`;
}

/**
 * Checks whether a given lottery (by ID, UUID, or slug) is permitted.
 * If allowedLotteries is null, all lotteries are permitted.
 */
export function isLotteryPermitted(
  gameIdOrSlug?: string | null,
  allowedLotteries?: string[] | null,
): boolean {
  if (!allowedLotteries || allowedLotteries.length === 0) {
    return true;
  }
  if (!gameIdOrSlug) {
    return true;
  }

  const raw = String(gameIdOrSlug).trim().toLowerCase();
  const slugFromUuid = KNOWN_UUID_TO_SLUG[raw] || raw;

  return allowedLotteries.some((al) => {
    const target = String(al).trim().toLowerCase();
    if (target === raw || target === slugFromUuid) return true;

    // Handle aliases like "granjita" vs "la-granjita"
    if (
      (slugFromUuid === "granjita" && target === "la-granjita") ||
      (slugFromUuid === "la-granjita" && target === "granjita")
    ) {
      return true;
    }

    if (target.length >= 4 && slugFromUuid.includes(target)) return true;
    if (slugFromUuid.length >= 4 && target.includes(slugFromUuid)) return true;

    return false;
  });
}
