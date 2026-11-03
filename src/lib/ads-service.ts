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

function getMediaApiUrl(query: string = ""): string {
  if (
    typeof window !== "undefined" &&
    window.location?.origin &&
    window.location.origin !== "null"
  ) {
    return `${window.location.origin}/api/media${query}`;
  }
  return `/api/media${query}`;
}

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
      localStorage.removeItem("pizarra_persisted_ads");
      localStorage.removeItem("pizarra_ads");
      sessionStorage.removeItem("pizarra_persisted_ads");
      sessionStorage.removeItem("pizarra_ads");
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

export async function deleteAdFromStore(ad: Ad): Promise<AdsStoreState> {
  // 1. Borrado real y persistente en Supabase
  let supaError: Error | null = null;
  try {
    const { error } = await supabase.from("ads").delete().eq("id", ad.id);
    if (error) {
      supaError = new Error(`Error Supabase: ${error.message}`);
      console.error("[Publicidad] Error al eliminar anuncio en Supabase:", error);
    }
  } catch (err) {
    supaError = err instanceof Error ? err : new Error(String(err));
    console.error("[Publicidad] Excepción al eliminar en Supabase:", err);
  }

  // 2. Si la imagen está en Supabase Storage, eliminarla del bucket
  if (ad.image_url) {
    try {
      let storagePath = "";
      if (ad.image_url.includes("/ads/")) {
        storagePath = ad.image_url.split("/ads/")[1]?.split("?")[0] || "";
      } else if (!ad.image_url.startsWith("http") && !ad.image_url.startsWith("data:")) {
        storagePath = ad.image_url;
      }
      if (storagePath) {
        const { error: stErr } = await supabase.storage.from("ads").remove([storagePath]);
        if (stErr) {
          console.warn("[Publicidad] Advertencia al eliminar archivo de storage:", stErr);
        }
      }
    } catch (stEx) {
      console.warn("[Publicidad] Excepción al eliminar de storage:", stEx);
    }
  }

  // 3. Limpieza inmediata y persistente de localStorage y caché local
  const current = loadLocalAdsStore();
  const nextAds = (current.ads || []).filter((item) => item.id !== ad.id);
  const nextState: AdsStoreState = {
    ads: nextAds,
    ticker: current.ticker,
  };

  if (typeof window !== "undefined") {
    try {
      localStorage.setItem(ADS_LOCAL_KEY, JSON.stringify(nextAds));
      localStorage.removeItem("pizarra_persisted_ads");
      localStorage.removeItem("pizarra_ads");
      sessionStorage.removeItem("pizarra_persisted_ads");
      sessionStorage.removeItem("pizarra_ads");
    } catch {
      // ignore
    }
  }

  // 4. Sincronización en el servidor /api/media
  try {
    await fetch(getMediaApiUrl("?store=ads"), {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(nextState),
    });
  } catch (err) {
    console.warn("[Publicidad] Advertencia al actualizar servidor de medios tras borrado:", err);
  }

  // 5. Notificación en tiempo real a todas las ventanas / pizarras
  if (typeof window !== "undefined") {
    try {
      const bc = new BroadcastChannel("pizarra_ads_channel");
      bc.postMessage({ type: "ADS_UPDATED", payload: nextState });
      bc.close();
    } catch {
      // ignore
    }
    window.dispatchEvent(new CustomEvent("pizarra:ads-updated", { detail: nextState }));
  }

  if (supaError) {
    throw supaError;
  }

  return nextState;
}

