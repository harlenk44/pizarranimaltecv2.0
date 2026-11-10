import { useEffect, useState, useCallback } from "react";
import type { Ad, AdPlacement } from "@/lib/types";
import {
  fetchAdsStore,
  DEFAULT_AD_TICKER,
  type AdTickerConfig,
  type AdsStoreState,
} from "@/lib/ads-service";
import { lotteryDate } from "@/lib/lottery-date";
import { X, Megaphone } from "lucide-react";

interface AdBannerProps {
  placement: AdPlacement | AdPlacement[];
  className?: string;
}

export default function AdBanner({ placement, className = "" }: AdBannerProps) {
  const [ads, setAds] = useState<Ad[]>([]);
  const [carouselInterval, setCarouselInterval] = useState<number>(8);
  const [activeIndex, setActiveIndex] = useState<number>(0);
  const [dismissed, setDismissed] = useState<Record<string, boolean>>({});

  const applyStore = useCallback(
    (store: AdsStoreState) => {
      const allowedPlacements = new Set(Array.isArray(placement) ? placement : [placement]);
      const todayStr = lotteryDate();
      const clockValid = todayStr >= "2025-01-01";
      const filtered = (store.ads || [])
        .filter((a) => {
          if (!a.is_active) return false;
          const adPlacement = a.placement || "top";
          if (!allowedPlacements.has(adPlacement)) return false;
          if (clockValid && a.starts_at && a.starts_at.slice(0, 10) > todayStr) return false;
          if (clockValid && a.ends_at && a.ends_at.slice(0, 10) < todayStr) return false;
          return true;
        })
        .sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0));

      setAds(filtered);
      if (store.ticker?.carouselIntervalSeconds) {
        setCarouselInterval(Math.max(3, store.ticker.carouselIntervalSeconds));
      }
    },
    [placement],
  );

  useEffect(() => {
    let mounted = true;

    const load = async () => {
      const store = await fetchAdsStore();
      if (mounted) applyStore(store);
    };

    load();
    const poll = setInterval(load, 4000);

    let bc: BroadcastChannel | null = null;
    try {
      bc = new BroadcastChannel("pizarra_ads_channel");
      bc.onmessage = (event) => {
        if (event.data?.type === "ADS_UPDATED" && event.data.payload && mounted) {
          applyStore(event.data.payload as AdsStoreState);
        }
      };
    } catch {
      // ignore
    }

    const onCustomUpdate = (e: Event) => {
      const detail = (e as CustomEvent<AdsStoreState>).detail;
      if (detail && mounted) applyStore(detail);
    };
    window.addEventListener("pizarra:ads-updated", onCustomUpdate);

    return () => {
      mounted = false;
      clearInterval(poll);
      bc?.close();
      window.removeEventListener("pizarra:ads-updated", onCustomUpdate);
    };
  }, [applyStore]);

  const visibleAds = ads.filter((a) => !dismissed[a.id]);

  useEffect(() => {
    if (visibleAds.length <= 1) {
      setActiveIndex(0);
      return;
    }
    const timer = setInterval(() => {
      setActiveIndex((prev) => (prev + 1) % visibleAds.length);
    }, carouselInterval * 1000);
    return () => clearInterval(timer);
  }, [visibleAds.length, carouselInterval]);

  if (visibleAds.length === 0) return null;

  const ad = visibleAds[activeIndex % visibleAds.length] ?? visibleAds[0]!;

  const isSidebar = placement === "sidebar";
  const containerSizeClass = isSidebar
    ? "w-1/4 h-full shrink-0 overflow-hidden p-1.5"
    : "w-full h-[15vh] shrink-0 overflow-hidden px-3 py-1";

  const Wrapper = ad.link_url ? "a" : "div";
  const wrapperProps = ad.link_url
    ? { href: ad.link_url, target: "_blank", rel: "noopener noreferrer" }
    : {};

  return (
    <div className={`relative group ${containerSizeClass} ${className}`}>
      <Wrapper
        {...wrapperProps}
        className="w-full h-full overflow-hidden relative flex items-center justify-center rounded-xl border border-slate-800/90 bg-slate-950 shadow-lg"
      >
        {ad.media_type === "video" ? (
          <video
            key={ad.image_url}
            src={ad.image_url}
            className="w-full h-full object-contain max-h-full max-w-full block"
            autoPlay
            muted
            loop
            playsInline
            aria-label={ad.title || "Publicidad"}
          />
        ) : (
          <img
            key={ad.image_url}
            src={ad.image_url}
            alt={ad.title || "Publicidad"}
            loading="lazy"
            decoding="async"
            className="w-full h-full object-contain max-h-full max-w-full block"
          />
        )}

        {ad.title && (
          <div className="absolute bottom-1.5 right-2 bg-slate-950/75 backdrop-blur-sm text-white text-[11px] font-semibold px-2.5 py-0.5 rounded-md border border-slate-800/80">
            {ad.title}
          </div>
        )}
      </Wrapper>

      {visibleAds.length > 1 && (
        <div className="absolute bottom-2.5 left-1/2 -translate-x-1/2 flex items-center gap-1.5 bg-slate-950/70 px-2 py-1 rounded-full">
          {visibleAds.map((item, idx) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setActiveIndex(idx)}
              className={`w-1.5 h-1.5 rounded-full transition ${
                idx === activeIndex % visibleAds.length ? "bg-blue-400 w-3" : "bg-slate-500"
              }`}
              aria-label={`Ver anuncio ${idx + 1}`}
            />
          ))}
        </div>
      )}

      <button
        type="button"
        onClick={() => setDismissed((prev) => ({ ...prev, [ad.id]: true }))}
        className="absolute top-2.5 right-5 p-1 rounded-md bg-slate-900/80 hover:bg-slate-800 text-slate-300 hover:text-white opacity-0 group-hover:opacity-100 transition"
        title="Ocultar anuncio"
      >
        <X className="w-3.5 h-3.5" />
      </button>
      <span className="absolute top-2.5 left-5 text-[9px] font-mono uppercase tracking-wider text-slate-300/80 bg-slate-950/75 px-1.5 py-0.5 rounded border border-slate-800/60">
        Publicidad
      </span>
    </div>
  );
}

