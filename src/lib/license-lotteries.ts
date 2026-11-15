import type { CSSProperties } from "react";
import type { ClientLicense } from "@/lib/types";
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

export type CardsPerScreenOption = number | "TODAS";

export const DEFAULT_CARDS_PER_SCREEN = 8;

export const PRODUCTS_PER_SCREEN_OPTIONS: { value: CardsPerScreenOption; label: string }[] = [
  { value: 2, label: "2 productos por pantalla (Gigante 2x1)" },
  { value: 3, label: "3 productos por pantalla (Grande 3x1)" },
  { value: 4, label: "4 productos por pantalla (2x2)" },
  { value: 6, label: "6 productos por pantalla (3x2)" },
  { value: 8, label: "8 productos por pantalla (4x2 · Por defecto)" },
  { value: 9, label: "9 productos por pantalla (3x3)" },
  { value: 10, label: "10 productos por pantalla (5x2)" },
  { value: 12, label: "12 productos por pantalla (4x3)" },
  { value: "TODAS", label: "Todas en una sola pantalla" },
];

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

export const DEFAULT_TRANSITION_SECONDS = 25;

export const TRANSITION_SECONDS_OPTIONS: { value: number; label: string }[] = [
  { value: 10, label: "10s" },
  { value: 15, label: "15s" },
  { value: 20, label: "20s" },
  { value: 25, label: "25s (def.)" },
  { value: 30, label: "30s" },
  { value: 45, label: "45s" },
  { value: 60, label: "60s" },
];

function normalizeCardsPerScreen(raw: unknown): CardsPerScreenOption {
  if (typeof raw === "string" && raw.trim().toUpperCase() === "TODAS") {
    return "TODAS";
  }
  const num = Number(raw);
  if (Number.isFinite(num) && num >= 2) {
    return Math.round(num);
  }
  return DEFAULT_CARDS_PER_SCREEN;
}

export function normalizeTransitionSeconds(raw: unknown): number {
  const num = Number(raw);
  if (Number.isFinite(num) && num >= 5) {
    return Math.round(num);
  }
  return DEFAULT_TRANSITION_SECONDS;
}

export interface ClientVoiceConfig {
  enabled: boolean;
  engine: "agency_voice" | "online_hd" | "browser";
  rate: number;
  playChime: boolean;
}

export const DEFAULT_CLIENT_VOICE_CONFIG: ClientVoiceConfig = {
  enabled: true,
  engine: "agency_voice",
  rate: 0.98,
  playChime: true,
};

export interface ClientDesignConfig {
  useCustomDesign?: boolean;
  card_style?: "neon" | "solid";
  background_color?: string;
  surface_color?: string;
  primary_color?: string;
  text_color?: string;
  card_color?: string;
  result_row_color?: string;
  font_family?: string;
  animal_scale?: number;
  hero_card_scale?: number;
  logo_size?: number;
  game_colors?: Record<string, string>;
}

function sanitizeVoiceConfig(raw: unknown): ClientVoiceConfig | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  const engineRaw = obj.engine;
  const engine: ClientVoiceConfig["engine"] =
    engineRaw === "browser" || engineRaw === "online_hd" || engineRaw === "agency_voice"
      ? engineRaw
      : "agency_voice";
  return {
    enabled: typeof obj.enabled === "boolean" ? obj.enabled : true,
    engine,
    rate: typeof obj.rate === "number" ? Math.max(0.7, Math.min(1.3, obj.rate)) : 0.98,
    playChime: typeof obj.playChime === "boolean" ? obj.playChime : true,
  };
}

