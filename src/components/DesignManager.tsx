import { useEffect, useState } from "react";
import { Palette, Timer, Type, Save, Loader2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useBoardSettings } from "@/context/BoardSettingsContext";
import type { AppSettings } from "@/lib/types";

export default function DesignManager() {
  const { settings, refreshSettings } = useBoardSettings();
  const [draft, setDraft] = useState<AppSettings>(settings);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  useEffect(() => setDraft(settings), [settings]);
  function setValue<K extends keyof AppSettings>(key: K, value: AppSettings[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }
  async function save() {
    setSaving(true);
    setMessage("");
    const { error } = await supabase
      .from("app_settings")
      .update({ ...draft, id: undefined, updated_at: new Date().toISOString() })
      .eq("id", "global");
    if (error) setMessage(`No se pudo guardar: ${error.message}`);
    else {
      await refreshSettings();
      setMessage("Configuración guardada para todos los usuarios.");
    }
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
    { key: "background_color", label: "Fondo principal" },
    { key: "surface_color", label: "Paneles" },
    { key: "primary_color", label: "Color principal" },
    { key: "text_color", label: "Texto" },
    { key: "card_color", label: "Fondo de tarjetas de resultados" },
    { key: "result_row_color", label: "Fondo de filas de resultados" },
  ];
  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div>
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <Palette className="w-5 h-5 text-blue-500" /> Apariencia y rotación
        </h2>
        <p className="text-sm text-slate-400 mt-1">
          Personaliza colores, letras y el cambio automático entre la vista diaria y semanal.
        </p>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <section className="bg-slate-900 rounded-2xl border border-slate-800 p-5 space-y-4">
          <h3 className="font-semibold">Colores</h3>
          <div className="grid grid-cols-2 gap-4">
            {colors.map(({ key, label }) => (
              <label key={key} className="space-y-2">
                <span className="block text-xs text-slate-400">{label}</span>
                <div className="flex gap-2">
                  <input
                    type="color"
                    value={draft[key]}
                    onChange={(e) => setValue(key, e.target.value)}
                    className="w-11 h-10 rounded-lg bg-slate-800"
                  />
                  <input
                    value={draft[key]}
                    onChange={(e) => setValue(key, e.target.value)}
                    className="min-w-0 flex-1 bg-slate-800 border border-slate-700 rounded-lg px-2 text-xs uppercase"
                  />
                </div>
              </label>
            ))}
          </div>
          <label className="block text-xs text-slate-400">
            <Type className="w-3.5 h-3.5 inline mr-1" /> Tipo de letra
            <select
              value={draft.font_family}
              onChange={(e) => setValue("font_family", e.target.value)}
              className="mt-2 w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 text-sm"
            >
              <option>Inter</option>
              <option>Arial</option>
              <option>Georgia</option>
              <option>Verdana</option>
              <option>monospace</option>
            </select>
          </label>
          <label className="block text-xs text-slate-400">
            Tamaño base: {draft.base_font_size}px
            <input
              type="range"
              min="12"
              max="22"
              value={draft.base_font_size}
              onChange={(e) => setValue("base_font_size", Number(e.target.value))}
              className="mt-2 w-full accent-blue-500"
            />
          </label>
        </section>
        <section className="bg-slate-900 rounded-2xl border border-slate-800 p-5 space-y-4">
          <h3 className="font-semibold flex items-center gap-2">
            <Timer className="w-4 h-4 text-blue-400" /> Cambio automático
          </h3>
          <label className="flex items-center justify-between p-3 rounded-lg bg-slate-800/70">
            <span>
              <span className="block text-sm">Activar rotación</span>
              <span className="block text-xs text-slate-500 mt-1">
                Alterna diaria y semanal mientras la pantalla está abierta.
              </span>
            </span>
            <input
              type="checkbox"
              checked={draft.rotation_enabled}
              onChange={(e) => setValue("rotation_enabled", e.target.checked)}
              className="w-5 h-5 accent-blue-500"
            />
          </label>
          <label className="block text-xs text-slate-400">
            Cambiar cada {draft.rotation_interval_seconds} segundos
            <input
              type="range"
              min="15"
              max="300"
              step="15"
              value={draft.rotation_interval_seconds}
              onChange={(e) => setValue("rotation_interval_seconds", Number(e.target.value))}
              disabled={!draft.rotation_enabled}
              className="mt-2 w-full accent-blue-500"
            />
          </label>
          <label className="block text-xs text-slate-400">
            Vista inicial
            <select
              value={draft.start_view}
              onChange={(e) => setValue("start_view", e.target.value as AppSettings["start_view"])}
              className="mt-2 w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 text-sm"
            >
              <option value="daily">Pizarra diaria</option>
              <option value="weekly">Pizarra semanal</option>
            </select>
          </label>
        </section>
      </div>
      <div className="flex items-center gap-3">
        <button
          onClick={save}
          disabled={saving}
          className="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 rounded-lg text-sm font-medium flex items-center gap-2"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}{" "}
          Guardar configuración
        </button>
        {message && (
          <span
            className={`text-sm ${message.startsWith("No") ? "text-red-400" : "text-green-400"}`}
          >
            {message}
          </span>
        )}
      </div>
    </div>
  );
}
