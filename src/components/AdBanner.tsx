import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { Ad, AdPlacement } from "@/lib/types";
import { X } from "lucide-react";

interface AdBannerProps {
  placement: AdPlacement;
  className?: string;
}

export default function AdBanner({ placement, className = "" }: AdBannerProps) {
  const [ads, setAds] = useState<Ad[]>([]);
  const [dismissed, setDismissed] = useState<Record<string, boolean>>({});

  useEffect(() => {
    let mounted = true;

    async function fetchAds() {
      const now = new Date().toISOString();
      const { data } = await supabase
        .from("ads")
        .select("*")
        .eq("is_active", true)
        .eq("placement", placement)
        .or(`starts_at.is.null,starts_at.lte.${now}`)
        .or(`ends_at.is.null,ends_at.gte.${now}`)
        .order("display_order", { ascending: true });
      if (mounted) setAds((data ?? []) as Ad[]);
    }

    fetchAds();

    const channel = supabase
      .channel(`ads-${placement}-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "ads" }, fetchAds)
      .subscribe();

    return () => {
      mounted = false;
      supabase.removeChannel(channel);
    };
  }, [placement]);

  const visibleAds = ads.filter((a) => !dismissed[a.id]);
  if (visibleAds.length === 0) return null;

  const ad = visibleAds[0]!;

  const aspectClass =
    placement === "sidebar"
      ? "aspect-[1/4]"
      : placement === "fullwidth"
        ? "aspect-[6/1]"
        : "aspect-[8/1]";

  const Wrapper = ad.link_url ? "a" : "div";
  const wrapperProps = ad.link_url
    ? { href: ad.link_url, target: "_blank", rel: "noopener noreferrer" }
    : {};

  return (
    <div className={`relative group ${className}`}>
      <Wrapper
        {...wrapperProps}
        className={`block w-full overflow-hidden rounded-xl border border-slate-800 bg-slate-900 ${aspectClass}`}
      >
        {ad.media_type === "video" ? (
          <video
            src={ad.image_url}
            className="w-full h-full object-cover"
            autoPlay
            muted
            loop
            playsInline
            controls
            aria-label={ad.title || "Publicidad"}
          />
        ) : (
          <img
            src={ad.image_url}
            alt={ad.title || "Publicidad"}
            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-[1.02]"
          />
        )}
      </Wrapper>
      <button
        onClick={() => setDismissed((prev) => ({ ...prev, [ad.id]: true }))}
        className="absolute top-1.5 right-1.5 p-1 rounded-md bg-slate-900/70 hover:bg-slate-800 text-slate-300 hover:text-white opacity-0 group-hover:opacity-100 transition"
        title="Cerrar"
      >
        <X className="w-3.5 h-3.5" />
      </button>
      <span className="absolute bottom-1 left-1.5 text-[10px] uppercase tracking-wider text-white/40 bg-slate-900/60 px-1.5 py-0.5 rounded">
        Publicidad
      </span>
    </div>
  );
}
