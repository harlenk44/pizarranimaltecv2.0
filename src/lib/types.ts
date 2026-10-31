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
  updated_at: "",
};

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
