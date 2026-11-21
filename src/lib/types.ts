export interface Game {
  id: string;
  name: string;
  slug: string;
  color: string;
  logo_url?: string | null;
  display_order: number;
  is_active: boolean;
  loading_mode?: "manual" | "automatic";
  mode?: "manual" | "automatic";
  schedule_times?: string[];
  created_at: string;
}

export interface Result {
  id: string;
  game_id: string;
  game_slug?: string | null;
  draw_date: string;
  draw_time: string;
  animal_number: number;
  animal_name: string;
  source?: "manual" | "automatic";
  created_at: string;
}

export interface Profile {
  id: string;
  email: string;
  role: "admin" | "viewer";
  subscription_status: "active" | "inactive" | "trial" | "expired";
  subscription_expires_at: string | null;
  created_at: string;
}

export function isSubscriptionActive(profile: Profile | null): boolean {
  if (!profile) return false;
  if (profile.role === "admin") return true;
  const now = new Date();
  if (profile.subscription_status === "active" || profile.subscription_status === "trial") {
    if (profile.subscription_expires_at) {
      return new Date(profile.subscription_expires_at) > now;
    }
    return true;
  }
  return false;
}

export interface AnimalImage {
  id: string;
  game_id: string;
  animal_number: number;
  image_url: string;
  updated_at: string;
}

export interface AnimalEntry {
  id: string;
  game_id: string;
  number: number;
  name: string;
  label: string | null;
  created_at: string;
}

export type AdPlacement = "top" | "bottom" | "sidebar" | "fullwidth";

export type AdMediaType = "image" | "video";

export interface Ad {
  id: string;
  title: string;
  image_url: string;
  media_type: AdMediaType;
  link_url: string | null;
  placement: AdPlacement;
  is_active: boolean;
  display_order: number;
  starts_at: string | null;
  ends_at: string | null;
  created_at: string;
}

export interface AppSettings {
  id: string;
  background_color: string;
  surface_color: string;
  primary_color: string;
  text_color: string;
  card_color: string;
  result_row_color: string;
  font_family: string;
  base_font_size: number;
  rotation_enabled: boolean;
  rotation_interval_seconds: number;
  start_view: "daily" | "weekly";
  logo_size?: number;
  font_size_scale?: number;
  hero_card_scale?: number;
  animal_scale?: number;
  card_style?: "neon" | "solid";
  game_colors?: Record<string, string>;
  updated_at: string;
}

export const DEFAULT_APP_SETTINGS: AppSettings = {
  id: "global",
  background_color: "#000000",
  surface_color: "#000000",
  primary_color: "#2563eb",
  text_color: "#f8fafc",
  card_color: "#000000",
  result_row_color: "#0a0a0a",
  font_family: "Inter",
  base_font_size: 16,
  rotation_enabled: false,
  rotation_interval_seconds: 60,
  start_view: "daily",
  logo_size: 72,
  font_size_scale: 100,
  hero_card_scale: 100,
  animal_scale: 100,
  card_style: "neon",
  game_colors: {},
  updated_at: "",
};

const FONT_FAMILY_EXT_DELIMITER = "||";

/**
 * Strips any packed extended-design JSON metadata suffix from font_family
 * so CSS always receives a clean font name (e.g. "Georgia", "Inter").
 */
export function cleanFontFamily(raw?: string | null): string {
  if (!raw || typeof raw !== "string") return DEFAULT_APP_SETTINGS.font_family;
  const idx = raw.indexOf(FONT_FAMILY_EXT_DELIMITER);
  const cleaned = (idx >= 0 ? raw.slice(0, idx) : raw).trim();
  return cleaned || DEFAULT_APP_SETTINGS.font_family;
}

/**
 * Sanitizes AppSettings into the exact standard columns of the Supabase public.app_settings table.
 * Strips non-column properties so PostgREST never fails with 'column not found' errors,
 * while safely packing extended global design settings (card_style, game_colors, scales)
 * inside font_family using a backward-compatible "||" delimiter.
 */
