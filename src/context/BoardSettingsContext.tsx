import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { supabase } from "@/lib/supabase";
import { DEFAULT_APP_SETTINGS, type AppSettings } from "@/lib/types";

interface BoardSettingsContextType {
  settings: AppSettings;
  refreshSettings: () => Promise<void>;
  updateSettings: (newSettings: Partial<AppSettings>) => void;
}

const SettingsContext = createContext<BoardSettingsContextType | undefined>(undefined);

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

  async function refreshSettings() {
    let localData: AppSettings | null = null;
    if (typeof window !== "undefined") {
      try {
        const saved = localStorage.getItem("pizarra_app_settings");
        if (saved) localData = JSON.parse(saved);
      } catch {
        // ignore
      }
    }

    const { data } = await supabase
      .from("app_settings")
      .select("*")
      .eq("id", "global")
      .maybeSingle();

    if (data) {
      const merged = { ...DEFAULT_APP_SETTINGS, ...(localData ?? {}), ...(data as AppSettings) };
      setSettings(merged);
      if (typeof window !== "undefined") {
        localStorage.setItem("pizarra_app_settings", JSON.stringify(merged));
      }
    } else if (localData) {
      setSettings({ ...DEFAULT_APP_SETTINGS, ...localData });
    }
  }

  function updateSettings(newSettings: Partial<AppSettings>) {
    setSettings((prev) => {
      const updated = { ...prev, ...newSettings };
      if (typeof window !== "undefined") {
        localStorage.setItem("pizarra_app_settings", JSON.stringify(updated));
      }
      return updated;
    });
  }

  useEffect(() => {
    refreshSettings();
    const channel = supabase
      .channel(`app-settings-${Math.random().toString(36).slice(2)}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "app_settings" },
        refreshSettings,
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  return (
    <SettingsContext.Provider value={{ settings, refreshSettings, updateSettings }}>
      {children}
    </SettingsContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useBoardSettings() {
  const context = useContext(SettingsContext);
  if (!context) throw new Error("useBoardSettings must be used within BoardSettingsProvider");
  return context;
}
