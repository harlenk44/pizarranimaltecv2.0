import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from "react";
import { supabase } from "@/lib/supabase";
import { isExternalSupabaseActive } from "@/integrations/supabase/client";
import {
  DEFAULT_APP_SETTINGS,
  type AppSettings,
  cleanFontFamily,
  parseAppSettingsFromSupabase,
  parseGlobalSettingsFromMasterNotes,
} from "@/lib/types";

function hasExternalSupabaseConfigured(): boolean {
  return isExternalSupabaseActive();
}

interface BoardSettingsContextType {
  settings: AppSettings;
  refreshSettings: () => Promise<void>;
  updateSettings: (newSettings: Partial<AppSettings>) => void;
}

const DEFAULT_SETTINGS_CONTEXT: BoardSettingsContextType = {
  settings: DEFAULT_APP_SETTINGS,
  refreshSettings: async () => {},
  updateSettings: () => {},
};

const SettingsContext = createContext<BoardSettingsContextType>(DEFAULT_SETTINGS_CONTEXT);

function getInitialSettings(): AppSettings {
  if (typeof window !== "undefined") {
    try {
      const saved = localStorage.getItem("pizarra_app_settings");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && typeof parsed === "object") {
          const decoded = parseAppSettingsFromSupabase(parsed as Record<string, unknown>);
          return {
            ...DEFAULT_APP_SETTINGS,
            ...parsed,
            ...(decoded || {}),
            font_family: cleanFontFamily((decoded?.font_family || parsed.font_family) as string),
            id: "global",
          };
        }
      }
    } catch {
      // ignore
    }
  }
  return DEFAULT_APP_SETTINGS;
}