export async function fetchAdsStore(): Promise<AdsStoreState> {
  const local = loadLocalAdsStore();
  let serverTicker: AdTickerConfig = local.ticker;

  // 1. Fuente de verdad principal: Supabase
  try {
    const { data, error } = await supabase
      .from("ads")
      .select("*")
      .order("display_order", { ascending: true });

    if (!error && Array.isArray(data)) {
      // Supabase respondió con la lista autoritativa actual (incluso si está vacía)
      const authoritativeAds = data as Ad[];

      // Leer el ticker del servidor si existe
      try {
        const res = await fetch(getMediaApiUrl(`?store=ads&_t=${Date.now()}`), {
          cache: "no-store",
        });
        if (res.ok) {
          const serverData = await res.json();
          if (serverData?.ticker && typeof serverData.ticker === "object") {
            serverTicker = { ...DEFAULT_AD_TICKER, ...serverData.ticker };
          }
        }
      } catch {
        // ignore
      }

      const freshState: AdsStoreState = {
        ads: authoritativeAds,
        ticker: serverTicker,
      };

      // Guardar el estado real en localStorage (sin revivir anuncios borrados)
      if (typeof window !== "undefined") {
        try {
          localStorage.setItem(ADS_LOCAL_KEY, JSON.stringify(authoritativeAds));
          localStorage.setItem(TICKER_LOCAL_KEY, JSON.stringify(serverTicker));
          localStorage.removeItem("pizarra_persisted_ads");
          localStorage.removeItem("pizarra_ads");
        } catch {
          // ignore
        }
      }

      // Sincronizar servidor de medios con el estado real
      fetch(getMediaApiUrl("?store=ads"), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(freshState),
      }).catch(() => {});

      return freshState;
    }
  } catch (err) {
    console.warn("[Publicidad] Advertencia al consultar Supabase:", err);
  }

  // 2. Segunda opción: Servidor de medios /api/media?store=ads
  try {
    const res = await fetch(getMediaApiUrl(`?store=ads&_t=${Date.now()}`), {
      cache: "no-store",
    });
    if (res.ok) {
      const serverData = await res.json();
      const serverAds = Array.isArray(serverData?.ads) ? (serverData.ads as Ad[]) : [];
      if (serverData?.ticker && typeof serverData.ticker === "object") {
        serverTicker = { ...DEFAULT_AD_TICKER, ...serverData.ticker };
      }

      const serverState: AdsStoreState = {
        ads: serverAds,
        ticker: serverTicker,
      };

      if (typeof window !== "undefined") {
        try {
          localStorage.setItem(ADS_LOCAL_KEY, JSON.stringify(serverAds));
          localStorage.setItem(TICKER_LOCAL_KEY, JSON.stringify(serverTicker));
          localStorage.removeItem("pizarra_persisted_ads");
          localStorage.removeItem("pizarra_ads");
        } catch {
          // ignore
        }
      }

      return serverState;
    }
  } catch {
    // fallback a caché local si la red está caída
  }

  // 3. Fallback en caso de desconexión total
  return {
    ads: local.ads,
    ticker: local.ticker,
  };
}

export async function persistAdsStore(state: Partial<AdsStoreState>): Promise<AdsStoreState> {
  const updated = saveLocalAdsStore(state);

  try {
    await fetch(getMediaApiUrl("?store=ads"), {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updated),
    });
  } catch {
    // ignore
  }

  if (state.ads !== undefined) {
    try {
      if (updated.ads.length === 0) {
        const { error: delErr } = await supabase.from("ads").delete().neq("id", "");
        if (delErr) {
          console.error("[Publicidad] Error al vaciar anuncios en Supabase:", delErr);
        }
      } else {
        const nextIds = updated.ads.map((a) => a.id);
        const { data: currentRows, error: selErr } = await supabase.from("ads").select("id");
        if (!selErr && Array.isArray(currentRows)) {
          const idsToDelete = currentRows.map((r) => r.id).filter((id) => !nextIds.includes(id));
          for (const delId of idsToDelete) {
            const { error: delErr } = await supabase.from("ads").delete().eq("id", delId);
            if (delErr) {
              console.error(`[Publicidad] Error eliminando anuncio ${delId} en Supabase:`, delErr);
            }
          }
        }
        const { error: upsertErr } = await supabase
          .from("ads")
          .upsert(updated.ads, { onConflict: "id" });
        if (upsertErr) {
          console.error("[Publicidad] Error en upsert de anuncios en Supabase:", upsertErr);
        }
      }
    } catch (err) {
      console.error("[Publicidad] Error sincronizando ads en Supabase:", err);
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