export function sanitizeAppSettingsForSupabase(
  settings: Partial<AppSettings>,
): Record<string, unknown> {
  const baseFont = cleanFontFamily(settings.font_family);
  const extended: Record<string, unknown> = {};

  if (settings.card_style === "solid" || settings.card_style === "neon") {
    if (settings.card_style !== DEFAULT_APP_SETTINGS.card_style) {
      extended["cs"] = settings.card_style;
    }
  }
  if (settings.game_colors && typeof settings.game_colors === "object") {
    const cleanColors: Record<string, string> = {};
    for (const [k, v] of Object.entries(settings.game_colors)) {
      if (typeof v === "string" && v.trim()) {
        cleanColors[k] = v.trim();
      }
    }
    if (Object.keys(cleanColors).length > 0) {
      extended["gc"] = cleanColors;
    }
  }
  if (
    typeof settings.logo_size === "number" &&
    settings.logo_size !== DEFAULT_APP_SETTINGS.logo_size
  ) {
    extended["ls"] = settings.logo_size;
  }
  if (
    typeof settings.font_size_scale === "number" &&
    settings.font_size_scale !== DEFAULT_APP_SETTINGS.font_size_scale
  ) {
    extended["fs"] = settings.font_size_scale;
  }
  if (
    typeof settings.hero_card_scale === "number" &&
    settings.hero_card_scale !== DEFAULT_APP_SETTINGS.hero_card_scale
  ) {
    extended["hc"] = settings.hero_card_scale;
  }
  if (
    typeof settings.animal_scale === "number" &&
    settings.animal_scale !== DEFAULT_APP_SETTINGS.animal_scale
  ) {
    extended["as"] = settings.animal_scale;
  }

  const packedFontFamily =
    Object.keys(extended).length > 0
      ? `${baseFont}${FONT_FAMILY_EXT_DELIMITER}${JSON.stringify(extended)}`
      : baseFont;

  return {
    id: "global",
    background_color: settings.background_color || DEFAULT_APP_SETTINGS.background_color,
    surface_color: settings.surface_color || DEFAULT_APP_SETTINGS.surface_color,
    primary_color: settings.primary_color || DEFAULT_APP_SETTINGS.primary_color,
    text_color: settings.text_color || DEFAULT_APP_SETTINGS.text_color,
    card_color: settings.card_color || DEFAULT_APP_SETTINGS.card_color,
    result_row_color: settings.result_row_color || DEFAULT_APP_SETTINGS.result_row_color,
    font_family: packedFontFamily,
    base_font_size:
      typeof settings.base_font_size === "number"
        ? settings.base_font_size
        : DEFAULT_APP_SETTINGS.base_font_size,
    rotation_enabled: Boolean(settings.rotation_enabled),
    rotation_interval_seconds:
      typeof settings.rotation_interval_seconds === "number"
        ? settings.rotation_interval_seconds
        : DEFAULT_APP_SETTINGS.rotation_interval_seconds,
    start_view: settings.start_view === "weekly" ? "weekly" : "daily",
    updated_at: settings.updated_at || new Date().toISOString(),
  };
}

/**
 * Parses raw row data from Supabase app_settings table into a clean Partial<AppSettings>,
 * safely unpacking packed font_family extended metadata and any theme_config/custom_styles JSON columns.
 */
export function parseAppSettingsFromSupabase(
  data: Record<string, unknown> | null | undefined,
): Partial<AppSettings> | null {
  if (!data || typeof data !== "object") return null;

  let decodedFontFamily: string | undefined;
  let packedExt: Record<string, unknown> | null = null;
  if (typeof data["font_family"] === "string") {
    const rawFont = data["font_family"];
    const delimIdx = rawFont.indexOf(FONT_FAMILY_EXT_DELIMITER);
    if (delimIdx >= 0) {
      decodedFontFamily = rawFont.slice(0, delimIdx).trim() || DEFAULT_APP_SETTINGS.font_family;
      const jsonPart = rawFont.slice(delimIdx + FONT_FAMILY_EXT_DELIMITER.length).trim();
      if (jsonPart.startsWith("{")) {
        try {
          const parsed = JSON.parse(jsonPart);
          if (parsed && typeof parsed === "object") {
            packedExt = parsed as Record<string, unknown>;
          }
        } catch {
          // ignore malformed suffix
        }
      }
    } else {
      decodedFontFamily = rawFont.trim() || DEFAULT_APP_SETTINGS.font_family;
    }
  }

  const result: Partial<AppSettings> = {
    id: "global",
    background_color:
      typeof data["background_color"] === "string" ? data["background_color"] : undefined,
    surface_color: typeof data["surface_color"] === "string" ? data["surface_color"] : undefined,
    primary_color: typeof data["primary_color"] === "string" ? data["primary_color"] : undefined,
    text_color: typeof data["text_color"] === "string" ? data["text_color"] : undefined,
    card_color: typeof data["card_color"] === "string" ? data["card_color"] : undefined,
    result_row_color:
      typeof data["result_row_color"] === "string" ? data["result_row_color"] : undefined,
    font_family: decodedFontFamily,
    base_font_size: typeof data["base_font_size"] === "number" ? data["base_font_size"] : undefined,
    rotation_enabled:
      typeof data["rotation_enabled"] === "boolean" ? data["rotation_enabled"] : undefined,
    rotation_interval_seconds:
      typeof data["rotation_interval_seconds"] === "number"
        ? data["rotation_interval_seconds"]
        : undefined,
    start_view: data["start_view"] === "weekly" ? "weekly" : "daily",
    updated_at: typeof data["updated_at"] === "string" ? data["updated_at"] : undefined,
  };

  // Unpack extended properties stored inside font_family suffix
  if (packedExt) {
    if (packedExt["cs"] === "solid" || packedExt["cs"] === "neon") {
      result.card_style = packedExt["cs"];
    }
    if (packedExt["gc"] && typeof packedExt["gc"] === "object") {
      result.game_colors = packedExt["gc"] as Record<string, string>;
    }
    if (typeof packedExt["ls"] === "number") result.logo_size = packedExt["ls"];
    if (typeof packedExt["fs"] === "number") result.font_size_scale = packedExt["fs"];
    if (typeof packedExt["hc"] === "number") result.hero_card_scale = packedExt["hc"];
    if (typeof packedExt["as"] === "number") result.animal_scale = packedExt["as"];
  }

  // If theme_config or custom_styles JSON column exists in Supabase table, extract extended properties
  const extended = (data["theme_config"] || data["custom_styles"]) as
    Record<string, unknown> | undefined;
  if (extended && typeof extended === "object") {
    if (extended["card_style"] === "solid" || extended["card_style"] === "neon") {
      result.card_style = extended["card_style"];
    }
    if (extended["game_colors"] && typeof extended["game_colors"] === "object") {
      result.game_colors = extended["game_colors"] as Record<string, string>;
    }
    if (typeof extended["logo_size"] === "number") result.logo_size = extended["logo_size"];
    if (typeof extended["font_size_scale"] === "number")
      result.font_size_scale = extended["font_size_scale"];
    if (typeof extended["hero_card_scale"] === "number")
      result.hero_card_scale = extended["hero_card_scale"];
    if (typeof extended["animal_scale"] === "number")
      result.animal_scale = extended["animal_scale"];
  }

  // Also check if columns directly existed
  if (data["card_style"] === "solid" || data["card_style"] === "neon") {
    result.card_style = data["card_style"];
  }
  if (data["game_colors"] && typeof data["game_colors"] === "object") {
    result.game_colors = data["game_colors"] as Record<string, string>;
  }
  if (typeof data["logo_size"] === "number") result.logo_size = data["logo_size"];
  if (typeof data["font_size_scale"] === "number") result.font_size_scale = data["font_size_scale"];
  if (typeof data["hero_card_scale"] === "number") result.hero_card_scale = data["hero_card_scale"];
  if (typeof data["animal_scale"] === "number") result.animal_scale = data["animal_scale"];

  return result;
}

