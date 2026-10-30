import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import {
  Maximize,
  Minimize,
  SlidersHorizontal,
  X,
  Type,
  Image as ImageIcon,
  Box,
  PawPrint,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { DisplayProvider, useDisplay } from "@/context/DisplayContext";
import { useBoardSettings } from "@/context/BoardSettingsContext";

function DisplayShell({ children }: { children: ReactNode }) {
  const { preferences, update, storageError } = useDisplay();
  const { settings, updateSettings } = useBoardSettings();
  const shell = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [controls, setControls] = useState(false);
  const [notice, setNotice] = useState("");

  const logoSize = preferences.logoSize ?? settings.logo_size ?? 72;
  const fontSizeScale = preferences.fontSizeScale ?? settings.font_size_scale ?? 100;
  const heroCardScale = preferences.heroCardScale ?? settings.hero_card_scale ?? 100;
  const animalScale = preferences.animalScale ?? settings.animal_scale ?? 100;

  function updatePreferenceAndSetting(
    updates: Partial<typeof preferences> & Partial<typeof settings>,
  ) {
    update(updates);
    const settingsPayload: Partial<typeof settings> = {};
    if (typeof updates.logoSize === "number") settingsPayload.logo_size = updates.logoSize;
    if (typeof updates.fontSizeScale === "number")
      settingsPayload.font_size_scale = updates.fontSizeScale;
    if (typeof updates.heroCardScale === "number")
      settingsPayload.hero_card_scale = updates.heroCardScale;
    if (typeof updates.animalScale === "number") settingsPayload.animal_scale = updates.animalScale;

    if (Object.keys(settingsPayload).length > 0) {
      updateSettings(settingsPayload);
    }
  }

  useEffect(() => {
    const sync = () => setExpanded(document.fullscreenElement === shell.current);
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !document.fullscreenElement) setExpanded(false);
    };
    document.addEventListener("fullscreenchange", sync);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("fullscreenchange", sync);
      document.removeEventListener("keydown", escape);
    };
  }, []);

  async function toggleFullscreen() {
    setNotice("");
    setControls(false);
    if (expanded) {
      if (document.fullscreenElement) await document.exitFullscreen();
      setExpanded(false);
      return;
    }
    setExpanded(true);
    try {
      if (!shell.current?.requestFullscreen) throw new Error("unsupported");
      await shell.current.requestFullscreen();
    } catch {
      setNotice("Vista ampliada activa. El navegador no permitió ocultar sus barras.");
    }
  }

  const variables = {
    "--display-scale": preferences.resultScale / 100,
    "--display-logo": `${logoSize}px`,
    "--display-font-scale": fontSizeScale / 100,
    "--display-hero-scale": heroCardScale / 100,
    "--display-animal-scale": animalScale / 100,
    "--display-card-min": `${Math.round((300 * preferences.resultScale) / 100)}px`,
    "--display-surface": settings.surface_color,
    "--display-text": settings.text_color,
    "--display-row": settings.result_row_color,
    "--display-card": settings.card_color,
    backgroundColor: settings.background_color,
  } as CSSProperties;

  return (
    <div
      ref={shell}
      style={variables}
      className={`board-display ${expanded ? "board-presentation" : ""}`}
    >
      {children}
      <div className="display-tools dark">
        {controls && (
          <section
            id="display-controls"
            className="display-controls bg-slate-900/95 text-slate-100 border border-slate-700/80 rounded-2xl shadow-2xl p-5 space-y-4 backdrop-blur-md"
            aria-label="Tamaños de la pizarra"
          >
            <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
              <h2 className="font-bold text-sm text-white flex items-center gap-2">
                <SlidersHorizontal className="w-4 h-4 text-blue-400" /> Ajustes de Tamaño
              </h2>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Cerrar ajustes"
                onClick={() => setControls(false)}
                className="h-7 w-7 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </Button>
            </div>

            {/* 1. Tamaño de Logos */}
            <div className="space-y-1.5">
              <label
                className="flex items-center justify-between text-xs font-semibold text-slate-200"
                htmlFor="logo-size"
              >
                <span className="flex items-center gap-1.5">
                  <ImageIcon className="w-3.5 h-3.5 text-blue-400" /> Tamaño de Logos
                </span>
                <output className="font-mono text-blue-400 font-bold">{logoSize}px</output>
              </label>
              <input
                id="logo-size"
                type="range"
                min="16"
                max="120"
                step="2"
                value={logoSize}
                onChange={(e) => updatePreferenceAndSetting({ logoSize: Number(e.target.value) })}
                className="block w-full accent-blue-500 cursor-pointer h-2 bg-slate-950 rounded-lg border border-slate-800"
              />
            </div>

            {/* 2. Tamaño de las Letras (Texto) */}
            <div className="space-y-1.5">
              <label
                className="flex items-center justify-between text-xs font-semibold text-slate-200"
                htmlFor="font-size"
              >
                <span className="flex items-center gap-1.5">
                  <Type className="w-3.5 h-3.5 text-emerald-400" /> Tamaño de Letras
                </span>
                <output className="font-mono text-emerald-400 font-bold">{fontSizeScale}%</output>
              </label>
              <input
                id="font-size"
                type="range"
                min="70"
                max="200"
                step="5"
                value={fontSizeScale}
                onChange={(e) =>
                  updatePreferenceAndSetting({ fontSizeScale: Number(e.target.value) })
                }
                className="block w-full accent-emerald-500 cursor-pointer h-2 bg-slate-950 rounded-lg border border-slate-800"
              />
            </div>

            {/* 3. Cuadro del Último Resultado */}
            <div className="space-y-1.5">
              <label
                className="flex items-center justify-between text-xs font-semibold text-slate-200"
                htmlFor="hero-size"
              >
                <span className="flex items-center gap-1.5">
                  <Box className="w-3.5 h-3.5 text-amber-400" /> Cuadro del Último Resultado
                </span>
                <output className="font-mono text-amber-400 font-bold">{heroCardScale}%</output>
              </label>
              <input
                id="hero-size"
                type="range"
                min="50"
                max="200"
                step="5"
                value={heroCardScale}
                onChange={(e) =>
                  updatePreferenceAndSetting({ heroCardScale: Number(e.target.value) })
                }
                className="block w-full accent-amber-500 cursor-pointer h-2 bg-slate-950 rounded-lg border border-slate-800"
              />
            </div>

            {/* 4. Tamaño de la Imagen del Animal */}
            <div className="space-y-1.5">
              <label
                className="flex items-center justify-between text-xs font-semibold text-slate-200"
                htmlFor="animal-size"
              >
                <span className="flex items-center gap-1.5">
                  <PawPrint className="w-3.5 h-3.5 text-purple-400" /> Tamaño de Imagen del Animal
                </span>
                <output className="font-mono text-purple-400 font-bold">{animalScale}%</output>
              </label>
              <input
                id="animal-size"
                type="range"
                min="40"
                max="200"
                step="5"
                value={animalScale}
                onChange={(e) =>
                  updatePreferenceAndSetting({ animalScale: Number(e.target.value) })
                }
                className="block w-full accent-purple-500 cursor-pointer h-2 bg-slate-950 rounded-lg border border-slate-800"
              />
            </div>

            {/* 4. Escala General de Tarjetas */}
            <div className="space-y-1.5 pt-2 border-t border-slate-800">
              <label
                className="flex items-center justify-between text-xs font-medium text-slate-400"
                htmlFor="result-scale"
              >
                <span>Escala General de Tarjetas</span>
                <output className="font-mono text-slate-400">{preferences.resultScale}%</output>
              </label>
              <input
                id="result-scale"
                type="range"
                min="75"
                max="250"
                step="5"
                value={preferences.resultScale}
                onChange={(e) => update({ resultScale: Number(e.target.value) })}
                className="block w-full accent-slate-500 cursor-pointer h-1.5 bg-slate-950 rounded-lg border border-slate-800"
              />
            </div>

            {storageError && (
              <p role="status" className="mt-2 text-xs text-amber-400">
                Este navegador no permite guardar los tamaños.
              </p>
            )}
          </section>
        )}
        {notice && (
          <p
            role="status"
            className="bg-slate-900 text-slate-200 p-3 rounded-xl border border-slate-800 max-w-xs text-xs shadow-xl"
          >
            {notice}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Button
            variant="secondary"
            size="icon"
            title="Ajustar tamaños de logos, letras y cajas"
            aria-label="Ajustar tamaños de logos, letras y cajas"
            aria-expanded={controls}
            aria-controls="display-controls"
            onClick={() => setControls(!controls)}
            className="bg-slate-900 border border-slate-700/80 hover:bg-slate-800 text-slate-200 shadow-xl"
          >
            <SlidersHorizontal className="w-4 h-4 text-blue-400" />
          </Button>
          <Button
            variant="secondary"
            onClick={toggleFullscreen}
            title={expanded ? "Salir de pantalla completa" : "Pantalla Completa"}
            className="bg-slate-900 border border-slate-700/80 hover:bg-slate-800 text-slate-200 shadow-xl font-semibold text-xs flex items-center gap-1.5"
          >
            {expanded ? <Minimize className="w-4 h-4" /> : <Maximize className="w-4 h-4" />}
            <span>{expanded ? "Salir" : "Pantalla Completa"}</span>
          </Button>
        </div>
      </div>
    </div>
  );
}

export default function BoardDisplay({ children }: { children: ReactNode }) {
  return (
    <DisplayProvider>
      <DisplayShell>{children}</DisplayShell>
    </DisplayProvider>
  );
}
