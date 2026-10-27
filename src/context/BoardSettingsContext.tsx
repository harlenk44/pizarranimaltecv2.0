import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { supabase } from "@/lib/supabase";
import { DEFAULT_APP_SETTINGS, type AppSettings } from "@/lib/types";

const SettingsContext = createContext<
  { settings: AppSettings; refreshSettings: () => Promise<void> } | undefined
>(undefined);

export function BoardSettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState(DEFAULT_APP_SETTINGS);
  async function refreshSettings() {
    const { data } = await supabase
      .from("app_settings")
      .select("*")
      .eq("id", "global")
      .maybeSingle();
    if (data) setSettings(data as AppSettings);
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
    <SettingsContext.Provider value={{ settings, refreshSettings }}>
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
