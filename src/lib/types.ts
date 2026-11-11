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
  background_color: "#020617",
  surface_color: "#0f172a",
  primary_color: "#2563eb",
  text_color: "#f8fafc",
  card_color: "#0f172a",
  result_row_color: "#1e293b",
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

/**
 * Sanitizes AppSettings into the exact standard columns of the Supabase public.app_settings table.
 * Strips non-column properties so PostgREST never fails with 'column not found' errors.
 */
export function sanitizeAppSettingsForSupabase(
  settings: Partial<AppSettings>,
): Record<string, unknown> {
  return {
    id: "global",
    background_color: settings.background_color || DEFAULT_APP_SETTINGS.background_color,
    surface_color: settings.surface_color || DEFAULT_APP_SETTINGS.surface_color,
    primary_color: settings.primary_color || DEFAULT_APP_SETTINGS.primary_color,
    text_color: settings.text_color || DEFAULT_APP_SETTINGS.text_color,
    card_color: settings.card_color || DEFAULT_APP_SETTINGS.card_color,
    result_row_color: settings.result_row_color || DEFAULT_APP_SETTINGS.result_row_color,
    font_family: settings.font_family || DEFAULT_APP_SETTINGS.font_family,
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
 * safely inspecting standard columns and any theme_config/custom_styles JSON columns if present.
 */
export function parseAppSettingsFromSupabase(
  data: Record<string, unknown> | null | undefined,
): Partial<AppSettings> | null {
  if (!data || typeof data !== "object") return null;
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
    font_family: typeof data["font_family"] === "string" ? data["font_family"] : undefined,
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
