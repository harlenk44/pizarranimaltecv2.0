import { useEffect, useState } from "react";
import { Palette, Timer, Type, Save, Loader2, Check } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useBoardSettings } from "@/context/BoardSettingsContext";
import type { AppSettings } from "@/lib/types";

export default function DesignManager() {
  const { settings, refreshSettings, updateSettings } = useBoardSettings();
  const [draft, setDraft] = useState<AppSettings>(settings);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => setDraft(settings), [settings]);

  function setValue<K extends keyof AppSettings>(key: K, value: AppSettings[K]) {
    const updated = { ...draft, [key]: value };
    setDraft(updated);
    // Instant live preview across all boards
    updateSettings(updated);
  }

  async function save() {
    setSaving(true);
    setMessage("");

    const fullPayload = {
      ...draft,
      id: "global",
      updated_at: new Date().toISOString(),
    };

    // Update context state immediately
    updateSettings(fullPayload);

    const { error } = await supabase.from("app_settings").upsert(fullPayload, { onConflict: "id" });

    if (error) {
      setMessage(`Guardado localmente. (Aviso servidor: ${error.message})`);
    } else {
      setMessage("¡Diseño guardado exitosamente para todas las pantallas!");
    }
    await refreshSettings();
    setSaving(false);
  }

  const colors: {
    key:
      | "background_color"
      | "surface_color"
      | "primary_color"
      | "text_color"
      | "card_color"
      | "result_row_color";
    label: string;
  }[] = [
    { key: "background_color", label: "Fondo principal de pantalla" },
    { key: "surface_color", label: "Encabezado y barra superior" },
    { key: "primary_color", label: "Color de acento principal" },
    { key: "text_color", label: "Texto e información" },
    { key: "card_color", label: "Fondo de tarjetas de ruletas" },
    { key: "result_row_color", label: "Fondo de cuadro de último resultado" },
  ];

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2 text-white">
            <Palette className="w-5 h-5 text-blue-500" /> Diseño, Colores y Apariencia
          </h2>
          <p className="text-sm text-slate-400 mt-1">
            Personaliza la paleta de colores de las pizarras, tarjetas de resultados y fuentes.
          </p>
        </div>
        <button
          onClick={save}
          disabled={saving}
          className="bg-blue-600 hover:bg-blue-500 text-white font-medium px-5 py-2.5 rounded-xl shadow-lg shadow-blue-600/20 flex items-center gap-2 cursor-pointer transition"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Guardar Cambios de Diseño
        </button>
      </div>

      {message && (
        <div className="p-3.5 rounded-xl bg-blue-950/60 border border-blue-800 text-blue-300 text-xs font-medium flex items-center gap-2">
          <Check className="w-4 h-4 text-emerald-400" />
          {message}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Colors Palette Section */}
        <section className="bg-slate-900/90 rounded-2xl border border-slate-800 p-6 space-y-5 shadow-xl">
          <h3 className="font-bold text-sm text-white flex items-center gap-2 border-b border-slate-800 pb-3">
            <Palette className="w-4 h-4 text-blue-400" /> Paleta de Colores
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {colors.map(({ key, label }) => (
              <label key={key} className="block space-y-1.5">
                <span className="block text-xs font-medium text-slate-300">{label}</span>
                <div className="flex gap-2">
                  <input
                    type="color"
                    value={draft[key] || "#000000"}
                    onChange={(e) => setValue(key, e.target.value)}
                    className="w-12 h-10 rounded-lg bg-slate-950 border border-slate-700 cursor-pointer p-0.5"
                  />
                  <input
                    value={draft[key] || ""}
                    onChange={(e) => setValue(key, e.target.value)}
                    className="min-w-0 flex-1 bg-slate-950 border border-slate-700 rounded-lg px-3 text-xs font-mono uppercase text-white focus:outline-none focus:border-blue-500"
                  />
                </div>
              </label>
            ))}
          </div>
        </section>

        {/* Typography & Rotation Section */}
        <section className="bg-slate-900/90 rounded-2xl border border-slate-800 p-6 space-y-5 shadow-xl">
          <h3 className="font-bold text-sm text-white flex items-center gap-2 border-b border-slate-800 pb-3">
            <Type className="w-4 h-4 text-emerald-400" /> Fuentes y Escalas de Tamaño
          </h3>

          <div className="space-y-4">
            <label className="block text-xs font-medium text-slate-300">
              Tipo de letra principal (Font Family)
              <select
                value={draft.font_family || "Inter"}
                onChange={(e) => setValue("font_family", e.target.value)}
                className="mt-2 w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-blue-500"
              >
                <option value="Inter">Inter (Sans-serif moderno)</option>
                <option value="Arial">Arial (Clásico estándar)</option>
                <option value="Verdana">Verdana (Limpio y ancho)</option>
                <option value="Georgia">Georgia (Serif elegancia)</option>
                <option value="monospace">Monospace (Estilo Pantalla Digital)</option>
              </select>
            </label>

            {/* Sliders for Scales */}
            <div className="space-y-3 pt-2 border-t border-slate-800">
              <label className="block text-xs text-slate-300 space-y-1">
                <div className="flex justify-between font-medium">
                  <span>🐾 Tamaño de Imagen del Animal</span>
                  <strong className="text-purple-400">{draft.animal_scale ?? 100}%</strong>
                </div>
                <input
                  type="range"
                  min="40"
                  max="200"
                  step="5"
                  value={draft.animal_scale ?? 100}
                  onChange={(e) => setValue("animal_scale", Number(e.target.value))}
                  className="w-full accent-purple-500 cursor-pointer h-2 bg-slate-950 rounded-lg border border-slate-800"
                />
              </label>

              <label className="block text-xs text-slate-300 space-y-1">
                <div className="flex justify-between font-medium">
                  <span>📦 Cuadro del Último Resultado</span>
                  <strong className="text-amber-400">{draft.hero_card_scale ?? 100}%</strong>
                </div>
                <input
                  type="range"
                  min="50"
                  max="200"
                  step="5"
                  value={draft.hero_card_scale ?? 100}
                  onChange={(e) => setValue("hero_card_scale", Number(e.target.value))}
                  className="w-full accent-amber-500 cursor-pointer h-2 bg-slate-950 rounded-lg border border-slate-800"
                />
              </label>

              <label className="block text-xs text-slate-300 space-y-1">
                <div className="flex justify-between font-medium">
                  <span>🖼️ Tamaño de Logos</span>
                  <strong className="text-blue-400">{draft.logo_size ?? 72}px</strong>
                </div>
                <input
                  type="range"
                  min="16"
                  max="120"
                  step="2"
                  value={draft.logo_size ?? 72}
                  onChange={(e) => setValue("logo_size", Number(e.target.value))}
                  className="w-full accent-blue-500 cursor-pointer h-2 bg-slate-950 rounded-lg border border-slate-800"
                />
              </label>

              <label className="block text-xs text-slate-300 space-y-1">
                <div className="flex justify-between font-medium">
                  <span>🔤 Escala de Letras / Tipografía</span>
                  <strong className="text-emerald-400">{draft.font_size_scale ?? 100}%</strong>
                </div>
                <input
                  type="range"
                  min="70"
                  max="200"
                  step="5"
                  value={draft.font_size_scale ?? 100}
                  onChange={(e) => setValue("font_size_scale", Number(e.target.value))}
                  className="w-full accent-emerald-500 cursor-pointer h-2 bg-slate-950 rounded-lg border border-slate-800"
                />
              </label>
            </div>

            <div className="pt-3 border-t border-slate-800 space-y-3">
              <h4 className="font-bold text-sm text-white flex items-center gap-2">
                <Timer className="w-4 h-4 text-amber-400" /> Rotación de Vistas
              </h4>
              <label className="flex items-center justify-between text-xs text-slate-300">
                <span>Cambio automático entre Pizarra Diaria y Semanal</span>
                <input
                  type="checkbox"
                  checked={draft.rotation_enabled ?? false}
                  onChange={(e) => setValue("rotation_enabled", e.target.checked)}
                  className="w-4 h-4 accent-blue-600 rounded cursor-pointer"
                />
              </label>

              {draft.rotation_enabled && (
                <label className="block text-xs text-slate-300 space-y-1.5">
                  Intervalo de rotación:{" "}
                  <strong className="text-blue-400">{draft.rotation_interval_seconds} seg</strong>
                  <input
                    type="range"
                    min="5"
                    max="60"
                    step="5"
                    value={draft.rotation_interval_seconds ?? 15}
                    onChange={(e) => setValue("rotation_interval_seconds", Number(e.target.value))}
                    className="w-full accent-blue-500 cursor-pointer"
                  />
                </label>
              )}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