export interface GameWithResults extends Game {
  latest_results: Result[];
}

export interface TvDevice {
  id: string;
  device_id: string;
  device_name: string;
  pairing_code: string | null;
  is_active: boolean;
  expires_at: string | null;
  activated_at: string | null;
  created_at: string;
}

export interface TvPairingCode {
  code: string;
  device_id: string;
  created_at: string;
}

export interface LicenseInfo {
  id: string;
  username: string;
  password_hash: string;
  serial_number: string;
  is_active: boolean;
  device_id: string | null;
  activated_at: string | null;
  expires_at: string | null;
  created_at: string;
}

export interface ClientLicense {
  id: string;
  client_name: string;
  pin_code: string;
  status: "active" | "paused";
  expires_at: string | null;
  max_devices: number;
  bound_device_ids: string[];
  notes?: string;
  created_at: string;
}

const MASTER_GLOBAL_DESIGN_DELIMITER = "||GLOBAL_DESIGN:";

export function packMasterNotesWithGlobalSettings(
  requireLicense: boolean,
  settings?: Partial<AppSettings> | null,
): string {
  const base = requireLicense ? "PIN Maestro: 291007" : "PIN Maestro: 291007||REQUIRE:0";
  if (!settings) return base;
  try {
    return `${base}${MASTER_GLOBAL_DESIGN_DELIMITER}${JSON.stringify(settings)}`;
  } catch {
    return base;
  }
}

export function parseGlobalSettingsFromMasterNotes(notes?: string | null): AppSettings | null {
  if (!notes || typeof notes !== "string") return null;
  const idx = notes.indexOf(MASTER_GLOBAL_DESIGN_DELIMITER);
  if (idx < 0) return null;
  const jsonStr = notes.slice(idx + MASTER_GLOBAL_DESIGN_DELIMITER.length).trim();
  if (!jsonStr.startsWith("{")) return null;
  try {
    const parsed = JSON.parse(jsonStr);
    if (!parsed || typeof parsed !== "object") return null;
    const decoded = parseAppSettingsFromSupabase(parsed as Record<string, unknown>);
    const merged: AppSettings = {
      ...DEFAULT_APP_SETTINGS,
      ...(parsed as Partial<AppSettings>),
      ...(decoded || {}),
      id: "global",
      font_family: cleanFontFamily(
        (decoded?.font_family || (parsed as Partial<AppSettings>).font_family) as string,
      ),
    };
    return merged;
  } catch {
    return null;
  }
}

export function stripInternalMasterNotes(notes?: string | null): string {
  if (!notes || typeof notes !== "string") return "";
  return notes
    .replace(/\|\|GLOBAL_DESIGN:\{[\s\S]*\}$/, "")
    .replace(/\|\|REQUIRE:[01]/g, "")
    .trim();
}
