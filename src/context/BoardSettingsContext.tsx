import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from "react";
import { supabase } from "@/lib/supabase";
import { DEFAULT_APP_SETTINGS, type AppSettings } from "@/lib/types";

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
    let cloudData: AppSettings | null = null;

    // 1. Fetch from Supabase
    try {
      const { data, error } = await supabase
        .from("app_settings")
        .select("*")
        .eq("id", "global")
        .maybeSingle();

      if (!error && data) {
        cloudData = data as AppSettings;
      }
    } catch {
      // ignore
    }

    // 2. Fetch from server sync endpoint if Supabase is offline or returns nothing
    if (!cloudData) {
      try {
        const res = await fetch("/api/public/results/sync");
        if (res.ok) {
          const syncJson = await res.json();
          if (syncJson?.appSettings && typeof syncJson.appSettings === "object") {
            cloudData = syncJson.appSettings as AppSettings;
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

    if (cloudData && localData) {
      const cloudTime = cloudData.updated_at ? new Date(cloudData.updated_at).getTime() : 0;
      const localTime = localData.updated_at ? new Date(localData.updated_at).getTime() : 0;

      let merged: AppSettings;
      if (localTime > cloudTime) {
        // Local settings are newer: preserve them and sync to cloud/server
        merged = { ...DEFAULT_APP_SETTINGS, ...cloudData, ...localData, id: "global" };
        fetch("/api/public/results/sync", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ appSettings: merged }),
        }).catch(() => {});
        supabase
          .from("app_settings")
          .upsert(merged, { onConflict: "id" })
          .catch(() => {});
      } else {
        // Cloud settings are newer or equal
        merged = { ...DEFAULT_APP_SETTINGS, ...localData, ...cloudData, id: "global" };
      }

      setSettings(merged);
      if (typeof window !== "undefined") {
        localStorage.setItem("pizarra_app_settings", JSON.stringify(merged));
      }
    } else if (cloudData) {
      const merged = { ...DEFAULT_APP_SETTINGS, ...cloudData, id: "global" };
      setSettings(merged);
      if (typeof window !== "undefined") {
        localStorage.setItem("pizarra_app_settings", JSON.stringify(merged));
      }
    } else if (localData) {
      setSettings({ ...DEFAULT_APP_SETTINGS, ...localData, id: "global" });
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
      .channel(`app-settings-${Math.random().toString(36).slice(2)}`)
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
