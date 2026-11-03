import { useState, useEffect, useCallback, useRef } from "react";
import type { Ad, AdPlacement, AdMediaType } from "@/lib/types";
import { supabase } from "@/lib/supabase";
import {
  fetchAdsStore,
  persistAdsStore,
  deleteAdFromStore,
  uploadAdMediaFile,
  DEFAULT_AD_TICKER,
  type AdTickerConfig,
} from "@/lib/ads-service";
import {
  Megaphone,
  Plus,
  Upload,
  Link2,
  Eye,
  EyeOff,
  Trash2,
  ChevronUp,
  ChevronDown,
  Check,
  X,
  Loader2,
  Sparkles,
  Image as ImageIcon,
  Video,
} from "lucide-react";

const PLACEMENT_LABELS: Record<AdPlacement, string> = {
  top: "Banner Superior (Arriba de la pizarra)",
  bottom: "Banner Inferior (Debajo de la pizarra)",
  fullwidth: "Banner Destacado Grande (Ancho completo)",
  sidebar: "Lateral",
};

export default function AdsStudioManager() {
  const [ads, setAds] = useState<Ad[]>([]);
  const [ticker, setTicker] = useState<AdTickerConfig>(DEFAULT_AD_TICKER);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Ad | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Banner form fields
  const [title, setTitle] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [placement, setPlacement] = useState<AdPlacement>("top");
  const [imageUrl, setImageUrl] = useState("");
  const [mediaType, setMediaType] = useState<AdMediaType>("image");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");

  const fileRef = useRef<HTMLInputElement | null>(null);

  const notify = (msg: string) => {
    setFeedback(msg);
    setTimeout(() => {
      setFeedback((prev) => (prev === msg ? null : prev));
    }, 3000);
  };

  const loadAll = useCallback(async () => {
    setLoading(true);
    const store = await fetchAdsStore();
    setAds(store.ads || []);
    setTicker(store.ticker || DEFAULT_AD_TICKER);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  function resetForm() {
    setTitle("");
    setLinkUrl("");
    setPlacement("top");
    setImageUrl("");
    setMediaType("image");
    setStartsAt("");
    setEndsAt("");
    setEditing(null);
    setError(null);
  }

  function startEdit(ad: Ad) {
    setEditing(ad);
    setTitle(ad.title);
    setLinkUrl(ad.link_url ?? "");
    setPlacement(ad.placement);
    setImageUrl(ad.image_url);
    setMediaType(ad.media_type ?? "image");
    setStartsAt(ad.starts_at ? ad.starts_at.slice(0, 10) : "");
    setEndsAt(ad.ends_at ? ad.ends_at.slice(0, 10) : "");
    setShowForm(true);
  }

  async function handleUpload(file: File) {
    setUploading(true);
    setError(null);
    try {
      const uploaded = await uploadAdMediaFile(file);
      setImageUrl(uploaded.url);
      setMediaType(uploaded.mediaType);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al subir el archivo");
    } finally {
      setUploading(false);
    }
  }

  async function handleSaveBanner() {
    if (!imageUrl.trim()) {
      setError("Debes subir una imagen/video o pegar una URL válida para el anuncio.");
      return;
    }
    setSaving(true);
    setError(null);

    const nextAds = [...ads];
    if (editing) {
      const idx = nextAds.findIndex((a) => a.id === editing.id);
      if (idx >= 0) {
        nextAds[idx] = {
          ...editing,
          title: title.trim(),
          image_url: imageUrl.trim(),
          media_type: mediaType,
          link_url: linkUrl.trim() || null,
          placement,
          starts_at: startsAt ? new Date(startsAt + "T00:00:00").toISOString() : null,
          ends_at: endsAt ? new Date(endsAt + "T23:59:59").toISOString() : null,
        };
      }
    } else {
      const newAd: Ad = {
        id: `ad-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        title: title.trim(),
        image_url: imageUrl.trim(),
        media_type: mediaType,
        link_url: linkUrl.trim() || null,
        placement,
        is_active: true,
        display_order: nextAds.length + 1,
        starts_at: startsAt ? new Date(startsAt + "T00:00:00").toISOString() : null,
        ends_at: endsAt ? new Date(endsAt + "T23:59:59").toISOString() : null,
        created_at: new Date().toISOString(),
      };
      nextAds.push(newAd);
    }

    const updated = await persistAdsStore({ ads: nextAds });
    setAds(updated.ads);
    setSaving(false);
    resetForm();
    setShowForm(false);
    notify(editing ? "Anuncio actualizado en la pizarra" : "Anuncio publicado en la pizarra");
  }

  async function toggleActive(ad: Ad) {
    const nextAds = ads.map((item) =>
      item.id === ad.id ? { ...item, is_active: !item.is_active } : item,
    );
    const updated = await persistAdsStore({ ads: nextAds });
    setAds(updated.ads);
    notify(!ad.is_active ? "Anuncio activado" : "Anuncio pausado");
  }

  async function handleDelete(ad: Ad) {
    setSaving(true);
    setError(null);
    try {
      // 1. Borrado real y persistente en Supabase (y Storage si aplica) ANTES de dar por completada la acción
      const { error: supaError } = await supabase.from("ads").delete().eq("id", ad.id);
      if (supaError) {
        console.error("Error al eliminar anuncio en Supabase:", supaError);
        setError("Error al eliminar el anuncio en la base de datos: " + supaError.message);
        return;
      }

      // 2. Limpieza de archivo en Supabase Storage si corresponde
      if (ad.image_url) {
        try {
          let storagePath = "";
          if (ad.image_url.includes("/ads/")) {
            storagePath = ad.image_url.split("/ads/")[1]?.split("?")[0] || "";
          } else if (!ad.image_url.startsWith("http") && !ad.image_url.startsWith("data:")) {
            storagePath = ad.image_url;
          }
          if (storagePath) {
            await supabase.storage.from("ads").remove([storagePath]);
          }
        } catch (stErr) {
          console.warn("Advertencia al eliminar archivo de storage:", stErr);
        }
      }

      // 3. Limpieza inmediata de localStorage, caché y notificación en tiempo real
      const updated = await deleteAdFromStore(ad);
      setAds(updated.ads);
      notify("Anuncio eliminado permanentemente");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Error al eliminar el anuncio";
      console.error("Error al eliminar anuncio:", err);
      setError(msg);
    } finally {
      setSaving(false);
    }
  }

  async function handleReorder(ad: Ad, direction: "up" | "down") {
    const sorted = [...ads].sort((a, b) => a.display_order - b.display_order);
    const idx = sorted.findIndex((a) => a.id === ad.id);
    const swapIdx = direction === "up" ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= sorted.length) return;

    const currentOrder = sorted[idx]!.display_order;
    sorted[idx] = { ...sorted[idx]!, display_order: sorted[swapIdx]!.display_order };
    sorted[swapIdx] = { ...sorted[swapIdx]!, display_order: currentOrder };

    const updated = await persistAdsStore({ ads: sorted });
    setAds(updated.ads);
  }

  async function handleSaveTicker(nextTicker: AdTickerConfig) {
    setTicker(nextTicker);
    await persistAdsStore({ ticker: nextTicker });
    notify("Cintillo publicitario actualizado en vivo");
  }

  const activeBannersCount = ads.filter((a) => a.is_active).length;

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <Megaphone className="w-5 h-5 text-blue-400" />
            <span>Módulo de Publicidad y Cintillo en Vivo</span>
            <span className="text-xs font-mono font-bold px-2.5 py-0.5 rounded bg-blue-950/60 text-blue-300 border border-blue-800/60 tabular-nums">
              {activeBannersCount}{" "}
              {activeBannersCount === 1 ? "anuncio activo" : "anuncios activos"}
            </span>
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Muestra imágenes, videos promocionales o un cintillo informativo directamente en las
            pizarras de tus clientes en tiempo real.
          </p>
        </div>

        <button
          type="button"
          onClick={() => {
            resetForm();
            setShowForm(!showForm);
          }}
          className="px-4 py-2.5 bg-blue-600 hover:bg-blue-500 rounded-xl text-xs font-bold text-white flex items-center gap-2 transition shadow-lg cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>Nuevo Banner / Video</span>
        </button>
      </div>

      {feedback && (
        <div className="bg-emerald-950/60 border border-emerald-700/60 text-emerald-200 px-4 py-2.5 rounded-xl text-xs font-medium flex items-center justify-between">
          <span>{feedback}</span>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            className="text-emerald-400 hover:text-white text-xs font-bold ml-4"
          >
            Cerrar
          </button>
        </div>
      )}

      {/* 1. Cintillo / Marquesina Publicitaria */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-amber-400" />
            <h3 className="text-sm font-bold text-white">
              Cintillo Inferior de Texto (Aviso Promocional en Pizarra)
            </h3>
          </div>

          <button
            type="button"
            onClick={() => handleSaveTicker({ ...ticker, enabled: !ticker.enabled })}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold border transition cursor-pointer ${
              ticker.enabled
                ? "bg-emerald-600/20 border-emerald-500/50 text-emerald-300"
                : "bg-slate-800 border-slate-700 text-slate-400"
            }`}
          >
            {ticker.enabled ? "Cintillo: ACTIVO EN PIZARRA" : "Cintillo: DESACTIVADO"}
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div className="md:col-span-2">
            <label className="block text-xs text-slate-400 mb-1">Mensaje del Cintillo</label>
            <input
              type="text"
              value={ticker.text}
              onChange={(e) => setTicker({ ...ticker, text: e.target.value })}
              placeholder="Ej: ¡Bienvenidos a Agencia El Centro! Pagos al instante..."
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
            />
          </div>

          <div>
            <label className="block text-xs text-slate-400 mb-1">Color de Fondo</label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={ticker.bgColor}
                onChange={(e) => setTicker({ ...ticker, bgColor: e.target.value })}
                className="w-9 h-9 rounded bg-slate-950 border border-slate-800 cursor-pointer"
              />
              <input
                type="text"
                value={ticker.bgColor}
                onChange={(e) => setTicker({ ...ticker, bgColor: e.target.value })}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-2 text-xs font-mono text-slate-200"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs text-slate-400 mb-1">
              Rotación de Banners (Segundos)
            </label>
            <input
              type="number"
              min={3}
              max={60}
              value={ticker.carouselIntervalSeconds}
              onChange={(e) =>
                setTicker({
                  ...ticker,
                  carouselIntervalSeconds: Math.max(3, Number(e.target.value) || 8),
                })
              }
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm font-mono tabular-nums text-white"
            />
          </div>
        </div>

        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => handleSaveTicker(ticker)}
            className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-bold text-white transition flex items-center gap-1.5 cursor-pointer"
          >
            <Check className="w-3.5 h-3.5 text-emerald-400" />
            <span>Guardar Ajustes de Cintillo</span>
          </button>
        </div>
      </div>

      {/* 2. Formulario para Crear o Editar Banner / Video */}
      {showForm && (
        <div className="bg-slate-900 rounded-xl border border-slate-700 p-5 space-y-4 shadow-xl">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <h3 className="text-sm font-bold text-white">
              {editing ? "Editar Anuncio Publicitario" : "Publicar Nuevo Anuncio (Imagen o Video)"}
            </h3>
            <button
              type="button"
              onClick={() => {
                setShowForm(false);
                resetForm();
              }}
              className="text-xs text-slate-400 hover:text-white"
            >
              Cancelar
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-slate-400 mb-1.5">
                Título o Nombre del Anunciante (opcional)
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Ej: Promoción Especial / Patrocinante"
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
              />
            </div>

            <div>
              <label className="block text-xs text-slate-400 mb-1.5">Posición en la Pizarra</label>
              <select
                value={placement}
                onChange={(e) => setPlacement(e.target.value as AdPlacement)}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
              >
                {(Object.keys(PLACEMENT_LABELS) as AdPlacement[]).map((p) => (
                  <option key={p} value={p}>
                    {PLACEMENT_LABELS[p]}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs text-slate-400 mb-1.5">
                URL directa de Imagen o Video (o sube un archivo abajo)
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={imageUrl}
                  onChange={(e) => setImageUrl(e.target.value)}
                  placeholder="https://... o sube desde tu equipo"
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
                />
                <select
                  value={mediaType}
                  onChange={(e) => setMediaType(e.target.value as AdMediaType)}
                  className="bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-2 text-xs text-slate-300"
                >
                  <option value="image">Imagen</option>
                  <option value="video">Video</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs text-slate-400 mb-1.5">
                Enlace al hacer clic (opcional)
              </label>
              <div className="relative">
                <Link2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                <input
                  type="url"
                  value={linkUrl}
                  onChange={(e) => setLinkUrl(e.target.value)}
                  placeholder="https://wa.me/..."
                  className="w-full pl-9 pr-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-white focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs text-slate-400 mb-1.5">
                Mostrar desde (opcional)
              </label>
              <input
                type="date"
                value={startsAt}
                onChange={(e) => setStartsAt(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm font-mono tabular-nums text-white focus:outline-none focus:border-blue-500"
              />
            </div>

            <div>
              <label className="block text-xs text-slate-400 mb-1.5">
                Mostrar hasta (opcional)
              </label>
              <input
                type="date"
                value={endsAt}
                onChange={(e) => setEndsAt(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm font-mono tabular-nums text-white focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs text-slate-400 mb-1.5">
              Subir Archivo desde tu Dispositivo (Imagen PNG/JPG/GIF/WebP o Video MP4/WebM)
            </label>
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif,video/mp4,video/webm,video/ogg"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleUpload(file);
              }}
            />
            {imageUrl ? (
              <div className="relative rounded-xl overflow-hidden border border-slate-700 max-w-md bg-slate-950">
                {mediaType === "video" ? (
                  <video src={imageUrl} className="w-full h-36 object-cover" muted controls />
                ) : (
                  <img src={imageUrl} alt="Vista previa" className="w-full h-36 object-cover" />
                )}
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  className="absolute bottom-2 right-2 px-3 py-1.5 rounded-lg bg-slate-900/90 hover:bg-slate-800 text-xs font-semibold flex items-center gap-1.5 transition"
                >
                  <Upload className="w-3.5 h-3.5" /> Cambiar archivo
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
                className="w-full max-w-md h-28 rounded-xl border-2 border-dashed border-slate-700 hover:border-blue-500 flex items-center justify-center text-slate-400 hover:text-blue-400 transition cursor-pointer"
              >
                {uploading ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin mr-2" /> Subiendo archivo...
                  </>
                ) : (
                  <>
                    <Upload className="w-5 h-5 mr-2" /> Seleccionar imagen o video publicitario
                  </>
                )}
              </button>
            )}
          </div>

          {error && (
            <div className="text-xs text-red-300 bg-red-950/50 border border-red-800/60 rounded-lg px-4 py-2.5">
              {error}
            </div>
          )}

          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={handleSaveBanner}
              disabled={saving || uploading}
              className="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 rounded-xl text-xs font-bold text-white flex items-center gap-2 cursor-pointer"
            >
              {saving ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Check className="w-4 h-4" />
              )}
              <span>{editing ? "Guardar Cambios" : "Publicar en Pizarra"}</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setShowForm(false);
                resetForm();
              }}
              className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 rounded-xl text-xs font-semibold text-slate-300 flex items-center gap-1.5 cursor-pointer"
            >
              <X className="w-4 h-4" /> Cancelar
            </button>
          </div>
        </div>
      )}

      {/* 3. Lista de Banners Publicitarios */}
      {loading ? (
        <div className="flex items-center justify-center py-12 text-slate-400 text-sm">
          <Loader2 className="w-5 h-5 animate-spin mr-2" /> Cargando publicidad...
        </div>
      ) : ads.length === 0 ? (
        <div className="bg-slate-900 border border-slate-800 rounded-xl text-center text-slate-400 py-10 text-sm">
          No hay banners configurados todavía. Usa el botón &ldquo;Nuevo Banner / Video&rdquo; o
          activa el Cintillo Inferior arriba.
        </div>
      ) : (
        <div className="space-y-3">
          {[...ads]
            .sort((a, b) => a.display_order - b.display_order)
            .map((ad, idx, arr) => (
              <div
                key={ad.id}
                className="flex items-center gap-4 bg-slate-900 rounded-xl border border-slate-800 p-4 flex-wrap"
              >
                <div className="flex flex-col gap-1">
                  <button
                    type="button"
                    onClick={() => handleReorder(ad, "up")}
                    disabled={idx === 0}
                    className="p-1 rounded text-slate-400 hover:text-white disabled:opacity-30 transition"
                  >
                    <ChevronUp className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleReorder(ad, "down")}
                    disabled={idx === arr.length - 1}
                    className="p-1 rounded text-slate-400 hover:text-white disabled:opacity-30 transition"
                  >
                    <ChevronDown className="w-4 h-4" />
                  </button>
                </div>

                <div className="w-28 h-16 rounded-lg bg-slate-950 border border-slate-800 overflow-hidden flex-shrink-0">
                  {ad.media_type === "video" ? (
                    <video src={ad.image_url} className="w-full h-full object-cover" muted />
                  ) : (
                    <img src={ad.image_url} alt={ad.title} className="w-full h-full object-cover" />
                  )}
                </div>

                <div className="flex-1 min-w-[180px]">
                  <div className="font-bold text-sm text-white flex items-center gap-2">
                    {ad.media_type === "video" ? (
                      <Video className="w-3.5 h-3.5 text-purple-400" />
                    ) : (
                      <ImageIcon className="w-3.5 h-3.5 text-blue-400" />
                    )}
                    <span>{ad.title || "Anuncio Publicitario"}</span>
                  </div>
                  <div className="text-xs text-slate-400 mt-0.5">
                    {PLACEMENT_LABELS[ad.placement]}
                  </div>
                </div>

                <span
                  className={`text-xs font-bold px-2.5 py-1 rounded-md border ${
                    ad.is_active
                      ? "bg-emerald-950/50 text-emerald-400 border-emerald-800/60"
                      : "bg-slate-800 text-slate-400 border-slate-700"
                  }`}
                >
                  {ad.is_active ? "ACTIVO" : "PAUSADO"}
                </span>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => toggleActive(ad)}
                    className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 transition cursor-pointer"
                    title={ad.is_active ? "Pausar anuncio" : "Activar anuncio"}
                  >
                    {ad.is_active ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                  <button
                    type="button"
                    onClick={() => startEdit(ad)}
                    className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 transition cursor-pointer"
                  >
                    Editar
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(ad)}
                    className="p-2 rounded-lg text-red-400 hover:bg-red-950/40 transition cursor-pointer"
                    title="Eliminar anuncio"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
        </div>
      )}
    </div>
  );
}