export function BoardSettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<AppSettings>(getInitialSettings);

  const refreshSettings = useCallback(async () => {
    let cloudData: Partial<AppSettings> | null = null;
    let serverData: Partial<AppSettings> | null = null;
    const useDirectSupabase = hasExternalSupabaseConfigured();

    // 1. Fetch from Supabase app_settings AND master license row (291007) in licenses table
    //    when an external browser Supabase URL is configured.
    if (useDirectSupabase) {
      try {
        const [{ data, error }, masterLicRes] = await Promise.all([
          supabase.from("app_settings").select("*").eq("id", "global").maybeSingle(),
          supabase
            .from("licenses")
            .select("pin_code, notes")
            .eq("pin_code", "291007")
            .maybeSingle(),
        ]);

        if (!error && data) {
          cloudData = parseAppSettingsFromSupabase(data as Record<string, unknown>);
        } else if (error) {
          console.warn("[BoardDesign:Context] Aviso al consultar Supabase app_settings:", error);
        }

        if (!masterLicRes.error && masterLicRes.data) {
          const masterNotes = (masterLicRes.data as Record<string, unknown>)["notes"];
          if (typeof masterNotes === "string") {
            const masterSettings = parseGlobalSettingsFromMasterNotes(masterNotes);
            if (masterSettings) {
              const masterTs = masterSettings.updated_at
                ? new Date(masterSettings.updated_at).getTime()
                : 0;
              const appTs = cloudData?.updated_at ? new Date(cloudData.updated_at).getTime() : 0;
              if (!cloudData || masterTs >= appTs) {
                cloudData = masterSettings;
              }
            }
          }
        }
      } catch (err) {
        console.warn("[BoardDesign:Context] Excepción al consultar Supabase:", err);
      }
    }

    // 2. Fallback to server sync endpoint ONLY when direct Supabase settings were unavailable (0 Worker calls in normal operation)
    if (!cloudData) {
      try {
        const res = await fetch(
          "/api/public/results/sync?poll=1&logosVersion=1&gamesVersion=1&imagesVersion=1",
          { cache: "no-store" },
        );
        if (res.ok) {
          const syncJson = await res.json();
          if (syncJson?.appSettings && typeof syncJson.appSettings === "object") {
            const rawServer = syncJson.appSettings as Record<string, unknown>;
            const parsedServer = parseAppSettingsFromSupabase(rawServer);
            serverData = {
              ...(rawServer as Partial<AppSettings>),
              ...(parsedServer || {}),
            };
          }
        }
      } catch {
        // ignore
      }
    }

    let localData: AppSettings | null = null;
    if (typeof window !== "undefined") {
      try {
        const saved = localStorage.getItem("pizarra_app_settings");
        if (saved) localData = JSON.parse(saved);
      } catch {
        // ignore
      }
    }

    // Pick newest authoritative remote source (serverData vs real cloudData)
    const serverTime = serverData?.updated_at ? new Date(serverData.updated_at).getTime() : 0;
    const cloudTime = cloudData?.updated_at ? new Date(cloudData.updated_at).getTime() : 0;
    const cloudIsNewer = Boolean(cloudData && (!serverData || cloudTime > serverTime));

    const hasAuthoritativeRemote = Boolean(cloudData || serverData);
    const merged: AppSettings = {
      ...DEFAULT_APP_SETTINGS,
      ...(localData && !hasAuthoritativeRemote ? localData : {}),
      ...(cloudIsNewer ? serverData || {} : cloudData || {}),
      ...(cloudIsNewer ? cloudData || {} : serverData || {}),
      id: "global",
    };

    merged.font_family = cleanFontFamily(merged.font_family);
    merged.game_colors = {
      ...(cloudIsNewer ? serverData?.game_colors || {} : cloudData?.game_colors || {}),
      ...(cloudIsNewer ? cloudData?.game_colors || {} : serverData?.game_colors || {}),
    };
    if (!hasAuthoritativeRemote && localData?.game_colors) {
      merged.game_colors = { ...localData.game_colors };
    }

    setSettings(merged);
    if (typeof window !== "undefined") {
      try {
        localStorage.setItem("pizarra_app_settings", JSON.stringify(merged));
      } catch {
        // ignore
      }
    }
  }, []);

  const updateSettings = useCallback((newSettings: Partial<AppSettings>) => {
    setSettings((prev) => {
      const decoded = parseAppSettingsFromSupabase(newSettings as Record<string, unknown>);
      const updated: AppSettings = {
        ...prev,
        ...newSettings,
        ...(decoded || {}),
        font_family: cleanFontFamily(
          (decoded?.font_family || newSettings.font_family || prev.font_family) as string,
        ),
        id: "global",
        updated_at: newSettings.updated_at ?? new Date().toISOString(),
      };
      if (typeof window !== "undefined") {
        localStorage.setItem("pizarra_app_settings", JSON.stringify(updated));
      }
      return updated;
    });
  }, []);

  useEffect(() => {
    refreshSettings();

    // BroadcastChannel for instant inter-tab/inter-window sync on same browser profile
    let bc: BroadcastChannel | null = null;
    try {
      bc = new BroadcastChannel("pizarra_lottery_channel");
      bc.onmessage = (event) => {
        if (event.data?.type === "APP_SETTINGS_UPDATED") {
          refreshSettings();
        }
      };
    } catch {
      // ignore
    }

    const useDirectSupabase = hasExternalSupabaseConfigured();
    const channel = useDirectSupabase
      ? supabase
          .channel("app-settings-realtime-sync")
          .on(
            "postgres_changes",
            { event: "*", schema: "public", table: "app_settings" },
            refreshSettings,
          )
          .subscribe()
      : null;

    return () => {
      bc?.close();
      if (channel) {
        supabase.removeChannel(channel);
      }
    };
  }, [refreshSettings]);

  return (
    <SettingsContext.Provider value={{ settings, refreshSettings, updateSettings }}>
      {children}
    </SettingsContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useBoardSettings() {
  const context = useContext(SettingsContext);
  return context ?? DEFAULT_SETTINGS_CONTEXT;
}
