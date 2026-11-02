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
  let serverAds: Ad[] = [];
  let serverTicker: AdTickerConfig = local.ticker;
  let serverReachable = false;

  try {
    const res = await fetch(`/api/media?store=ads&_t=${Date.now()}`, {
      cache: "no-store",
    });
    if (res.ok) {
      serverReachable = true;
      const serverData = await res.json();
      serverAds = Array.isArray(serverData?.ads) ? (serverData.ads as Ad[]) : [];
      if (serverData?.ticker && typeof serverData.ticker === "object") {
        serverTicker = { ...DEFAULT_AD_TICKER, ...serverData.ticker };
      }

      if (serverAds.length > 0) {
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

  // If server had 0 ads (e.g., right after republishing or container restart), check Supabase
  try {
    const { data } = await supabase
      .from("ads")
      .select("*")
      .order("display_order", { ascending: true });
    if (Array.isArray(data) && data.length > 0) {
      const supaState: AdsStoreState = {
        ads: data as Ad[],
        ticker: serverTicker,
      };
      if (serverReachable) {
        fetch("/api/media?store=ads", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(supaState),
        }).catch(() => {});
      }
      return supaState;
    }
  } catch {
    // ignore
  }

  // If this device (e.g. Admin browser) has ads in localStorage while server is empty after republish,
  // automatically re-publish local ads to the server so Smart TVs receive them immediately.
  if (local.ads.length > 0 && serverReachable && serverAds.length === 0) {
    fetch("/api/media?store=ads", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(local),
    }).catch(() => {});
  }

  return {
    ads: local.ads,
    ticker: serverReachable ? serverTicker : local.ticker,
  };
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

  if (state.ads !== undefined) {
    try {
      await supabase.from("ads").delete().neq("id", "");
      if (updated.ads.length > 0) {
        await supabase.from("ads").upsert(updated.ads, { onConflict: "id" });
      }
    } catch {
      // ignore
    }
  }

  return updated;
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("No se pudo leer el archivo multimedia"));
    reader.readAsDataURL(file);
  });
}

async function compressImageToDataUrl(file: File): Promise<string> {
  const rawDataUrl = await readFileAsDataUrl(file);
  if (file.type === "image/gif" || file.type === "image/svg+xml" || file.size <= 350 * 1024) {
    return rawDataUrl;
  }
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      try {
        const maxW = 1600;
        const maxH = 900;
        let w = img.naturalWidth || img.width;
        let h = img.naturalHeight || img.height;
        if (w > maxW || h > maxH) {
          const ratio = Math.min(maxW / w, maxH / h);
          w = Math.round(w * ratio);
          h = Math.round(h * ratio);
        }
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          resolve(rawDataUrl);
          return;
        }
        ctx.drawImage(img, 0, 0, w, h);
        const outType = file.type === "image/png" ? "image/png" : "image/jpeg";
        const compressed = canvas.toDataURL(outType, 0.88);
        resolve(compressed.length < rawDataUrl.length ? compressed : rawDataUrl);
      } catch {
        resolve(rawDataUrl);
      }
    };
    img.onerror = () => resolve(rawDataUrl);
    img.src = rawDataUrl;
  });
}

export async function uploadAdMediaFile(
  file: File,
): Promise<{ url: string; mediaType: "image" | "video" }> {
  const mediaType: "image" | "video" = file.type.startsWith("video/") ? "video" : "image";

  // For images, embed a self-contained data URL so banners never break across Cloud Run instances or republishes
  if (mediaType === "image") {
    const dataUrl = await compressImageToDataUrl(file);
    return { url: dataUrl, mediaType: "image" };
  }

  const formData = new FormData();
  formData.append("file", file);

  try {
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
  } catch {
    // fallback to dataURL
  }

  const fallbackUrl = await readFileAsDataUrl(file);
  return { url: fallbackUrl, mediaType };
}