export function AdTickerBar() {
  const [ticker, setTicker] = useState<AdTickerConfig>(DEFAULT_AD_TICKER);

  useEffect(() => {
    let mounted = true;

    const load = async () => {
      const store = await fetchAdsStore();
      if (mounted && store.ticker) {
        setTicker(store.ticker);
      }
    };

    load();
    const poll = setInterval(load, 10000);

    let bc: BroadcastChannel | null = null;
    try {
      bc = new BroadcastChannel("pizarra_ads_channel");
      bc.onmessage = (event) => {
        if (event.data?.type === "ADS_UPDATED" && event.data.payload?.ticker && mounted) {
          setTicker(event.data.payload.ticker as AdTickerConfig);
        }
      };
    } catch {
      // ignore
    }

    const onCustomUpdate = (e: Event) => {
      const detail = (e as CustomEvent<AdsStoreState>).detail;
      if (detail?.ticker && mounted) setTicker(detail.ticker);
    };
    window.addEventListener("pizarra:ads-updated", onCustomUpdate);

    return () => {
      mounted = false;
      clearInterval(poll);
      bc?.close();
      window.removeEventListener("pizarra:ads-updated", onCustomUpdate);
    };
  }, []);

  if (!ticker.enabled || !ticker.text.trim()) return null;

  return (
    <div
      className="w-full overflow-hidden border-t border-slate-800/80 py-1.5 px-3 flex items-center gap-3 flex-shrink-0 select-none"
      style={{
        backgroundColor: ticker.bgColor || "#1e3a8a",
        color: ticker.textColor || "#ffffff",
      }}
    >
      <div className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-black/30 text-[10px] font-mono font-bold uppercase tracking-wider flex-shrink-0">
        <Megaphone className="w-3 h-3" />
        <span>Aviso</span>
      </div>
      <div className="flex-1 overflow-hidden whitespace-nowrap">
        <div className="inline-block font-bold text-xs sm:text-sm tracking-wide animate-pulse">
          {ticker.text}
        </div>
      </div>
    </div>
  );
}
