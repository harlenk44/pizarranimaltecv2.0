import { useEffect, useState, useRef, useCallback } from "react";
import {
  Palette,
  Timer,
  Type,
  Save,
  Loader2,
  Check,
  Volume2,
  VolumeX,
  Play,
  Radio,
  Sparkles,
  Square,
  Users,
  Globe,
  RotateCcw,
  ShieldAlert,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useBoardSettings } from "@/context/BoardSettingsContext";
import {
  type VoiceSettings,
  loadVoiceSettings,
  saveVoiceSettings,
  speakLotteryResult,
  stopAllAudio,
  ensureAudioUnlocked,
} from "@/lib/lottery-audio";
import {
  CLASSIC_COLOR_PALETTE,
  NEON_COLOR_PALETTE,
  getGameNeonColor,
  type BoardCardVisualStyle,
} from "@/lib/neon-flex";
import {
  parseClientLicenseName,
  formatClientLicenseName,
  ALL_AVAILABLE_LOTTERIES,
  DEFAULT_ANIMAL_LOTTERIES,
  ALL_TRIPLE_LOTTERIES,
  DEFAULT_CLIENT_VOICE_CONFIG,
  type ClientVoiceConfig,
  type ClientDesignConfig,
} from "@/lib/license-lotteries";
import type { AppSettings, ClientLicense } from "@/lib/types";

