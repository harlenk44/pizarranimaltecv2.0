import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from "react";
import { supabase } from "@/lib/supabase";
import { DEFAULT_APP_SETTINGS, type AppSettings, parseAppSettingsFromSupabase } from "@/lib/types";

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
          return { ...DEFAULT_APP_SETTINGS, ...parsed };
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

    // 1. Fetch from Supabase app_settings table
    try {
      const { data, error } = await supabase
        .from("app_settings")
        .select("*")
        .eq("id", "global")
        .maybeSingle();

      if (!error && data) {
        cloudData = parseAppSettingsFromSupabase(data as Record<string, unknown>);
        console.log(
          "[BoardDesign:Context] Datos recibidos de tabla Supabase app_settings:",
          cloudData,
        );
      } else if (error) {
        console.warn("[BoardDesign:Context] Aviso al consultar Supabase app_settings:", error);
      }
    } catch (err) {
      console.warn("[BoardDesign:Context] Excepción al consultar Supabase:", err);
    }

    // 2. Fetch from server sync endpoint (app_settings.persisted.json)
    try {
      const res = await fetch("/api/public/results/sync");
      if (res.ok) {
        const syncJson = await res.json();
        if (syncJson?.appSettings && typeof syncJson.appSettings === "object") {
          serverData = syncJson.appSettings as AppSettings;
          console.log("[BoardDesign:Context] Datos recibidos de sync endpoint:", serverData);
        }
      }
    } catch {
      // ignore
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

    // Merge baseline defaults, server persisted data, and cloud Supabase (strictly read-only:
    // opening a board on one TV/browser must NEVER push localStorage back to global cloud app_settings)
    const hasAuthoritativeRemote = Boolean(cloudData || serverData);
    const merged: AppSettings = {
      ...DEFAULT_APP_SETTINGS,
      ...(localData && !hasAuthoritativeRemote ? localData : {}),
      ...(serverData || {}),
      ...(cloudData || {}),
      id: "global",
    };

    if (hasAuthoritativeRemote && localData) {
      // Preserve local extended settings only when neither cloud nor server defines them
      if (!cloudData?.game_colors && !serverData?.game_colors && localData.game_colors) {
        merged.game_colors = { ...localData.game_colors };
      } else {
        merged.game_colors = {
          ...(serverData?.game_colors || {}),
          ...(cloudData?.game_colors || {}),
        };
      }
      if (!cloudData?.card_style && !serverData?.card_style && localData.card_style) {
        merged.card_style = localData.card_style;
      }
    }

    console.log("[BoardDesign:Context] Configuración final consolidada para renderizar:", {
      background_color: merged.background_color,
      surface_color: merged.surface_color,
      card_color: merged.card_color,
      primary_color: merged.primary_color,
      result_row_color: merged.result_row_color,
      text_color: merged.text_color,
      card_style: merged.card_style,
      font_family: merged.font_family,
      updated_at: merged.updated_at,
    });

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
      const updated: AppSettings = {
        ...prev,
        ...newSettings,
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

    // BroadcastChannel for instant inter-tab/inter-window sync
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

    const channel = supabase
      .channel("app-settings-realtime-sync")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "app_settings" },
        refreshSettings,
      )
      .subscribe();

    return () => {
      bc?.close();
      supabase.removeChannel(channel);
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