function sanitizeDesignConfig(raw: unknown): ClientDesignConfig | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  const cardStyle: "neon" | "solid" = obj.card_style === "solid" ? "solid" : "neon";
  const gameColorsRaw = obj.game_colors;
  const gameColors: Record<string, string> = {};
  if (gameColorsRaw && typeof gameColorsRaw === "object" && !Array.isArray(gameColorsRaw)) {
    for (const [k, v] of Object.entries(gameColorsRaw as Record<string, unknown>)) {
      if (typeof v === "string" && v.trim()) {
        gameColors[k] = v.trim();
      }
    }
  }
  const hasExplicitOrInferredDesign = Boolean(
    obj.useCustomDesign ||
    obj.background_color ||
    obj.surface_color ||
    obj.primary_color ||
    obj.text_color ||
    obj.card_color ||
    obj.result_row_color ||
    obj.card_style === "solid" ||
    Object.keys(gameColors).length > 0,
  );

  return {
    useCustomDesign: hasExplicitOrInferredDesign,
    card_style: cardStyle,
    background_color: typeof obj.background_color === "string" ? obj.background_color : undefined,
    surface_color: typeof obj.surface_color === "string" ? obj.surface_color : undefined,
    primary_color: typeof obj.primary_color === "string" ? obj.primary_color : undefined,
    text_color: typeof obj.text_color === "string" ? obj.text_color : undefined,
    card_color: typeof obj.card_color === "string" ? obj.card_color : undefined,
    result_row_color: typeof obj.result_row_color === "string" ? obj.result_row_color : undefined,
    font_family: typeof obj.font_family === "string" ? obj.font_family : undefined,
    animal_scale: typeof obj.animal_scale === "number" ? obj.animal_scale : undefined,
    hero_card_scale: typeof obj.hero_card_scale === "number" ? obj.hero_card_scale : undefined,
    logo_size: typeof obj.logo_size === "number" ? obj.logo_size : undefined,
    game_colors: Object.keys(gameColors).length > 0 ? gameColors : undefined,
  };
}

/**
 * Parses client_name to extract clean display name, allowed lotteries array, cardsPerScreen,
 * transitionSeconds, voiceConfig, and designConfig.
 */