export default function DesignManager() {
  const { settings, refreshSettings, updateSettings } = useBoardSettings();
  const [draft, setDraft] = useState<AppSettings>(settings);
  const [voiceSettings, setVoiceSettings] = useState<VoiceSettings>(loadVoiceSettings());
  const [testingVoice, setTestingVoice] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  // Per-user / client license customization state
  const [licenses, setLicenses] = useState<ClientLicense[]>([]);
  const [selectedLicenseId, setSelectedLicenseId] = useState<string>("GLOBAL");
  const [userDesignDraft, setUserDesignDraft] = useState<ClientDesignConfig>({});
  const [userVoiceDraft, setUserVoiceDraft] = useState<ClientVoiceConfig>(
    DEFAULT_CLIENT_VOICE_CONFIG,
  );

  // Selected game in the per-game dual color palette editor
  const [selectedGameSlug, setSelectedGameSlug] = useState<string>(
    DEFAULT_ANIMAL_LOTTERIES[0]?.id ?? "lotto_activo",
  );
  // Selected board color property for quick dual palette buttons
  const [activeBoardColorKey, setActiveBoardColorKey] = useState<
    | "primary_color"
    | "background_color"
    | "surface_color"
    | "text_color"
    | "card_color"
    | "result_row_color"
  >("primary_color");

  // Audio diagnostic state
  const [voicesCount, setVoicesCount] = useState<number>(0);
  const [spanishVoicesCount, setSpanishVoicesCount] = useState<number>(0);

  const saveTimerRef = useRef<NodeJS.Timeout | null>(null);
  const latestDraftRef = useRef<AppSettings>(draft);

  // Load client licenses so admin can customize design & voice per user/PIN
  const fetchClientLicenses = useCallback(async () => {
    try {
      const res = await fetch("/api/public/results/sync");
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.clientLicenses)) {
          setLicenses(data.clientLicenses);
        }
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    fetchClientLicenses();
  }, [fetchClientLicenses]);

  // Monitor browser SpeechSynthesis voices for the audio diagnostic panel
  useEffect(() => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    const updateVoiceStats = () => {
      try {
        const all = window.speechSynthesis.getVoices();
        setVoicesCount(all.length);
        setSpanishVoicesCount(
          all.filter((v) => (v?.lang || "").toLowerCase().startsWith("es")).length,
        );
      } catch {
        // ignore
      }
    };
    updateVoiceStats();
    window.speechSynthesis.addEventListener?.("voiceschanged", updateVoiceStats);
    return () => {
      window.speechSynthesis.removeEventListener?.("voiceschanged", updateVoiceStats);
    };
  }, []);

  const persistSettings = useCallback(async (payload: AppSettings) => {
    try {
      await supabase.from("app_settings").upsert(payload, { onConflict: "id" });
    } catch {
      // ignore
    }
    try {
      await fetch("/api/public/results/sync", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ appSettings: payload }),
      });
    } catch {
      // ignore
    }
    try {
      const bc = new BroadcastChannel("pizarra_lottery_channel");
      bc.postMessage({ type: "APP_SETTINGS_UPDATED", settings: payload });
      setTimeout(() => bc.close(), 1000);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    if (!saveTimerRef.current) {
      setDraft(settings);
      latestDraftRef.current = settings;
    }
  }, [settings]);

  // Flush any pending changes when leaving the DesignManager page
  useEffect(() => {
    return () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
        persistSettings(latestDraftRef.current);
      }
    };
  }, [persistSettings]);

  // When switching between Global and a specific User License, load that user's saved design & voice
  const handleSelectTargetScope = (licenseId: string) => {
    setSelectedLicenseId(licenseId);
    setMessage("");
    if (licenseId === "GLOBAL") return;
    const target = licenses.find((l) => l.id === licenseId);
    if (!target) return;
    const parsed = parseClientLicenseName(target.client_name);
    setUserDesignDraft(parsed.designConfig ?? {});
    setUserVoiceDraft(parsed.voiceConfig ?? DEFAULT_CLIENT_VOICE_CONFIG);
  };

  const selectedLicense =
    selectedLicenseId === "GLOBAL"
      ? null
      : (licenses.find((l) => l.id === selectedLicenseId) ?? null);

  const isUserMode = selectedLicense !== null;

  // Effective values displayed in controls (either Global or User override)
  const effectiveCardStyle: BoardCardVisualStyle = isUserMode
    ? (userDesignDraft.card_style ?? draft.card_style ?? "neon")
    : (draft.card_style ?? "neon");

  const effectiveGameColors: Record<string, string> = isUserMode
    ? { ...(draft.game_colors ?? {}), ...(userDesignDraft.game_colors ?? {}) }
    : (draft.game_colors ?? {});

  const currentSelectedGameColor = getGameNeonColor(
    selectedGameSlug,
    effectiveGameColors[selectedGameSlug],
    effectiveGameColors,
  );

  function setValue<K extends keyof AppSettings>(key: K, value: AppSettings[K]) {
    if (isUserMode) {
      setUserDesignDraft((prev) => ({
        ...prev,
        [key]: value,
      }));
      return;
    }

    const updated: AppSettings = {
      ...draft,
      [key]: value,
      id: "global",
      updated_at: new Date().toISOString(),
    };
    latestDraftRef.current = updated;
    setDraft(updated);
    updateSettings(updated);

    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
    }
    saveTimerRef.current = setTimeout(() => {
      saveTimerRef.current = null;
      persistSettings(updated);
    }, 300);
  }

  function handleSetGameColor(gameSlug: string, hexColor: string) {
    if (isUserMode) {
      setUserDesignDraft((prev) => ({
        ...prev,
        game_colors: {
          ...(prev.game_colors ?? {}),
          [gameSlug]: hexColor,
        },
      }));
      return;
    }

    const nextGameColors = {
      ...(draft.game_colors ?? {}),
      [gameSlug]: hexColor,
    };
    setValue("game_colors", nextGameColors);
  }

  function handleResetGameColor(gameSlug: string) {
    if (isUserMode) {
      setUserDesignDraft((prev) => {
        const nextMap = { ...(prev.game_colors ?? {}) };
        delete nextMap[gameSlug];
        return {
          ...prev,
          game_colors: nextMap,
        };
      });
      return;
    }

    const nextMap = { ...(draft.game_colors ?? {}) };
    delete nextMap[gameSlug];
    setValue("game_colors", nextMap);
  }

  async function save() {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    setSaving(true);
    setMessage("");

    if (isUserMode && selectedLicense) {
      const parsed = parseClientLicenseName(selectedLicense.client_name);
      const packedName = formatClientLicenseName(
        parsed.cleanName,
        parsed.allowedLotteries,
        ALL_AVAILABLE_LOTTERIES.length,
        parsed.cardsPerScreen,
        parsed.transitionSeconds,
        userVoiceDraft,
        userDesignDraft,
      );

      try {
        await supabase
          .from("client_licenses")
          .update({ client_name: packedName })
          .eq("id", selectedLicense.id);
      } catch {
        // ignore
      }

      try {
        const res = await fetch("/api/public/results/sync", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            licenseAction: {
              type: "update_lotteries",
              id: selectedLicense.id,
              client_name: packedName,
            },
          }),
        });
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data.clientLicenses)) {
            setLicenses(data.clientLicenses);
          }
        }
      } catch {
        // ignore
      }

      try {
        const bc = new BroadcastChannel("pizarra_lottery_channel");
        bc.postMessage({ type: "LICENSES_UPDATED" });
        setTimeout(() => bc.close(), 1000);
      } catch {
        // ignore
      }

      setMessage(
        `¡Diseño, colores y control de voz guardados en Supabase para el cliente "${parsed.cleanName}" (PIN ${selectedLicense.pin_code})!`,
      );
      setSaving(false);
      return;
    }

    const fullPayload: AppSettings = {
      ...draft,
      id: "global",
      updated_at: new Date().toISOString(),
    };
    latestDraftRef.current = fullPayload;

    updateSettings(fullPayload);
    await persistSettings(fullPayload);

    setMessage("¡Diseño global guardado y sincronizado exitosamente para todas las pantallas!");
    await refreshSettings();
    setSaving(false);
  }

  async function handleResetUserDesignToGlobal() {
    if (!isUserMode || !selectedLicense) return;
    setUserDesignDraft({});
    setUserVoiceDraft(DEFAULT_CLIENT_VOICE_CONFIG);
    setSaving(true);
    const parsed = parseClientLicenseName(selectedLicense.client_name);
    const packedName = formatClientLicenseName(
      parsed.cleanName,
      parsed.allowedLotteries,
      ALL_AVAILABLE_LOTTERIES.length,
      parsed.cardsPerScreen,
      parsed.transitionSeconds,
      DEFAULT_CLIENT_VOICE_CONFIG,
      null,
    );
    try {
      await fetch("/api/public/results/sync", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          licenseAction: {
            type: "update_lotteries",
            id: selectedLicense.id,
            client_name: packedName,
          },
        }),
      });
      await fetchClientLicenses();
      const bc = new BroadcastChannel("pizarra_lottery_channel");
      bc.postMessage({ type: "LICENSES_UPDATED" });
      setTimeout(() => bc.close(), 1000);
    } catch {
      // ignore
    }
    setMessage(`El cliente "${parsed.cleanName}" ahora usa el Diseño Global por defecto.`);
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

  const getBoardColorValue = (
    key:
      | "background_color"
      | "surface_color"
      | "primary_color"
      | "text_color"
      | "card_color"
      | "result_row_color",
  ): string => {
    if (isUserMode && userDesignDraft[key]) {
      return userDesignDraft[key] as string;
    }
    return draft[key] || "#000000";
  };

  // Voice values (either Global or User-specific)
  const activeVoiceEnabled = isUserMode ? userVoiceDraft.enabled : voiceSettings.enabled;
  const activeVoiceEngine = isUserMode ? userVoiceDraft.engine : voiceSettings.engine;
  const activeVoiceRate = isUserMode ? userVoiceDraft.rate : voiceSettings.rate;
  const activeVoiceChime = isUserMode ? userVoiceDraft.playChime : voiceSettings.playChime;

  const updateActiveVoice = (partial: Partial<ClientVoiceConfig>) => {
    if (isUserMode) {
      setUserVoiceDraft((prev) => ({
        ...prev,
        ...partial,
      }));
      return;
    }
    const next: VoiceSettings = {
      ...voiceSettings,
      ...partial,
    };
    setVoiceSettings(next);
    saveVoiceSettings(next);
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2 text-white">
            <Palette className="w-5 h-5 text-blue-500" /> Diseño, Colores y Control de Voz
          </h2>
          <p className="text-sm text-slate-400 mt-1">
            Personaliza colores clásicos o fosforescentes, estilo de tarjetas (Neón o Clásico) y
            locución de voz de forma global o por cada cliente/PIN.
          </p>
        </div>
        <div className="flex items-center gap-2.5 flex-wrap">
          {isUserMode && (
            <button
              type="button"
              onClick={handleResetUserDesignToGlobal}
              disabled={saving}
              className="bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold px-3.5 py-2.5 rounded-xl border border-slate-700 flex items-center gap-1.5 cursor-pointer transition"
              title="Restaurar este cliente al diseño global"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Usar Diseño Global
            </button>
          )}
          <button
            onClick={save}
            disabled={saving}
            className="bg-blue-600 hover:bg-blue-500 text-white font-medium px-5 py-2.5 rounded-xl shadow-lg shadow-blue-600/20 flex items-center gap-2 cursor-pointer transition"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {isUserMode
              ? `Guardar Diseño de Cliente (PIN ${selectedLicense?.pin_code})`
              : "Guardar Cambios de Diseño Global"}
          </button>
        </div>
      </div>

      {/* Scope Selector: Global vs Per-User/Client License */}
      <div className="bg-slate-900/95 border border-slate-800 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-xl">
        <div className="flex items-center gap-3">
          <div
            className={`w-10 h-10 rounded-xl flex items-center justify-center border ${
              isUserMode
                ? "bg-purple-950/70 border-purple-500/50 text-purple-300"
                : "bg-blue-950/70 border-blue-500/50 text-blue-300"
            }`}
          >
            {isUserMode ? <Users className="w-5 h-5" /> : <Globe className="w-5 h-5" />}
          </div>
          <div>
            <div className="text-xs font-bold uppercase tracking-wider text-slate-400">
              Modo de Personalización Activo
            </div>
            <div className="text-sm font-bold text-white">
              {isUserMode && selectedLicense
                ? `Diseño Exclusivo: ${parseClientLicenseName(selectedLicense.client_name).cleanName} (PIN ${selectedLicense.pin_code})`
                : "Diseño Global (Todas las agencias sin diseño personalizado)"}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <label className="text-xs text-slate-400 font-medium">Aplicar cambios a:</label>
          <select
            value={selectedLicenseId}
            onChange={(e) => handleSelectTargetScope(e.target.value)}
            className="bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-xs font-bold text-white focus:outline-none focus:border-blue-500 cursor-pointer"
          >
            <option value="GLOBAL">🌐 Diseño Global (Por defecto para todos)</option>
            {licenses.map((lic) => {
              const parsed = parseClientLicenseName(lic.client_name);
              const hasCustomDesign =
                parsed.designConfig && Object.keys(parsed.designConfig).length > 0;
              return (
                <option key={lic.id} value={lic.id}>
                  👤 {parsed.cleanName} — PIN: {lic.pin_code}
                  {hasCustomDesign ? " (Diseño Personalizado)" : ""}
                </option>
              );
            })}
          </select>
        </div>
      </div>

      {message && (
        <div className="p-3.5 rounded-xl bg-blue-950/60 border border-blue-800 text-blue-300 text-xs font-medium flex items-center gap-2">
          <Check className="w-4 h-4 text-emerald-400" />
          {message}
        </div>
      )}

      {/* Card Visual Style Selector: NEON vs SOLID */}
      <section className="bg-slate-900/90 rounded-2xl border border-slate-800 p-5 space-y-4 shadow-xl">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800 pb-3">
          <div>
            <h3 className="font-bold text-sm text-white flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-amber-400" /> Acabado Visual de Tarjetas (Estilo
              Neón vs. Estilo Normal / Clásico)
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Elige si las tarjetas de resultados muestran halo luminoso LED o bordes limpios y
              sólidos tradicionales.
            </p>
          </div>
          <span className="text-[11px] font-mono font-bold px-2.5 py-1 rounded-lg bg-slate-950 border border-slate-800 text-emerald-400">
            Activo: {effectiveCardStyle === "neon" ? "⚡ NEÓN (TUBO LED)" : "🎨 NORMAL / SÓLIDO"}
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <button
            type="button"
            onClick={() => setValue("card_style", "neon")}
            className={`p-4 rounded-xl border text-left transition flex items-start gap-3.5 cursor-pointer ${
              effectiveCardStyle === "neon"
                ? "bg-emerald-950/40 border-emerald-400 ring-1 ring-emerald-400/60 text-white shadow-[0_0_20px_rgba(16,185,129,0.2)]"
                : "bg-slate-950/70 border-slate-800 hover:border-slate-700 text-slate-300"
            }`}
          >
            <div className="w-9 h-9 rounded-lg bg-emerald-500/20 border border-emerald-400 flex items-center justify-center shrink-0 mt-0.5 shadow-[0_0_12px_#10b981]">
              <Sparkles className="w-4 h-4 text-emerald-300" />
            </div>
            <div>
              <div className="font-bold text-sm text-white flex items-center gap-2">
                Estilo Neón (Tubo LED)
                {effectiveCardStyle === "neon" && (
                  <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded bg-emerald-500 text-slate-950 font-black">
                    Activo
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400 mt-1">
                Con halo luminoso, relieve de cristal y brillo intenso para resaltar en pantallas de
                TV.
              </p>
            </div>
          </button>

          <button
            type="button"
            onClick={() => setValue("card_style", "solid")}
            className={`p-4 rounded-xl border text-left transition flex items-start gap-3.5 cursor-pointer ${
              effectiveCardStyle === "solid"
                ? "bg-blue-950/50 border-blue-400 ring-1 ring-blue-400/60 text-white"
                : "bg-slate-950/70 border-slate-800 hover:border-slate-700 text-slate-300"
            }`}
          >
            <div className="w-9 h-9 rounded-lg bg-blue-600/20 border-2 border-blue-500 flex items-center justify-center shrink-0 mt-0.5">
              <Square className="w-4 h-4 text-blue-300" />
            </div>
            <div>
              <div className="font-bold text-sm text-white flex items-center gap-2">
                Estilo Normal / Clásico (Sólido)
                {effectiveCardStyle === "solid" && (
                  <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded bg-blue-500 text-white font-black">
                    Activo
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400 mt-1">
                Bordes limpios y colores sólidos tradicionales sin resplandor ni efecto de tubo de
                luz.
              </p>
            </div>
          </button>
        </div>
      </section>

      {/* Dual Color Selector per Game (Animalitos & Triples) */}
      <section className="bg-slate-900/90 rounded-2xl border border-slate-800 p-6 space-y-5 shadow-xl">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-3">
          <div>
            <h3 className="font-bold text-sm text-white flex items-center gap-2">
              <Palette className="w-4 h-4 text-emerald-400" /> Colores por Juego (Paleta Clásica +
              Paleta Fosforescente / Neón)
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Selecciona cualquier lotería y asígnale un color normal/clásico, un color
              fosforescente/neón o cualquier código HEX libre.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <select
              value={selectedGameSlug}
              onChange={(e) => setSelectedGameSlug(e.target.value)}
              className="bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs font-bold text-white focus:outline-none focus:border-blue-500 cursor-pointer"
            >
              <optgroup label="Animalitos">
                {DEFAULT_ANIMAL_LOTTERIES.map((g) => (
                  <option key={g.id} value={g.id}>
                    🐾 {g.name}
                  </option>
                ))}
              </optgroup>
              <optgroup label="Triples">
                {ALL_TRIPLE_LOTTERIES.map((g) => (
                  <option key={g.id} value={g.id}>
                    🎰 {g.name}
                  </option>
                ))}
              </optgroup>
            </select>

            <button
              type="button"
              onClick={() => handleResetGameColor(selectedGameSlug)}
              className="px-2.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium flex items-center gap-1 cursor-pointer transition"
              title="Restaurar color original de este juego"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Original
            </button>
          </div>
        </div>

        {/* Free color picker + current preview */}
        <div className="flex flex-wrap items-center justify-between gap-4 bg-slate-950/80 border border-slate-800 rounded-xl p-3.5">
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-xl border-2 shrink-0"
              style={{
                backgroundColor: currentSelectedGameColor,
                borderColor: "#ffffff",
                boxShadow:
                  effectiveCardStyle === "neon" ? `0 0 14px ${currentSelectedGameColor}` : "none",
              }}
            />
            <div>
              <div className="text-xs font-bold text-white">
                Color actual de{" "}
                {ALL_AVAILABLE_LOTTERIES.find((l) => l.id === selectedGameSlug)?.name ??
                  selectedGameSlug}
              </div>
              <div className="text-[11px] text-slate-400 font-mono">
                {currentSelectedGameColor.toUpperCase()}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400">Selector libre:</span>
            <input
              type="color"
              value={currentSelectedGameColor}
              onChange={(e) => handleSetGameColor(selectedGameSlug, e.target.value)}
              className="w-11 h-9 rounded-lg bg-slate-900 border border-slate-700 cursor-pointer p-0.5"
            />
            <input
              type="text"
              value={currentSelectedGameColor}
              onChange={(e) => handleSetGameColor(selectedGameSlug, e.target.value)}
              className="w-28 bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs font-mono uppercase text-white focus:outline-none focus:border-blue-500"
            />
          </div>
        </div>

        {/* Two Quick-Select Palette Groups */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Group 1: Normal / Classic Colors */}
          <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-3.5 space-y-2.5">
            <div className="text-xs font-bold text-slate-200 flex items-center justify-between">
              <span>🎨 Colores Normales / Clásicos</span>
              <span className="text-[10px] text-slate-400 font-normal">Tonos tradicionales</span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {CLASSIC_COLOR_PALETTE.map((swatch) => {
                const hexVal = swatch.hex || swatch.value || "";
                const nameLabel = swatch.name || swatch.label || hexVal;
                const isSelected =
                  Boolean(currentSelectedGameColor) &&
                  (currentSelectedGameColor || "").toLowerCase() === hexVal.toLowerCase();
                return (
                  <button
                    key={hexVal}
                    type="button"
                    onClick={() => handleSetGameColor(selectedGameSlug, hexVal)}
                    className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg border text-left text-[11px] font-medium transition cursor-pointer ${
                      isSelected
                        ? "bg-slate-800 border-white text-white ring-1 ring-white"
                        : "bg-slate-900/90 border-slate-800 text-slate-300 hover:border-slate-600 hover:text-white"
                    }`}
                  >
                    <span
                      className="w-4 h-4 rounded-md shrink-0 border border-white/30"
                      style={{ backgroundColor: hexVal }}
                    />
                    <span className="truncate">{nameLabel}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Group 2: Fluorescent / Neon Colors */}
          <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-3.5 space-y-2.5">
            <div className="text-xs font-bold text-emerald-300 flex items-center justify-between">
              <span>⚡ Colores Fosforescentes / Neón</span>
              <span className="text-[10px] text-emerald-400/80 font-normal">Alto brillo LED</span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {NEON_COLOR_PALETTE.map((swatch) => {
                const hexVal = swatch.hex || swatch.value || "";
                const nameLabel = swatch.name || swatch.label || hexVal;
                const isSelected =
                  Boolean(currentSelectedGameColor) &&
                  (currentSelectedGameColor || "").toLowerCase() === hexVal.toLowerCase();
                return (
                  <button
                    key={hexVal}
                    type="button"
                    onClick={() => handleSetGameColor(selectedGameSlug, hexVal)}
                    className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg border text-left text-[11px] font-medium transition cursor-pointer ${
                      isSelected
                        ? "bg-slate-800 border-white text-white ring-1 ring-white"
                        : "bg-slate-900/90 border-slate-800 text-slate-300 hover:border-slate-600 hover:text-white"
                    }`}
                  >
                    <span
                      className="w-4 h-4 rounded-md shrink-0 border border-white/40"
                      style={{
                        backgroundColor: hexVal,
                        boxShadow: `0 0 8px ${hexVal}`,
                      }}
                    />
                    <span className="truncate">{nameLabel}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Board Colors Palette Section */}
        <section className="bg-slate-900/90 rounded-2xl border border-slate-800 p-6 space-y-5 shadow-xl">
          <h3 className="font-bold text-sm text-white flex items-center gap-2 border-b border-slate-800 pb-3">
            <Palette className="w-4 h-4 text-blue-400" /> Paleta de Colores de la Pizarra
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {colors.map(({ key, label }) => {
              const val = getBoardColorValue(key);
              const isFocused = activeBoardColorKey === key;
              return (
                <div
                  key={key}
                  onClick={() => setActiveBoardColorKey(key)}
                  className={`p-2.5 rounded-xl border transition cursor-pointer space-y-1.5 ${
                    isFocused
                      ? "bg-slate-950/90 border-blue-500/70"
                      : "bg-slate-950/40 border-slate-800/80 hover:border-slate-700"
                  }`}
                >
                  <span className="block text-xs font-medium text-slate-300">{label}</span>
                  <div className="flex gap-2">
                    <input
                      type="color"
                      value={val}
                      onChange={(e) => {
                        setActiveBoardColorKey(key);
                        setValue(key, e.target.value);
                      }}
                      className="w-11 h-9 rounded-lg bg-slate-950 border border-slate-700 cursor-pointer p-0.5"
                    />
                    <input
                      value={val}
                      onChange={(e) => {
                        setActiveBoardColorKey(key);
                        setValue(key, e.target.value);
                      }}
                      className="min-w-0 flex-1 bg-slate-950 border border-slate-700 rounded-lg px-2.5 text-xs font-mono uppercase text-white focus:outline-none focus:border-blue-500"
                    />
                  </div>
                </div>
              );
            })}
          </div>

          {/* Quick Dual Swatches for the currently selected Board Color field */}
          <div className="pt-3 border-t border-slate-800 space-y-2.5">
            <div className="text-[11px] font-semibold text-slate-300">
              Aplicar color rápido a:{" "}
              <span className="text-blue-400 font-bold">
                {colors.find((c) => c.key === activeBoardColorKey)?.label}
              </span>
            </div>
            <div className="space-y-1.5">
              <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                🎨 Normales / Clásicos
              </div>
              <div className="flex items-center gap-1.5 flex-wrap">
                {CLASSIC_COLOR_PALETTE.map((swatch) => (
                  <button
                    key={swatch.hex}
                    type="button"
                    onClick={() => setValue(activeBoardColorKey, swatch.hex)}
                    title={`${swatch.name} (${swatch.hex})`}
                    className="w-6 h-6 rounded-md border border-white/30 hover:scale-110 transition cursor-pointer"
                    style={{ backgroundColor: swatch.hex }}
                  />
                ))}
              </div>
            </div>
            <div className="space-y-1.5">
              <div className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider">
                ⚡ Fosforescentes / Neón
              </div>
              <div className="flex items-center gap-1.5 flex-wrap">
                {NEON_COLOR_PALETTE.map((swatch) => (
                  <button
                    key={swatch.hex}
                    type="button"
                    onClick={() => setValue(activeBoardColorKey, swatch.hex)}
                    title={`${swatch.name} (${swatch.hex})`}
                    className="w-6 h-6 rounded-md border border-white/50 hover:scale-110 transition cursor-pointer"
                    style={{
                      backgroundColor: swatch.hex,
                      boxShadow: `0 0 6px ${swatch.hex}`,
                    }}
                  />
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* Typography, Rotation & Voice Control Section */}
        <section className="bg-slate-900/90 rounded-2xl border border-slate-800 p-6 space-y-5 shadow-xl">
          <h3 className="font-bold text-sm text-white flex items-center gap-2 border-b border-slate-800 pb-3">
            <Type className="w-4 h-4 text-emerald-400" /> Fuentes, Escalas y Control de Voz
          </h3>

          <div className="space-y-4">
            <label className="block text-xs font-medium text-slate-300">
              Tipo de letra principal (Font Family)
              <select
                value={
                  (isUserMode ? userDesignDraft.font_family : draft.font_family) ||
                  draft.font_family ||
                  "Inter"
                }
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
                  <strong className="text-purple-400">
                    {(isUserMode ? userDesignDraft.animal_scale : draft.animal_scale) ??
                      draft.animal_scale ??
                      100}
                    %
                  </strong>
                </div>
                <input
                  type="range"
                  min="40"
                  max="200"
                  step="5"
                  value={
                    (isUserMode ? userDesignDraft.animal_scale : draft.animal_scale) ??
                    draft.animal_scale ??
                    100
                  }
                  onChange={(e) => setValue("animal_scale", Number(e.target.value))}
                  className="w-full accent-purple-500 cursor-pointer h-2 bg-slate-950 rounded-lg border border-slate-800"
                />
              </label>

              <label className="block text-xs text-slate-300 space-y-1">
                <div className="flex justify-between font-medium">
                  <span>📦 Cuadro del Último Resultado</span>
                  <strong className="text-amber-400">
                    {(isUserMode ? userDesignDraft.hero_card_scale : draft.hero_card_scale) ??
                      draft.hero_card_scale ??
                      100}
                    %
                  </strong>
                </div>
                <input
                  type="range"
                  min="50"
                  max="200"
                  step="5"
                  value={
                    (isUserMode ? userDesignDraft.hero_card_scale : draft.hero_card_scale) ??
                    draft.hero_card_scale ??
                    100
                  }
                  onChange={(e) => setValue("hero_card_scale", Number(e.target.value))}
                  className="w-full accent-amber-500 cursor-pointer h-2 bg-slate-950 rounded-lg border border-slate-800"
                />
              </label>

              <label className="block text-xs text-slate-300 space-y-1">
                <div className="flex justify-between font-medium">
                  <span>🖼️ Tamaño de Logos</span>
                  <strong className="text-blue-400">
                    {(isUserMode ? userDesignDraft.logo_size : draft.logo_size) ??
                      draft.logo_size ??
                      72}
                    px
                  </strong>
                </div>
                <input
                  type="range"
                  min="16"
                  max="120"
                  step="2"
                  value={
                    (isUserMode ? userDesignDraft.logo_size : draft.logo_size) ??
                    draft.logo_size ??
                    72
                  }
                  onChange={(e) => setValue("logo_size", Number(e.target.value))}
                  className="w-full accent-blue-500 cursor-pointer h-2 bg-slate-950 rounded-lg border border-slate-800"
                />
              </label>

              <label className="block text-xs text-slate-300 space-y-1">
                <div className="flex justify-between font-medium">
                  <span>🔤 Escala de Letras / Tipografía</span>
                  <strong className="text-emerald-400">
                    {(isUserMode ? userDesignDraft.font_size_scale : draft.font_size_scale) ??
                      draft.font_size_scale ??
                      100}
                    %
                  </strong>
                </div>
                <input
                  type="range"
                  min="70"
                  max="200"
                  step="5"
                  value={
                    (isUserMode ? userDesignDraft.font_size_scale : draft.font_size_scale) ??
                    draft.font_size_scale ??
                    100
                  }
                  onChange={(e) => setValue("font_size_scale", Number(e.target.value))}
                  className="w-full accent-emerald-500 cursor-pointer h-2 bg-slate-950 rounded-lg border border-slate-800"
                />
              </label>
            </div>

            {!isUserMode && (
              <div className="pt-3 border-t border-slate-800 space-y-3">
                <h4 className="font-bold text-sm text-white flex items-center gap-2">
                  <Timer className="w-4 h-4 text-amber-400" /> Rotación de Vistas
                </h4>
                <label className="flex items-center justify-between text-xs text-slate-300">
                  <span>Cambio automático entre Pizarra de Animalitos y Triples</span>
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
                      onChange={(e) =>
                        setValue("rotation_interval_seconds", Number(e.target.value))
                      }
                      className="w-full accent-blue-500 cursor-pointer"
                    />
                  </label>
                )}
              </div>
            )}

            {/* Voice Control & Audio Check Section */}
            <div className="pt-3 border-t border-slate-800 space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="font-bold text-sm text-white flex items-center gap-2">
                  {activeVoiceEnabled ? (
                    <Volume2 className="w-4 h-4 text-emerald-400" />
                  ) : (
                    <VolumeX className="w-4 h-4 text-red-400" />
                  )}
                  <span>
                    Control de Voz {isUserMode ? "de este Cliente (PIN)" : "Global para Sorteos"}
                  </span>
                </h4>

                <button
                  type="button"
                  onClick={() => updateActiveVoice({ enabled: !activeVoiceEnabled })}
                  className={`px-3 py-1 rounded-lg text-xs font-bold border transition cursor-pointer ${
                    activeVoiceEnabled
                      ? "bg-emerald-600/20 border-emerald-500 text-emerald-300"
                      : "bg-red-950/50 border-red-700/60 text-red-300"
                  }`}
                >
                  {activeVoiceEnabled ? "🔊 Locución: ACTIVA" : "🔇 Locución: SILENCIADA"}
                </button>
              </div>

              {/* Speed & Chime controls */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-slate-950/60 border border-slate-800 rounded-xl p-3">
                <label className="block text-xs text-slate-300 space-y-1">
                  <div className="flex justify-between font-medium">
                    <span>Velocidad de Locución</span>
                    <strong className="text-emerald-400">
                      {Number(activeVoiceRate ?? 1.0).toFixed(2)}x
                    </strong>
                  </div>
                  <input
                    type="range"
                    min="0.8"
                    max="1.25"
                    step="0.02"
                    value={activeVoiceRate ?? 1.0}
                    onChange={(e) => updateActiveVoice({ rate: Number(e.target.value) })}
                    className="w-full accent-emerald-500 cursor-pointer h-2 bg-slate-900 rounded-lg"
                  />
                </label>

                <label className="flex items-center justify-between text-xs text-slate-300 bg-slate-900/70 px-3 py-2 rounded-lg border border-slate-800 cursor-pointer">
                  <span>Timbre de Agencia (Campana)</span>
                  <input
                    type="checkbox"
                    checked={activeVoiceChime ?? true}
                    onChange={(e) => updateActiveVoice({ playChime: e.target.checked })}
                    className="w-4 h-4 accent-emerald-500 rounded cursor-pointer"
                  />
                </label>
              </div>

              <div className="space-y-2.5">
                <div
                  onClick={() =>
                    updateActiveVoice({
                      engine: "agency_voice",
                      rate: activeVoiceRate || 0.98,
                    })
                  }
                  className={`p-3 rounded-xl border cursor-pointer transition flex flex-col gap-1 ${
                    activeVoiceEngine === "agency_voice"
                      ? "bg-emerald-600/20 border-emerald-500 ring-1 ring-emerald-500 text-white"
                      : "bg-slate-950/60 border-slate-800 hover:bg-slate-850 text-slate-300"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Radio
                        className={`w-4 h-4 ${activeVoiceEngine === "agency_voice" ? "text-emerald-400" : "text-slate-500"}`}
                      />
                      <span className="font-bold text-xs text-white">
                        1. Voz de Agencia Comercial (Español Latino + Repetición)
                      </span>
                    </div>
                    <button
                      type="button"
                      disabled={testingVoice}
                      onClick={(e) => {
                        e.stopPropagation();
                        ensureAudioUnlocked();
                        stopAllAudio();
                        updateActiveVoice({ engine: "agency_voice" });
                        setTestingVoice(true);
                        speakLotteryResult({
                          gameName: "Lotto Activo",
                          drawTime: "10:00:00",
                          animalNumber: 4,
                          animalName: "Alacrán",
                          animalLabel: "04",
                          settings: {
                            ...voiceSettings,
                            enabled: true,
                            engine: "agency_voice",
                            rate: activeVoiceRate || 0.98,
                            playChime: activeVoiceChime ?? true,
                          },
                          onEnd: () => setTestingVoice(false),
                        });
                      }}
                      className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-bold flex items-center gap-1 transition cursor-pointer"
                    >
                      <Play className="w-3 h-3 fill-current" /> Probar
                    </button>
                  </div>
                  <p className="text-[11px] text-slate-400 pl-6">
                    Canta en Español Latino: &ldquo;Atención en la agencia. Nuevo resultado...
                    Repito... ¡Felicidades a los ganadores!&rdquo;
                  </p>
                </div>

                <div
                  onClick={() => updateActiveVoice({ engine: "online_hd" })}
                  className={`p-3 rounded-xl border cursor-pointer transition flex flex-col gap-1 ${
                    activeVoiceEngine === "online_hd"
                      ? "bg-blue-600/20 border-blue-500 ring-1 ring-blue-500 text-white"
                      : "bg-slate-950/60 border-slate-800 hover:bg-slate-850 text-slate-300"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Radio
                        className={`w-4 h-4 ${activeVoiceEngine === "online_hd" ? "text-blue-400" : "text-slate-500"}`}
                      />
                      <span className="font-bold text-xs text-white">
                        2. Voz Natural en Español Latino (HD Corta de Radio)
                      </span>
                    </div>
                    <button
                      type="button"
                      disabled={testingVoice}
                      onClick={(e) => {
                        e.stopPropagation();
                        ensureAudioUnlocked();
                        stopAllAudio();
                        updateActiveVoice({ engine: "online_hd" });
                        setTestingVoice(true);
                        speakLotteryResult({
                          gameName: "Lotto Activo",
                          drawTime: "10:00:00",
                          animalNumber: 4,
                          animalName: "Alacrán",
                          animalLabel: "04",
                          settings: {
                            ...voiceSettings,
                            enabled: true,
                            engine: "online_hd",
                            rate: activeVoiceRate || 1.0,
                            playChime: activeVoiceChime ?? true,
                          },
                          onEnd: () => setTestingVoice(false),
                        });
                      }}
                      className="px-2.5 py-1 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-[11px] font-bold flex items-center gap-1 transition cursor-pointer"
                    >
                      <Play className="w-3 h-3 fill-current" /> Probar
                    </button>
                  </div>
                  <p className="text-[11px] text-slate-400 pl-6">
                    Canta: &ldquo;¡Atención! Resultado de Lotto Activo, sorteo de las 10... Ganador:
                    número 4, ¡Alacrán!&rdquo;
                  </p>
                </div>

                <div
                  onClick={() => updateActiveVoice({ engine: "browser" })}
                  className={`p-3 rounded-xl border cursor-pointer transition flex flex-col gap-1 ${
                    activeVoiceEngine === "browser"
                      ? "bg-purple-600/20 border-purple-500 ring-1 ring-purple-500 text-white"
                      : "bg-slate-950/60 border-slate-800 hover:bg-slate-850 text-slate-300"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Radio
                        className={`w-4 h-4 ${activeVoiceEngine === "browser" ? "text-purple-400" : "text-slate-500"}`}
                      />
                      <span className="font-bold text-xs text-white">
                        3. Voz Nativa del Dispositivo / Smart TV (Sin Internet)
                      </span>
                    </div>
                    <button
                      type="button"
                      disabled={testingVoice}
                      onClick={(e) => {
                        e.stopPropagation();
                        ensureAudioUnlocked();
                        stopAllAudio();
                        updateActiveVoice({ engine: "browser" });
                        setTestingVoice(true);
                        speakLotteryResult({
                          gameName: "Lotto Activo",
                          drawTime: "10:00:00",
                          animalNumber: 4,
                          animalName: "Alacrán",
                          animalLabel: "04",
                          settings: {
                            ...voiceSettings,
                            enabled: true,
                            engine: "browser",
                            rate: activeVoiceRate || 1.0,
                            playChime: activeVoiceChime ?? true,
                          },
                          onEnd: () => setTestingVoice(false),
                        });
                      }}
                      className="px-2.5 py-1 rounded-lg bg-purple-600 hover:bg-purple-500 text-white text-[11px] font-bold flex items-center gap-1 transition cursor-pointer"
                    >
                      <Play className="w-3 h-3 fill-current" /> Probar
                    </button>
                  </div>
                  <p className="text-[11px] text-slate-400 pl-6">
                    Usa el motor SpeechSynthesis integrado en el navegador o televisor con respaldo
                    automático HD.
                  </p>
                </div>
              </div>

              {/* Audio Diagnostic Status Box */}
              <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-3 flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-2 text-[11px] text-slate-300">
                  <ShieldAlert className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>
                    Motor de Audio Auto-Recuperable activo ({spanishVoicesCount} voces ES /{" "}
                    {voicesCount} totales + Respaldo HD en línea).
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    ensureAudioUnlocked();
                    stopAllAudio();
                    setTestingVoice(true);
                    speakLotteryResult({
                      gameName: "Lotto Activo",
                      drawTime: "10:00:00",
                      animalNumber: 4,
                      animalName: "Alacrán",
                      animalLabel: "04",
                      settings: {
                        ...voiceSettings,
                        enabled: true,
                        engine: activeVoiceEngine,
                        rate: activeVoiceRate || 1.0,
                        playChime: true,
                      },
                      onEnd: () => setTestingVoice(false),
                    });
                  }}
                  className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-emerald-300 text-[11px] font-semibold transition cursor-pointer"
                >
                  Diagnosticar Sonido Ahora
                </button>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
