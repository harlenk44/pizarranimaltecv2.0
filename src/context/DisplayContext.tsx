import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import {
  DEFAULT_DISPLAY,
  DISPLAY_STORAGE_KEY,
  parseDisplayPreferences,
  type DisplayPreferences,
} from "@/lib/display-preferences";

const DisplayContext = createContext({
  preferences: DEFAULT_DISPLAY,
  update: (_value: Partial<DisplayPreferences>) => {},
  storageError: false,
});

export function DisplayProvider({ children }: { children: ReactNode }) {
  const [preferences, setPreferences] = useState(DEFAULT_DISPLAY);
  const [ready, setReady] = useState(false);
  const [storageError, setStorageError] = useState(false);
  useEffect(() => {
    try {
      setPreferences(parseDisplayPreferences(localStorage.getItem(DISPLAY_STORAGE_KEY)));
    } catch {
      setStorageError(true);
    }
    setReady(true);
  }, []);
  useEffect(() => {
    if (!ready) return;
    try {
      localStorage.setItem(DISPLAY_STORAGE_KEY, JSON.stringify(preferences));
      setStorageError(false);
    } catch {
      setStorageError(true);
    }
  }, [preferences, ready]);
  return (
    <DisplayContext.Provider
      value={{
        preferences,
        update: (value) => setPreferences((current) => ({ ...current, ...value })),
        storageError,
      }}
    >
      {children}
    </DisplayContext.Provider>
  );
}

export const useDisplay = () => useContext(DisplayContext);