export function parseClientLicenseName(rawName?: string | null): {
  cleanName: string;
  allowedLotteries: string[] | null;
  cardsPerScreen: CardsPerScreenOption;
  transitionSeconds: number;
  voiceConfig: ClientVoiceConfig | null;
  designConfig: ClientDesignConfig | null;
} {
  if (!rawName) {
    return {
      cleanName: "Cliente",
      allowedLotteries: null,
      cardsPerScreen: DEFAULT_CARDS_PER_SCREEN,
      transitionSeconds: DEFAULT_TRANSITION_SECONDS,
      voiceConfig: null,
      designConfig: null,
    };
  }

  const str = String(rawName).trim();
  if (!str.includes("||")) {
    return {
      cleanName: str || "Cliente",
      allowedLotteries: null,
      cardsPerScreen: DEFAULT_CARDS_PER_SCREEN,
      transitionSeconds: DEFAULT_TRANSITION_SECONDS,
      voiceConfig: null,
      designConfig: null,
    };
  }

  const parts = str.split("||");
  const cleanName = parts[0]?.trim() || "Cliente";
  const payloadRaw = parts.slice(1).join("||").trim();

  if (!payloadRaw) {
    return {
      cleanName,
      allowedLotteries: null,
      cardsPerScreen: DEFAULT_CARDS_PER_SCREEN,
      transitionSeconds: DEFAULT_TRANSITION_SECONDS,
      voiceConfig: null,
      designConfig: null,
    };
  }

  try {
    const parsed = JSON.parse(payloadRaw);
    if (Array.isArray(parsed)) {
      const sanitized = parsed.map((item) => String(item).trim()).filter(Boolean);
      return {
        cleanName,
        allowedLotteries: sanitized.length > 0 ? sanitized : null,
        cardsPerScreen: DEFAULT_CARDS_PER_SCREEN,
        transitionSeconds: DEFAULT_TRANSITION_SECONDS,
        voiceConfig: null,
        designConfig: null,
      };
    }

    if (parsed && typeof parsed === "object") {
      const obj = parsed as Record<string, unknown>;
      const rawLotteries = obj.loterias ?? obj.allowedLotteries ?? null;
      let allowedLotteries: string[] | null = null;

      if (Array.isArray(rawLotteries)) {
        const sanitized = rawLotteries.map((item) => String(item).trim()).filter(Boolean);
        allowedLotteries = sanitized.length > 0 ? sanitized : null;
      }

      const cardsPerScreen = normalizeCardsPerScreen(
        obj.tarjetasPorPantalla ?? obj.cardsPerScreen ?? DEFAULT_CARDS_PER_SCREEN,
      );

      const transitionSeconds = normalizeTransitionSeconds(
        obj.tiempoTransicion ?? obj.transitionSeconds ?? DEFAULT_TRANSITION_SECONDS,
      );

      const voiceConfig = sanitizeVoiceConfig(obj.voz ?? obj.voiceConfig ?? null);
      const designConfig = sanitizeDesignConfig(obj.diseno ?? obj.designConfig ?? null);

      return {
        cleanName,
        allowedLotteries,
        cardsPerScreen,
        transitionSeconds,
        voiceConfig,
        designConfig,
      };
    }
  } catch {
    // Fallback: comma-separated legacy list
    const items = payloadRaw
      .replace(/[[\]"']/g, "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (items.length > 0) {
      return {
        cleanName,
        allowedLotteries: items,
        cardsPerScreen: DEFAULT_CARDS_PER_SCREEN,
        transitionSeconds: DEFAULT_TRANSITION_SECONDS,
        voiceConfig: null,
        designConfig: null,
      };
    }
  }

  return {
    cleanName,
    allowedLotteries: null,
    cardsPerScreen: DEFAULT_CARDS_PER_SCREEN,
    transitionSeconds: DEFAULT_TRANSITION_SECONDS,
    voiceConfig: null,
    designConfig: null,
  };
}

/**
 * Formats clean client name with selected allowed lotteries, cardsPerScreen, transitionSeconds,
 * voiceConfig, and designConfig.
 */
export function formatClientLicenseName(
  cleanName: string,
  allowedLotteries: string[] | null,
  totalAvailableCount?: number,
  cardsPerScreen: CardsPerScreenOption = DEFAULT_CARDS_PER_SCREEN,
  transitionSeconds: number = DEFAULT_TRANSITION_SECONDS,
  voiceConfig?: ClientVoiceConfig | null,
  designConfig?: ClientDesignConfig | null,
): string {
  const name = cleanName.trim() || "Cliente";
  const normalizedCards = normalizeCardsPerScreen(cardsPerScreen);
  const normalizedTransition = normalizeTransitionSeconds(transitionSeconds);
  const isAllLotteries =
    !allowedLotteries ||
    allowedLotteries.length === 0 ||
    Boolean(totalAvailableCount && allowedLotteries.length >= totalAvailableCount);

  const hasCustomVoice = Boolean(voiceConfig);
  const hasCustomDesign = Boolean(
    designConfig &&
    (designConfig.useCustomDesign ||
      designConfig.background_color ||
      designConfig.surface_color ||
      designConfig.primary_color ||
      designConfig.text_color ||
      designConfig.card_color ||
      designConfig.result_row_color ||
      designConfig.card_style === "solid" ||
      (designConfig.game_colors && Object.keys(designConfig.game_colors).length > 0)),
  );

  if (
    normalizedCards === DEFAULT_CARDS_PER_SCREEN &&
    normalizedTransition === DEFAULT_TRANSITION_SECONDS &&
    !hasCustomVoice &&
    !hasCustomDesign
  ) {
    if (isAllLotteries) {
      return name;
    }
    return `${name}||${JSON.stringify(allowedLotteries)}`;
  }

  const payloadObj: Record<string, unknown> = {
    loterias: isAllLotteries ? "TODAS" : allowedLotteries,
    tarjetasPorPantalla: normalizedCards,
    tiempoTransicion: normalizedTransition,
  };

  if (voiceConfig) {
    payloadObj.voz = voiceConfig;
  }
  if (designConfig && hasCustomDesign) {
    payloadObj.diseno = {
      ...designConfig,
      useCustomDesign: true,
    };
  }

  return `${name}||${JSON.stringify(payloadObj)}`;
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

/**
 * Calculates responsive CSS Grid columns/rows and proportional scaling variables
 * based on the number of visible cards on the current screen so cards expand to
 * fill 100% of width and height and scale their internal text/numbers/images cleanly.
 */
export function getResponsiveBoardGridStyle(cardCount: number): CSSProperties {
  const safeCount = Math.max(1, cardCount);
  let cols = 4;
  let rows = 2;
  let densityScale = 1;
  let avatarScale = 1;
  let logoScale = 1;
  let cellScale = 1;

  if (safeCount === 1) {
    cols = 1;
    rows = 1;
    densityScale = 1.85;
    avatarScale = 2.25;
    logoScale = 1.85;
    cellScale = 1.95;
  } else if (safeCount === 2) {
    cols = 2;
    rows = 1;
    densityScale = 1.65;
    avatarScale = 1.95;
    logoScale = 1.65;
    cellScale = 1.75;
  } else if (safeCount === 3) {
    cols = 3;
    rows = 1;
    densityScale = 1.42;
    avatarScale = 1.65;
    logoScale = 1.45;
    cellScale = 1.5;
  } else if (safeCount === 4) {
    cols = 2;
    rows = 2;
    densityScale = 1.35;
    avatarScale = 1.45;
    logoScale = 1.32;
    cellScale = 1.38;
  } else if (safeCount <= 6) {
    cols = 3;
    rows = 2;
    densityScale = 1.16;
    avatarScale = 1.2;
    logoScale = 1.15;
    cellScale = 1.18;
  } else if (safeCount <= 8) {
    cols = 4;
    rows = 2;
    densityScale = 1;
    avatarScale = 1;
    logoScale = 1;
    cellScale = 1;
  } else if (safeCount === 9) {
    cols = 3;
    rows = 3;
    densityScale = 0.9;
    avatarScale = 0.88;
    logoScale = 0.9;
    cellScale = 0.88;
  } else if (safeCount === 10) {
    cols = 5;
    rows = 2;
    densityScale = 0.88;
    avatarScale = 0.86;
    logoScale = 0.88;
    cellScale = 0.86;
  } else if (safeCount <= 12) {
    cols = 4;
    rows = 3;
    densityScale = 0.84;
    avatarScale = 0.82;
    logoScale = 0.84;
    cellScale = 0.82;
  } else {
    cols = 5;
    rows = Math.ceil(safeCount / 5);
    densityScale = 0.76;
    avatarScale = 0.75;
    logoScale = 0.78;
    cellScale = 0.76;
  }

  return {
    gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
    gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))`,
    "--card-density-scale": densityScale,
    "--card-avatar-scale": avatarScale,
    "--card-logo-scale": logoScale,
    "--card-cell-scale": cellScale,
  } as CSSProperties;
}

export const LICENSE_OVERRIDES_STORAGE_KEY = "pizarra_license_overrides_v3";
export const LICENSE_CACHE_STORAGE_KEY = "pizarra_license_cache_v2";
export const CLIENT_LICENSES_CACHE_KEY = "pizarra_client_licenses_cache_v2";
export const DELETED_LICENSES_STORAGE_KEY = "pizarra_deleted_licenses_v2";
export const LAST_CONFIGURED_LICENSE_ID_KEY = "pizarra_last_configured_license_id";

interface StoredLicenseOverride {
  license: ClientLicense;
  updatedAt: number;
}

export function saveLocalLicenseOverride(lic: ClientLicense): void {
  if (typeof window === "undefined") return;
  try {
    const raw = localStorage.getItem(LICENSE_OVERRIDES_STORAGE_KEY);
    const map: Record<string, StoredLicenseOverride> =
      raw && typeof JSON.parse(raw) === "object" ? JSON.parse(raw) : {};
    const entry: StoredLicenseOverride = {
      license: { ...lic },
      updatedAt: Date.now(),
    };
    if (lic.id) {
      map[lic.id] = entry;
    }
    if (lic.pin_code) {
      map[`pin:${lic.pin_code}`] = entry;
    }
    localStorage.setItem(LICENSE_OVERRIDES_STORAGE_KEY, JSON.stringify(map));
    if (lic.id) {
      localStorage.setItem(LAST_CONFIGURED_LICENSE_ID_KEY, lic.id);
    }
  } catch {
    // ignore storage errors
  }
}

export function removeLocalLicenseOverride(id?: string, pinCode?: string): void {
  if (typeof window === "undefined") return;
  try {
    const raw = localStorage.getItem(LICENSE_OVERRIDES_STORAGE_KEY);
    if (raw) {
      const map: Record<string, StoredLicenseOverride> = JSON.parse(raw) || {};
      if (id) delete map[id];
      if (pinCode) delete map[`pin:${pinCode}`];
      localStorage.setItem(LICENSE_OVERRIDES_STORAGE_KEY, JSON.stringify(map));
    }
  } catch {
    // ignore
  }
}

export function saveLocalLicensesSnapshot(
  requireLicense: boolean,
  licenses: ClientLicense[],
): void {
  if (typeof window === "undefined") return;
  try {
    const payload = JSON.stringify({ requireLicense, licenses });
    localStorage.setItem(LICENSE_CACHE_STORAGE_KEY, payload);
    localStorage.setItem(CLIENT_LICENSES_CACHE_KEY, payload);
    localStorage.setItem("pizarra_persisted_client_licenses", JSON.stringify(licenses));
  } catch {
    // ignore
  }
}

export function getLastConfiguredLicenseId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return localStorage.getItem(LAST_CONFIGURED_LICENSE_ID_KEY);
  } catch {
    return null;
  }
}

export function reconcileClientLicensesWithLocal(
  serverLicenses: ClientLicense[],
  serverDeletedIds?: string[],
  serverDeletedPins?: string[],
): { licenses: ClientLicense[]; needsServerSync: ClientLicense[] } {
  const safeServer = Array.isArray(serverLicenses) ? serverLicenses : [];
  if (typeof window === "undefined") {
    return { licenses: safeServer, needsServerSync: [] };
  }

  try {
    const localDeletedRaw = localStorage.getItem(DELETED_LICENSES_STORAGE_KEY);
    const localDeleted = localDeletedRaw ? JSON.parse(localDeletedRaw) : { ids: [], pins: [] };
    const deletedIdSet = new Set<string>([
      ...(Array.isArray(serverDeletedIds) ? serverDeletedIds : []),
      ...(Array.isArray(localDeleted?.ids) ? localDeleted.ids : []),
    ]);
    const deletedPinSet = new Set<string>([
      ...(Array.isArray(serverDeletedPins) ? serverDeletedPins : []),
      ...(Array.isArray(localDeleted?.pins) ? localDeleted.pins : []),
    ]);

    const overridesRaw = localStorage.getItem(LICENSE_OVERRIDES_STORAGE_KEY);
    const overridesMap: Record<string, StoredLicenseOverride> =
      overridesRaw && typeof JSON.parse(overridesRaw) === "object" ? JSON.parse(overridesRaw) : {};

    const needsServerSync: ClientLicense[] = [];
    const seenIds = new Set<string>();
    const seenPins = new Set<string>();
    const result: ClientLicense[] = [];

    for (const sLic of safeServer) {
      if (!sLic || !sLic.id) continue;
      if (deletedIdSet.has(sLic.id) || (sLic.pin_code && deletedPinSet.has(sLic.pin_code))) {
        continue;
      }

      const ov =
        overridesMap[sLic.id] || (sLic.pin_code ? overridesMap[`pin:${sLic.pin_code}`] : undefined);

      if (ov && ov.license) {
        const mergedBound = Array.from(
          new Set([...(sLic.bound_device_ids || []), ...(ov.license.bound_device_ids || [])]),
        );
        const merged: ClientLicense = {
          ...sLic,
          ...ov.license,
          id: sLic.id,
          pin_code: ov.license.pin_code || sLic.pin_code,
          bound_device_ids: mergedBound,
        };
        if (
          sLic.client_name !== merged.client_name ||
          sLic.status !== merged.status ||
          sLic.expires_at !== merged.expires_at ||
          sLic.max_devices !== merged.max_devices
        ) {
          needsServerSync.push(merged);
        }
        result.push(merged);
        seenIds.add(merged.id);
        if (merged.pin_code) seenPins.add(merged.pin_code);
      } else {
        result.push(sLic);
        seenIds.add(sLic.id);
        if (sLic.pin_code) seenPins.add(sLic.pin_code);
      }
    }

    // Also include any locally created/cached licenses that the stateless Worker isolate didn't have
    const extraCandidates: ClientLicense[] = [];
    for (const key of Object.keys(overridesMap)) {
      if (!key.startsWith("pin:") && overridesMap[key]?.license) {
        extraCandidates.push(overridesMap[key].license);
      }
    }

    const cachedRaw =
      localStorage.getItem(CLIENT_LICENSES_CACHE_KEY) ||
      localStorage.getItem(LICENSE_CACHE_STORAGE_KEY);
    if (cachedRaw) {
      const cachedParsed = JSON.parse(cachedRaw);
      if (Array.isArray(cachedParsed?.licenses)) {
        for (const cLic of cachedParsed.licenses as ClientLicense[]) {
          if (cLic && cLic.id) extraCandidates.push(cLic);
        }
      }
    }

    for (const candidate of extraCandidates) {
      if (!candidate || !candidate.id || !candidate.pin_code) continue;
      if (deletedIdSet.has(candidate.id) || deletedPinSet.has(candidate.pin_code)) continue;
      if (seenIds.has(candidate.id) || seenPins.has(candidate.pin_code)) continue;

      seenIds.add(candidate.id);
      seenPins.add(candidate.pin_code);
      result.unshift(candidate);
      needsServerSync.push(candidate);
    }

    return { licenses: result, needsServerSync };
  } catch {
    return { licenses: safeServer, needsServerSync: [] };
  }
}
