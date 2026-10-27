import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { Maximize, Minimize, SlidersHorizontal, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DisplayProvider, useDisplay } from "@/context/DisplayContext";
import { useBoardSettings } from "@/context/BoardSettingsContext";

function DisplayShell({ children }: { children: ReactNode }) {
  const { preferences, update, storageError } = useDisplay();
  const { settings } = useBoardSettings();
  const shell = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [controls, setControls] = useState(false);
  const [notice, setNotice] = useState("");
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
    "--display-logo": `${preferences.logoSize}px`,
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
            className="display-controls bg-popover text-popover-foreground border border-border rounded-lg shadow-lg"
            aria-label="Tamaños de la pizarra"
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-bold">Tamaños de la pizarra</h2>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Cerrar ajustes"
                onClick={() => setControls(false)}
              >
                <X />
              </Button>
            </div>
            <label className="block font-bold mb-5" htmlFor="result-scale">
              Cuadros de resultados{" "}
              <output className="float-right">{preferences.resultScale}%</output>
              <input
                id="result-scale"
                type="range"
                min="75"
                max="250"
                step="5"
                value={preferences.resultScale}
                onChange={(e) => update({ resultScale: Number(e.target.value) })}
                className="block w-full mt-3 accent-primary"
              />
            </label>
            <label className="block font-bold" htmlFor="logo-size">
              Logos <output className="float-right">{preferences.logoSize}px</output>
              <input
                id="logo-size"
                type="range"
                min="32"
                max="240"
                step="4"
                value={preferences.logoSize}
                onChange={(e) => update({ logoSize: Number(e.target.value) })}
                className="block w-full mt-3 accent-primary"
              />
            </label>
            {storageError && (
              <p role="status" className="mt-3 text-sm">
                Este navegador no permite guardar los tamaños.
              </p>
            )}
          </section>
        )}
        {notice && (
          <p role="status" className="bg-popover text-popover-foreground p-3 rounded-md max-w-xs">
            {notice}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Button
            variant="secondary"
            size="icon"
            title="Ajustar tamaños"
            aria-label="Ajustar tamaños"
            aria-expanded={controls}
            aria-controls="display-controls"
            onClick={() => setControls(!controls)}
          >
            <SlidersHorizontal />
          </Button>
          <Button
            variant="secondary"
            onClick={toggleFullscreen}
            title={expanded ? "Salir de pantalla completa" : "Pantalla Completa"}
          >
            {expanded ? <Minimize /> : <Maximize />}
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
