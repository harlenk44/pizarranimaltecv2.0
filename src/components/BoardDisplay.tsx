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
  RotateCw,
  Bell,
  Timer,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { DisplayProvider, useDisplay } from "@/context/DisplayContext";
import { useBoardSettings } from "@/context/BoardSettingsContext";
import { useLicenseContext } from "@/components/LicenseGate";

function DisplayShell({ children }: { children: ReactNode }) {
  const { preferences, update, storageError } = useDisplay();
  const { settings, updateSettings } = useBoardSettings();
  const { designConfig } = useLicenseContext();
  const shell = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [controls, setControls] = useState(false);
  const [notice, setNotice] = useState("");
  const [isToolsVisible, setIsToolsVisible] = useState(true);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const customDesign = designConfig?.useCustomDesign ? designConfig : null;
  const logoSize = preferences.logoSize ?? customDesign?.logo_size ?? settings.logo_size ?? 72;
  const fontSizeScale = preferences.fontSizeScale ?? settings.font_size_scale ?? 100;
  const heroCardScale =
    preferences.heroCardScale ?? customDesign?.hero_card_scale ?? settings.hero_card_scale ?? 100;
  const animalScale =
    preferences.animalScale ?? customDesign?.animal_scale ?? settings.animal_scale ?? 100;

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

  const wakeLockRef = useRef<WakeLockSentinel | null>(null);

  async function requestScreenWakeLock() {
    if (typeof navigator === "undefined" || !("wakeLock" in navigator)) return;
    if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
    if (wakeLockRef.current && !wakeLockRef.current.released) return;
    try {
      const sentinel = await navigator.wakeLock.request("screen");
      wakeLockRef.current = sentinel;
      sentinel.addEventListener("release", () => {
        if (wakeLockRef.current === sentinel) {
          wakeLockRef.current = null;
        }
      });
    } catch {
      // Browser may block until first user gesture or if battery saver is active
    }
  }

  useEffect(() => {
    void requestScreenWakeLock();

    const handleVisibilityOrFullscreen = () => {
      if (document.visibilityState === "visible") {
        void requestScreenWakeLock();
      }
    };

    const handleUserGesture = () => {
      if (!wakeLockRef.current || wakeLockRef.current.released) {
        void requestScreenWakeLock();
      }
    };

    const keepAliveInterval = setInterval(() => {
      if (
        document.visibilityState === "visible" &&
        (!wakeLockRef.current || wakeLockRef.current.released)
      ) {
        void requestScreenWakeLock();
      }
    }, 30000);

    document.addEventListener("visibilitychange", handleVisibilityOrFullscreen);
    document.addEventListener("fullscreenchange", handleVisibilityOrFullscreen);
    window.addEventListener("focus", handleVisibilityOrFullscreen);
    window.addEventListener("click", handleUserGesture, { passive: true });
    window.addEventListener("touchstart", handleUserGesture, { passive: true });
    window.addEventListener("keydown", handleUserGesture, { passive: true });

    return () => {
      clearInterval(keepAliveInterval);
      document.removeEventListener("visibilitychange", handleVisibilityOrFullscreen);
      document.removeEventListener("fullscreenchange", handleVisibilityOrFullscreen);
      window.removeEventListener("focus", handleVisibilityOrFullscreen);
      window.removeEventListener("click", handleUserGesture);
      window.removeEventListener("touchstart", handleUserGesture);
      window.removeEventListener("keydown", handleUserGesture);
      if (wakeLockRef.current && !wakeLockRef.current.released) {
        wakeLockRef.current.release().catch(() => {});
        wakeLockRef.current = null;
      }
    };
  }, []);

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

  useEffect(() => {
    if (controls) {
      if (hideTimerRef.current) {
        clearTimeout(hideTimerRef.current);
        hideTimerRef.current = null;
      }
      setIsToolsVisible(true);
      return;
    }

    const startHideTimer = () => {
      setIsToolsVisible(true);
      if (hideTimerRef.current) {
        clearTimeout(hideTimerRef.current);
      }
      hideTimerRef.current = setTimeout(() => {
        setIsToolsVisible(false);
      }, 3000);
    };

    startHideTimer();

    const activityEvents = ["mousemove", "mousedown", "touchstart", "keydown"] as const;
    const handleActivity = () => {
      startHideTimer();
    };

    for (const evt of activityEvents) {
      window.addEventListener(evt, handleActivity, { passive: true });
    }

    return () => {
      if (hideTimerRef.current) {
        clearTimeout(hideTimerRef.current);
        hideTimerRef.current = null;
      }
      for (const evt of activityEvents) {
        window.removeEventListener(evt, handleActivity);
      }
    };
  }, [controls]);

  async function toggleFullscreen() {
    setNotice("");
    setControls(false);
    void requestScreenWakeLock();
    if (expanded) {
      if (document.fullscreenElement) await document.exitFullscreen();
      setExpanded(false);
      return;
    }
    setExpanded(true);
    try {
      if (!shell.current?.requestFullscreen) throw new Error("unsupported");
      await shell.current.requestFullscreen();
      void requestScreenWakeLock();
    } catch {
      setNotice("Vista ampliada activa. El navegador no permitió ocultar sus barras.");
    }
  }

  const isCustom = Boolean(
    designConfig &&
    (designConfig.useCustomDesign ||
      designConfig.background_color ||
      designConfig.surface_color ||
      designConfig.card_color ||
      designConfig.result_row_color ||
      designConfig.primary_color ||
      designConfig.text_color),
  );
  const effectiveDesign = isCustom ? designConfig : null;
  const currentCardColor = effectiveDesign?.card_color || settings.card_color || "#0f172a";
  const currentBgColor =
    effectiveDesign?.background_color || settings.background_color || "#020617";
  const currentSurfaceColor = effectiveDesign?.surface_color || settings.surface_color || "#0f172a";
  const currentTextColor = effectiveDesign?.text_color || settings.text_color || "#f8fafc";
  const currentRowColor =
    effectiveDesign?.result_row_color || settings.result_row_color || "#1e293b";

  const variables = {
    "--display-scale": preferences.resultScale / 100,
    "--display-logo": `${logoSize}px`,
    "--display-font-scale": fontSizeScale / 100,
    "--display-hero-scale": heroCardScale / 100,
    "--display-animal-scale": animalScale / 100,
    "--display-card-min": `${Math.round((300 * preferences.resultScale) / 100)}px`,
    "--display-surface": currentSurfaceColor,
    "--display-text": currentTextColor,
    "--display-row": currentRowColor,
    "--display-card": currentCardColor,
    backgroundColor: currentBgColor,
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
            className="display-controls bg-slate-900/95 text-slate-100 border border-slate-700/80 rounded-2xl shadow-2xl p-3.5 space-y-2 backdrop-blur-md"
            aria-label="Tamaños de la pizarra"
          >
            <div className="sticky -top-3.5 -mx-3.5 px-3.5 py-2 -mt-3.5 mb-1 bg-slate-900 border-b border-slate-800/90 flex items-center justify-between z-10 rounded-t-2xl">
              <h2 className="font-bold text-xs sm:text-sm text-white flex items-center gap-1.5">
                <SlidersHorizontal className="w-3.5 h-3.5 text-blue-400" /> Ajustes de Tamaño
              </h2>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Cerrar ajustes"
                onClick={() => setControls(false)}
                className="h-6 w-6 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white"
              >
                <X className="w-3.5 h-3.5" />
              </Button>
            </div>

            {/* 1. Tamaño de Logos */}
            <div className="space-y-1">
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
                className="block w-full accent-blue-500 cursor-pointer h-1.5 bg-slate-950 rounded-lg border border-slate-800"
              />
            </div>

            {/* 2. Tamaño de las Letras (Texto) */}
            <div className="space-y-1">
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
                className="block w-full accent-emerald-500 cursor-pointer h-1.5 bg-slate-950 rounded-lg border border-slate-800"
              />
            </div>

            {/* 3. Cuadro del Último Resultado */}
            <div className="space-y-1">
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
                className="block w-full accent-amber-500 cursor-pointer h-1.5 bg-slate-950 rounded-lg border border-slate-800"
              />
            </div>

            {/* 4. Tamaño de la Imagen del Animal */}
            <div className="space-y-1">
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
                className="block w-full accent-purple-500 cursor-pointer h-1.5 bg-slate-950 rounded-lg border border-slate-800"
              />
            </div>

            {/* 5. Duración de la ventana de resultado */}
            <div className="space-y-1 pt-1.5 border-t border-slate-800">
              <label
                className="flex items-center justify-between text-xs font-semibold text-slate-200"
                htmlFor="alert-duration"
              >
                <span className="flex items-center gap-1.5">
                  <Timer className="w-3.5 h-3.5 text-yellow-400" /> Tiempo de Anuncio en Pantalla
                </span>
                <output className="font-mono text-yellow-400 font-bold tabular-nums">
                  {preferences.alertDurationSeconds ?? 20}s
                </output>
              </label>
              <input
                id="alert-duration"
                type="range"
                min="4"
                max="30"
                step="1"
                value={preferences.alertDurationSeconds ?? 20}
                onChange={(e) => update({ alertDurationSeconds: Number(e.target.value) })}
                className="block w-full accent-yellow-500 cursor-pointer h-1.5 bg-slate-950 rounded-lg border border-slate-800"
              />
              <div className="flex items-center gap-1 pt-0.5">
                {[8, 12, 16, 20, 30].map((sec) => (
                  <button
                    key={sec}
                    type="button"
                    onClick={() => update({ alertDurationSeconds: sec })}
                    className={`flex-1 py-0.5 rounded text-[10px] font-mono font-semibold tabular-nums transition border ${
                      (preferences.alertDurationSeconds ?? 20) === sec
                        ? "bg-yellow-500/20 text-yellow-300 border-yellow-500/50 shadow-sm"
                        : "bg-slate-950 text-slate-400 border-slate-800 hover:bg-slate-800 hover:text-slate-200"
                    }`}
                  >
                    {sec}s
                  </button>
                ))}
              </div>
              <p className="text-[9.5px] leading-tight text-slate-400">
                Tiempo que se muestra el cuadro con el animal ganador antes de volver
                automáticamente a la pizarra total (por defecto 20 segundos).
              </p>
            </div>

            {/* 6. Activar/Desactivar ventana emergente */}
            <div className="pt-1.5 border-t border-slate-800 space-y-0.5">
              <label
                className="flex items-center justify-between text-xs font-semibold text-slate-200 cursor-pointer select-none"
                htmlFor="show-alert-modal"
              >
                <span className="flex items-center gap-1.5">
                  <Bell className="w-3.5 h-3.5 text-emerald-400" /> Ventana emergente al salir
                  resultado
                </span>
                <input
                  id="show-alert-modal"
                  type="checkbox"
                  checked={preferences.showAlertModal ?? true}
                  onChange={(e) => update({ showAlertModal: e.target.checked })}
                  className="w-3.5 h-3.5 accent-emerald-500 rounded cursor-pointer"
                />
              </label>
              <p className="text-[9.5px] leading-tight text-slate-400">
                Si la desactivas, la pizarra se actualizará en vivo directamente sin mostrar la
                ventana grande por encima.
              </p>
            </div>

            {/* 7. Opción de recarga completa al llegar resultado */}
            <div className="pt-1.5 border-t border-slate-800 space-y-0.5">
              <label
                className="flex items-center justify-between text-xs font-semibold text-slate-200 cursor-pointer select-none"
                htmlFor="reload-on-new-result"
              >
                <span className="flex items-center gap-1.5">
                  <RotateCw className="w-3.5 h-3.5 text-cyan-400" /> Recargar página al salir
                  resultado
                </span>
                <input
                  id="reload-on-new-result"
                  type="checkbox"
                  checked={preferences.reloadOnNewResult ?? false}
                  onChange={(e) => update({ reloadOnNewResult: e.target.checked })}
                  className="w-3.5 h-3.5 accent-cyan-500 rounded cursor-pointer"
                />
              </label>
              <p className="text-[9.5px] leading-tight text-slate-400">
                La pizarra siempre se actualiza de inmediato en vivo. Si activas esta casilla,
                además recargará toda la página al detectar cada sorteo nuevo.
              </p>
            </div>

            {storageError && (
              <p role="status" className="mt-1 text-[10px] text-amber-400">
                Este navegador no permite guardar los tamaños.
              </p>
            )}
          </section>
        )}
        <div
          className="flex flex-col items-end gap-2"
          style={{
            opacity: isToolsVisible || controls ? 1 : 0,
            pointerEvents: isToolsVisible || controls ? "auto" : "none",
            transition: "opacity 0.3s ease",
          }}
        >
          {notice && (
            <p
              role="status"
              className="bg-slate-900/95 text-slate-200 p-2.5 rounded-xl border border-slate-800 max-w-xs text-xs shadow-xl backdrop-blur-sm"
            >
              {notice}
            </p>
          )}
          <div className="flex justify-end gap-1.5 sm:gap-2">
            <Button
              variant="secondary"
              size="icon"
              title="Ajustar tamaños de logos, letras y cajas"
              aria-label="Ajustar tamaños de logos, letras y cajas"
              aria-expanded={controls}
              aria-controls="display-controls"
              onClick={() => setControls(!controls)}
              className="h-8 w-8 bg-slate-900/85 border border-slate-700/80 hover:bg-slate-800 text-slate-200 shadow-xl backdrop-blur-sm"
            >
              <SlidersHorizontal className="w-3.5 h-3.5 text-blue-400" />
            </Button>
            <Button
              variant="secondary"
              onClick={toggleFullscreen}
              title={expanded ? "Salir de pantalla completa" : "Pantalla Completa"}
              className={`h-8 px-2.5 bg-slate-900/85 border border-slate-700/80 hover:bg-slate-800 text-slate-200 shadow-xl font-medium text-xs flex items-center gap-1.5 backdrop-blur-sm transition-all ${
                expanded ? "bg-slate-900/70" : ""
              }`}
            >
              {expanded ? (
                <>
                  <Minimize className="w-3.5 h-3.5 text-slate-300" />
                  <span className="text-[11px] sm:text-xs">Salir</span>
                </>
              ) : (
                <>
                  <Maximize className="w-3.5 h-3.5 text-slate-300" />
                  <span className="text-[11px] sm:text-xs">Pantalla Completa</span>
                </>
              )}
            </Button>
          </div>
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
