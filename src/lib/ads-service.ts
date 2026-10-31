import type { Ad } from "@/lib/types";
import { supabase } from "@/lib/supabase";

export interface AdTickerConfig {
  enabled: boolean;
  text: string;
  bgColor: string;
  textColor: string;
  speedSeconds: number;
  carouselIntervalSeconds: number;
}

export interface AdsStoreState {
  ads: Ad[];
  ticker: AdTickerConfig;
}

const ADS_LOCAL_KEY = "pizarra_persisted_ads_v1";
const TICKER_LOCAL_KEY = "pizarra_persisted_ticker_v1";

export const DEFAULT_AD_TICKER: AdTickerConfig = {
  enabled: false,
  text: "¡Bienvenidos! Consulta los resultados de animalitos en vivo · Pagos al instante",
  bgColor: "#1e3a8a",
  textColor: "#ffffff",
  speedSeconds: 25,
  carouselIntervalSeconds: 8,
};

export function loadLocalAdsStore(): AdsStoreState {
  if (typeof window === "undefined") {
    return { ads: [], ticker: DEFAULT_AD_TICKER };
  }
  let ads: Ad[] = [];
  let ticker: AdTickerConfig = { ...DEFAULT_AD_TICKER };

  try {
    const rawAds = localStorage.getItem(ADS_LOCAL_KEY);
    if (rawAds) {
      const parsed = JSON.parse(rawAds);
      if (Array.isArray(parsed)) ads = parsed;
    }
  } catch {
    // ignore
  }

  try {
    const rawTicker = localStorage.getItem(TICKER_LOCAL_KEY);
    if (rawTicker) {
      const parsed = JSON.parse(rawTicker);
      if (parsed && typeof parsed === "object") {
        ticker = { ...DEFAULT_AD_TICKER, ...parsed };
      }
    }
  } catch {
    // ignore
  }

  return { ads, ticker };
}

export function saveLocalAdsStore(state: Partial<AdsStoreState>): AdsStoreState {
  const current = loadLocalAdsStore();
  const next: AdsStoreState = {
    ads: state.ads !== undefined ? state.ads : current.ads,
    ticker: state.ticker !== undefined ? { ...current.ticker, ...state.ticker } : current.ticker,
  };

  if (typeof window !== "undefined") {
    try {
      localStorage.setItem(ADS_LOCAL_KEY, JSON.stringify(next.ads));
      localStorage.setItem(TICKER_LOCAL_KEY, JSON.stringify(next.ticker));
    } catch {
      // ignore
    }
    try {
      const bc = new BroadcastChannel("pizarra_ads_channel");
      bc.postMessage({ type: "ADS_UPDATED", payload: next });
      bc.close();
    } catch {
      // ignore
    }
    window.dispatchEvent(new CustomEvent("pizarra:ads-updated", { detail: next }));
  }

  return next;
}

export async function fetchAdsStore(): Promise<AdsStoreState> {
  const local = loadLocalAdsStore();
  try {
    const res = await fetch("/api/media?store=ads");
    if (res.ok) {
      const serverData = await res.json();
      const serverAds = Array.isArray(serverData?.ads) ? (serverData.ads as Ad[]) : [];
      const serverTicker =
        serverData?.ticker && typeof serverData.ticker === "object"
          ? ({ ...DEFAULT_AD_TICKER, ...serverData.ticker } as AdTickerConfig)
          : local.ticker;

      // If server has ads or local is empty, sync from server
      if (serverAds.length > 0 || local.ads.length === 0) {
        const merged: AdsStoreState = {
          ads: serverAds,
          ticker: serverTicker,
        };
        if (typeof window !== "undefined") {
          try {
            localStorage.setItem(ADS_LOCAL_KEY, JSON.stringify(merged.ads));
            localStorage.setItem(TICKER_LOCAL_KEY, JSON.stringify(merged.ticker));
          } catch {
            // ignore
          }
        }
        return merged;
      }
    }
  } catch {
    // fallback to supabase/mock-db or local
  }

  try {
    const { data } = await supabase
      .from("ads")
      .select("*")
      .order("display_order", { ascending: true });
    if (Array.isArray(data) && data.length > 0 && local.ads.length === 0) {
      return { ads: data as Ad[], ticker: local.ticker };
    }
  } catch {
    // ignore
  }

  return local;
}

export async function persistAdsStore(state: Partial<AdsStoreState>): Promise<AdsStoreState> {
  const updated = saveLocalAdsStore(state);
  try {
    await fetch("/api/media?store=ads", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updated),
    });
  } catch {
    // ignore
  }
  return updated;
}

export async function uploadAdMediaFile(
  file: File,
): Promise<{ url: string; mediaType: "image" | "video" }> {
  const mediaType: "image" | "video" = file.type.startsWith("video/") ? "video" : "image";
  const formData = new FormData();
  formData.append("file", file);

  const res = await fetch("/api/media", {
    method: "POST",
    body: formData,
  });

  if (res.ok) {
    const data = await res.json();
    if (data?.url) {
      return { url: data.url, mediaType };
    }
  }

  // Fallback to dataURL if multipart upload fails
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      resolve({ url: reader.result as string, mediaType });
    };
    reader.onerror = () => reject(new Error("No se pudo leer el archivo multimedia"));
    reader.readAsDataURL(file);
  });
}
