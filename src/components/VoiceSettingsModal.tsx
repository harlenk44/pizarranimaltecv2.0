import { useState, useEffect } from "react";
import { Volume2, X, Play, Sliders, Bell, Sparkles, Radio, Globe, AlertCircle } from "lucide-react";
import {
  type VoiceSettings,
  getAvailableSpanishVoices,
  getAllBrowserVoices,
  loadVoiceSettings,
  saveVoiceSettings,
  speakLotteryResult,
  stopAllAudio,
} from "@/lib/lottery-audio";

interface VoiceSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSettingsChanged?: (settings: VoiceSettings) => void;
}

export default function VoiceSettingsModal({
  isOpen,
  onClose,
  onSettingsChanged,
}: VoiceSettingsModalProps) {
  const [settings, setSettings] = useState<VoiceSettings>(loadVoiceSettings());
  const [spanishVoices, setSpanishVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [allVoices, setAllVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [isTesting, setIsTesting] = useState(false);

  useEffect(() => {
    if (!isOpen) return;

    const updateVoices = () => {
      setSpanishVoices(getAvailableSpanishVoices());
      setAllVoices(getAllBrowserVoices());
    };

    updateVoices();

    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.onvoiceschanged = updateVoices;
    }

    return () => {
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        window.speechSynthesis.onvoiceschanged = null;
      }
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSave = (updated: Partial<VoiceSettings>) => {
    const next = { ...settings, ...updated };
    setSettings(next);
    saveVoiceSettings(next);
    onSettingsChanged?.(next);
  };

  const handleTestVoice = (customSettings?: Partial<VoiceSettings>) => {
    stopAllAudio();
    const testConfig: VoiceSettings = {
      ...settings,
      ...customSettings,
    };

    setIsTesting(true);
    speakLotteryResult({
      gameName: "Lotto Activo",
      drawTime: "10:00:00",
      animalNumber: 4,
      animalName: "Alacrán",
      animalLabel: "04",
      settings: testConfig,
      onEnd: () => setIsTesting(false),
    });
  };

  const handleClose = () => {
    stopAllAudio();
    onClose();
  };

  const hasSpanishBrowserVoices = spanishVoices.length > 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in"
      role="dialog"
      aria-modal="true"
    >
      <div className="w-full max-w-lg rounded-2xl bg-slate-900 border border-slate-700 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/40">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-blue-600/20 text-blue-400 border border-blue-500/30 flex items-center justify-center">
              <Sliders className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                Selector de Voz en Español
                <Sparkles className="w-4 h-4 text-amber-400" />
              </h2>
              <p className="text-xs text-slate-400">
                Garantiza pronunciación 100% en español natural y humana
              </p>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-5 overflow-y-auto flex-1">
          {/* Engine Selector */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2.5">
              Tipo de Voz para tus Sorteos
            </label>

            <div className="space-y-2.5">
              {/* Option 1: Online HD Natural Spanish */}
              <div
                onClick={() => handleSave({ engine: "online_hd" })}
                className={`p-3.5 rounded-xl border cursor-pointer transition flex flex-col gap-1.5 ${
                  settings.engine === "online_hd"
                    ? "bg-blue-600/20 border-blue-500 ring-1 ring-blue-500 text-white"
                    : "bg-slate-950/60 border-slate-800 hover:bg-slate-850 text-slate-300"
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Radio
                      className={`w-4 h-4 ${settings.engine === "online_hd" ? "text-blue-400" : "text-slate-500"}`}
                    />
                    <span className="font-bold text-sm text-white flex items-center gap-2">
                      Voz Natural en Español (HD)
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 font-semibold">
                        Recomendada
                      </span>
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleSave({ engine: "online_hd" });
                      handleTestVoice({ engine: "online_hd" });
                    }}
                    className="px-2.5 py-1 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-[11px] font-bold flex items-center gap-1 transition"
                  >
                    <Play className="w-3 h-3 fill-current" /> Probar
                  </button>
                </div>
                <p className="text-xs text-slate-400 pl-6">
                  Voz humana con acento y pronunciación auténtica en español. Funciona en cualquier
                  dispositivo (incluso si tu Windows o navegador está en inglés).
                </p>
              </div>

              {/* Option 2: Browser Local Voice */}
              <div
                onClick={() => handleSave({ engine: "browser" })}
                className={`p-3.5 rounded-xl border cursor-pointer transition flex flex-col gap-1.5 ${
                  settings.engine === "browser"
                    ? "bg-blue-600/20 border-blue-500 ring-1 ring-blue-500 text-white"
                    : "bg-slate-950/60 border-slate-800 hover:bg-slate-850 text-slate-300"
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Radio
                      className={`w-4 h-4 ${settings.engine === "browser" ? "text-blue-400" : "text-slate-500"}`}
                    />
                    <span className="font-bold text-sm text-white">
                      Voces Locales del Navegador / Sistema
                    </span>
                  </div>

                  {hasSpanishBrowserVoices && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleSave({ engine: "browser" });
                        handleTestVoice({ engine: "browser" });
                      }}
                      className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-[11px] font-bold flex items-center gap-1 border border-slate-700 transition"
                    >
                      <Play className="w-3 h-3 fill-current" /> Probar
                    </button>
                  )}
                </div>

                {!hasSpanishBrowserVoices ? (
                  <div className="mt-1 ml-6 p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                    <div>
                      <p className="font-semibold">Tu equipo solo tiene voces en inglés.</p>
                      <p className="text-[11px] text-amber-200/80 mt-0.5">
                        Detectamos {allVoices.length} voces en tu sistema, todas en inglés. Por eso
                        anteriormente se escuchaba con acento en inglés. Te recomendamos usar la{" "}
                        <strong className="text-white">Voz Natural en Español (HD)</strong> arriba.
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="mt-2 ml-6 space-y-1">
                    <span className="text-[11px] text-slate-400 block mb-1">
                      Selecciona una de las voces en español de tu sistema:
                    </span>
                    <select
                      value={settings.voiceUri}
                      onChange={(e) => handleSave({ voiceUri: e.target.value, engine: "browser" })}
                      className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white"
                    >
                      {spanishVoices.map((v) => (
                        <option key={v.voiceURI} value={v.voiceURI}>
                          {v.name} ({v.lang})
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Speed / Rate control */}
          <div>
            <div className="flex items-center justify-between text-xs mb-2">
              <span className="font-semibold text-slate-300 uppercase tracking-wider">
                Velocidad de locución
              </span>
              <span className="font-mono text-blue-400 font-bold">{settings.rate.toFixed(2)}x</span>
            </div>
            <input
              type="range"
              min="0.75"
              max="1.25"
              step="0.05"
              value={settings.rate}
              onChange={(e) => handleSave({ rate: parseFloat(e.target.value) })}
              className="w-full accent-blue-500 bg-slate-800 rounded-lg cursor-pointer h-2"
            />
            <div className="flex justify-between text-[10px] text-slate-400 mt-1">
              <span>Más calmada (0.75x)</span>
              <span>Natural (0.95x)</span>
              <span>Rápida (1.25x)</span>
            </div>
          </div>

          {/* Chime toggle */}
          <div className="flex items-center justify-between p-3.5 rounded-xl bg-slate-950 border border-slate-800">
            <div className="flex items-center gap-2.5">
              <Bell className="w-4 h-4 text-amber-400" />
              <div>
                <span className="text-xs font-semibold text-white block">
                  Timbre de aviso de sorteo
                </span>
                <span className="text-[11px] text-slate-400 block">
                  Suena un tono de radio antes de iniciar la locución en español
                </span>
              </div>
            </div>
            <input
              type="checkbox"
              checked={settings.playChime}
              onChange={(e) => handleSave({ playChime: e.target.checked })}
              className="w-4 h-4 rounded accent-blue-600 cursor-pointer"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-800 bg-slate-950/60 flex items-center justify-between">
          <button
            type="button"
            onClick={() => handleTestVoice()}
            disabled={isTesting}
            className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs font-bold flex items-center gap-1.5 transition shadow-lg shadow-blue-600/30"
          >
            <Volume2 className="w-4 h-4" />
            <span>{isTesting ? "Reproduciendo muestra..." : "Escuchar resultado en español"}</span>
          </button>
          <button
            type="button"
            onClick={handleClose}
            className="px-5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold border border-slate-700 transition"
          >
            Listo
          </button>
        </div>
      </div>
    </div>
  );
}
