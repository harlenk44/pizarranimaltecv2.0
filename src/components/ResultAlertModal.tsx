import { useEffect, useState, useRef, useCallback, useMemo } from "react";
import { Volume2, VolumeX, X, Clock, Trophy, ChevronRight, RotateCcw, Sliders } from "lucide-react";
import { speakLotteryResult, stopAllAudio, loadVoiceSettings } from "@/lib/lottery-audio";
import { getEmojiForNumber } from "@/lib/animals";
import VoiceSettingsModal from "@/components/VoiceSettingsModal";
import AnimalMedia from "@/components/AnimalMedia";
import { getSorteoAlertKey, sorteoAlertTracker } from "@/lib/sorteo-alert-tracker";
import { useLicenseContext } from "@/components/LicenseGate";
import { useBoardSettings } from "@/context/BoardSettingsContext";
import { getGameLogo } from "@/lib/game-logos";
import {
  getGameNeonColor,
  getNeonLogoRingStyle,
  getNeonTitleStyle,
  type BoardCardVisualStyle,
} from "@/lib/neon-flex";

export interface ResultAlertItem {
  id: string;
  gameId: string;
  gameName: string;
  gameColor: string;
  gameLogoUrl?: string | null;
  drawDate: string;
  drawTime: string;
  animalNumber: number;
  animalName: string;
  animalLabel?: string;
  animalImageUrl?: string | null;
  animalEmoji?: string;
}

interface ResultAlertModalProps {
  /** The current alert or queue of alerts to display */
  alerts: ResultAlertItem[];
  /** Callback fired when an alert is dismissed or queue finishes */
  onClose: () => void;
  /** Whether speech synthesis is enabled */
  voiceEnabled?: boolean;
  /** Toggle speech setting */
  onToggleVoice?: (enabled: boolean) => void;
  /** Auto-close countdown in seconds (default 8s) */
  autoCloseSeconds?: number;
}

/** Formats 24h or HH:mm time string to a conversational Spanish phrase for voice synthesis */
function formatTimeForSpeech(timeStr: string): string {
  if (!timeStr) return "";
  const parts = timeStr.split(":");
  const hour = parseInt(parts[0] ?? "0", 10);
  const minutes = parseInt(parts[1] ?? "0", 10);

  let period = "de la mañana";
  if (hour === 12) {
    period = "del mediodía";
  } else if (hour > 12 && hour < 19) {
    period = "de la tarde";
  } else if (hour >= 19) {
    period = "de la noche";
  }

  const displayHour = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
  const hourWord = displayHour === 1 ? "la una" : `las ${displayHour}`;
  const minuteWord = minutes === 0 ? "" : ` y ${minutes}`;

  return `${hourWord}${minuteWord} ${period}`;
}

/** Formats time for visually displaying on screen (e.g. 10:00 AM) */
function formatDisplayTime(timeStr: string): string {
  if (!timeStr) return "";
  const [h, m] = timeStr.split(":");
  const hour = parseInt(h ?? "0", 10);
  const ampm = hour >= 12 ? "PM" : "AM";
  const displayHour = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
  return `${displayHour}:${m} ${ampm}`;
}

export default function ResultAlertModal({
  alerts,
  onClose,
  voiceEnabled = true,
  onToggleVoice,
  autoCloseSeconds = 20,
}: ResultAlertModalProps) {
  // Deduplicate alerts by canonical sorteo key to ensure each draw is presented only once
  const uniqueAlerts = useMemo(() => {
    const seen = new Set<string>();
    const list: ResultAlertItem[] = [];
    for (const a of alerts) {
      const key = getSorteoAlertKey(a);
      if (!seen.has(key)) {
        seen.add(key);
        list.push(a);
      }
    }
    return list;
  }, [alerts]);

  const effectiveDuration = Math.max(1, autoCloseSeconds || 20);

  const [currentIndex, setCurrentIndex] = useState(0);
  const [timeLeft, setTimeLeft] = useState(effectiveDuration);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [showVoiceSettings, setShowVoiceSettings] = useState(false);

  // Stable refs to prevent timer re-triggers on parent 5s polling re-renders
  const uniqueAlertsRef = useRef(uniqueAlerts);
  uniqueAlertsRef.current = uniqueAlerts;

  const currentIndexRef = useRef(currentIndex);
  currentIndexRef.current = currentIndex;

  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const voiceEnabledRef = useRef(voiceEnabled);
  voiceEnabledRef.current = voiceEnabled;

  const isSpeakingRef = useRef(false);
  const timerExpiredRef = useRef(false);
  const postSpeechTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const currentAlert: ResultAlertItem | undefined = uniqueAlerts[currentIndex];
  const currentAlertRef = useRef(currentAlert);
  currentAlertRef.current = currentAlert;

  // Canonical string key for the active alert so object reference changes never restart the effect
  const currentAlertKey = currentAlert ? getSorteoAlertKey(currentAlert) : null;
  const hasMultiple = uniqueAlerts.length > 1;

  // Mark currently shown alert as already alerted in the global tracker
  useEffect(() => {
    const active = currentAlertRef.current;
    if (active) {
      sorteoAlertTracker.markAsAlerted(active);
    }
  }, [currentAlertKey]);

  const handleClose = useCallback(() => {
    if (postSpeechTimeoutRef.current) clearTimeout(postSpeechTimeoutRef.current);
    stopAllAudio();
    isSpeakingRef.current = false;
    for (const item of uniqueAlertsRef.current) {
      sorteoAlertTracker.markAsAlerted(item);
    }
    onCloseRef.current();
  }, []);

  const proceedToNextOrClose = useCallback(() => {
    if (postSpeechTimeoutRef.current) clearTimeout(postSpeechTimeoutRef.current);
    const latestUnique = uniqueAlertsRef.current;
    if (currentIndexRef.current < latestUnique.length - 1) {
      setCurrentIndex((i) => i + 1);
    } else {
      handleClose();
    }
  }, [handleClose]);

  const proceedRef = useRef(proceedToNextOrClose);
  proceedRef.current = proceedToNextOrClose;

  const { voiceConfig, designConfig } = useLicenseContext();
  const voiceConfigRef = useRef(voiceConfig);
  voiceConfigRef.current = voiceConfig;

  const boardSettingsContext = useBoardSettings();
  const settings = boardSettingsContext?.settings;

  // Function to synthesize speech in Spanish using natural voice
  const speakCurrent = useCallback((alert: ResultAlertItem) => {
    const pinVoice = voiceConfigRef.current;
    const isAllowedByPin = pinVoice ? pinVoice.enabled : true;
    if (!voiceEnabledRef.current || !isAllowedByPin) {
      isSpeakingRef.current = false;
      setIsSpeaking(false);
      return;
    }

    isSpeakingRef.current = true;
    setIsSpeaking(true);

    const localSettings = loadVoiceSettings();
    const effectiveVoiceSettings = pinVoice
      ? {
          ...localSettings,
          engine: pinVoice.engine,
          rate: pinVoice.rate,
          playChime: pinVoice.playChime,
        }
      : localSettings;

    speakLotteryResult({
      gameName: alert.gameName,
      drawTime: alert.drawTime,
      animalNumber: alert.animalNumber,
      animalName: alert.animalName,
      animalLabel: alert.animalLabel,
      settings: effectiveVoiceSettings,
      onStart: () => {
        isSpeakingRef.current = true;
        setIsSpeaking(true);
      },
      onEnd: () => {
        isSpeakingRef.current = false;
        setIsSpeaking(false);
        // Only close after speech if the full configured timer duration has also expired
        if (timerExpiredRef.current) {
          if (postSpeechTimeoutRef.current) clearTimeout(postSpeechTimeoutRef.current);
          postSpeechTimeoutRef.current = setTimeout(() => {
            proceedRef.current();
          }, 1500);
        }
      },
    });
  }, []);

  const speakCurrentRef = useRef(speakCurrent);
  speakCurrentRef.current = speakCurrent;

  const handleNext = useCallback(() => {
    proceedToNextOrClose();
  }, [proceedToNextOrClose]);

  // TV remote and keyboard dismissal (Escape, Space, Enter, Backspace)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" || e.key === "Enter" || e.key === " " || e.key === "Backspace") {
        e.preventDefault();
        handleClose();
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        handleNext();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleClose, handleNext]);

  // Authoritative auto-close timer keyed strictly on canonical currentAlertKey & effectiveDuration
  useEffect(() => {
    const alertToAnnounce = currentAlertRef.current;
    if (!currentAlertKey || !alertToAnnounce) {
      onCloseRef.current();
      return;
    }

    timerExpiredRef.current = false;
    if (postSpeechTimeoutRef.current) clearTimeout(postSpeechTimeoutRef.current);

    const durationSec = effectiveDuration;
    const durationMs = durationSec * 1000;
    const endTime = Date.now() + durationMs;

    setTimeLeft(durationSec);
    speakCurrentRef.current(alertToAnnounce);

    // Visual countdown ticker updates every 250ms based on actual clock
    const tickInterval = setInterval(() => {
      const remaining = Math.max(0, Math.ceil((endTime - Date.now()) / 1000));
      setTimeLeft(remaining);
    }, 250);

    // Explicit setTimeout: once full duration completes, only close if voice has also finished
    const closeTimeout = setTimeout(() => {
      clearInterval(tickInterval);
      setTimeLeft(0);
      timerExpiredRef.current = true;

      // If voice is still speaking, do NOT close or cut off audio!
      // Let speech complete; onEnd callback will trigger close after speech ends
      if (!voiceEnabledRef.current || !isSpeakingRef.current) {
        proceedRef.current();
      }
    }, durationMs);

    return () => {
      clearTimeout(closeTimeout);
      clearInterval(tickInterval);
      if (postSpeechTimeoutRef.current) clearTimeout(postSpeechTimeoutRef.current);
      stopAllAudio();
    };
  }, [currentAlertKey, currentIndex, effectiveDuration]);

  const handleReplayVoice = () => {
    if (currentAlert) {
      speakCurrent(currentAlert);
    }
  };

  if (!currentAlert) return null;

  const customColorMap = designConfig?.useCustomDesign
    ? designConfig.game_colors
    : designConfig?.game_colors || settings?.game_colors;

  const styleMode: BoardCardVisualStyle =
    (designConfig?.useCustomDesign
      ? designConfig.card_style
      : designConfig?.card_style || settings?.card_style) === "solid"
      ? "solid"
      : "neon";

  const brandColor = getGameNeonColor(
    currentAlert.gameId || currentAlert.gameName,
    currentAlert.gameColor || "#00FF66",
    customColorMap,
  );

  const displayLabel =
    currentAlert.animalLabel ?? String(currentAlert.animalNumber).padStart(2, "0");
  const progressPercent = Math.max(0, Math.min(100, (timeLeft / effectiveDuration) * 100));

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-slate-950/85 backdrop-blur-md transition-opacity duration-300 animate-in fade-in cursor-pointer select-none"
      role="dialog"
      aria-modal="true"
      aria-label={`Nuevo resultado de ${currentAlert.gameName}`}
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          handleClose();
        }
      }}
    >
      <div
        className="relative w-full max-w-xl rounded-3xl overflow-hidden transition-all transform animate-in zoom-in-95 duration-200 cursor-default"
        onClick={(e) => e.stopPropagation()}
        style={
          styleMode === "solid"
            ? {
                backgroundColor: "#0b1220",
                border: `2.5px solid ${brandColor}`,
                boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.85)",
              }
            : {
                backgroundColor: "#070b14",
                border: `3px solid ${brandColor}`,
                boxShadow: `0 0 16px ${brandColor}99, 0 0 38px ${brandColor}4d, 0 0 80px ${brandColor}22, inset 0 0 16px ${brandColor}18, 0 30px 70px -15px rgba(0, 0, 0, 0.95)`,
              }
        }
      >
        {/* Top auto-close progress bar */}
        <div className="h-2 w-full bg-slate-950 overflow-hidden">
          <div
            className="h-full transition-all duration-1000 ease-linear"
            style={{
              width: `${progressPercent}%`,
              backgroundColor: brandColor,
              boxShadow: styleMode === "neon" ? `0 0 10px ${brandColor}, 0 0 4px #ffffff` : "none",
            }}
          />
        </div>

        {/* Header bar with Game title and Quick controls */}
        <div
          className="px-6 py-4 flex items-center justify-between border-b"
          style={{
            backgroundColor: `${brandColor}1c`,
            borderColor: styleMode === "neon" ? `${brandColor}40` : "rgba(51, 65, 85, 0.5)",
          }}
        >
          <div className="flex items-center gap-3.5">
            <div
              className="w-12 h-12 rounded-xl p-1 bg-slate-950/80 flex items-center justify-center shrink-0 overflow-hidden"
              style={getNeonLogoRingStyle(brandColor, styleMode)}
            >
              <img
                src={getGameLogo(
                  {
                    id: currentAlert.gameId,
                    name: currentAlert.gameName,
                    logo_url: currentAlert.gameLogoUrl,
                  },
                  brandColor,
                )}
                alt={currentAlert.gameName}
                loading="lazy"
                decoding="async"
                onError={(e) => {
                  e.currentTarget.src = getGameLogo(currentAlert.gameName, brandColor);
                }}
                className="w-full h-full object-contain"
              />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span
                  className="text-[11px] font-black tracking-wider uppercase px-2.5 py-0.5 rounded-full"
                  style={
                    styleMode === "neon"
                      ? {
                          backgroundColor: `${brandColor}26`,
                          color: "#ffffff",
                          border: `1.5px solid ${brandColor}99`,
                          boxShadow: `0 0 10px ${brandColor}66`,
                          textShadow: `0 0 8px ${brandColor}`,
                        }
                      : {
                          backgroundColor: `${brandColor}22`,
                          color: brandColor,
                          border: `1.5px solid ${brandColor}80`,
                        }
                  }
                >
                  ¡Sorteo Confirmado!
                </span>
                {hasMultiple && (
                  <span className="text-xs text-slate-400 font-mono font-bold">
                    ({currentIndex + 1} de {uniqueAlerts.length})
                  </span>
                )}
              </div>
              <h2
                className="text-xl sm:text-2xl font-black tracking-wide uppercase mt-0.5"
                style={getNeonTitleStyle(brandColor, styleMode)}
              >
                {currentAlert.gameName}
              </h2>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            {onToggleVoice && (
              <button
                type="button"
                onClick={() => onToggleVoice(!voiceEnabled)}
                className={`p-2 rounded-xl border transition ${
                  voiceEnabled
                    ? "text-white"
                    : "bg-slate-800/80 border-slate-700 text-slate-400 hover:bg-slate-700"
                }`}
                style={
                  voiceEnabled
                    ? styleMode === "neon"
                      ? {
                          backgroundColor: `${brandColor}33`,
                          borderColor: `${brandColor}88`,
                          boxShadow: `0 0 12px ${brandColor}66`,
                          color: "#ffffff",
                        }
                      : {
                          backgroundColor: brandColor,
                          borderColor: brandColor,
                          color: "#ffffff",
                        }
                    : undefined
                }
                title={voiceEnabled ? "Desactivar voz" : "Activar voz"}
              >
                {voiceEnabled ? (
                  <Volume2 className="w-4.5 h-4.5" />
                ) : (
                  <VolumeX className="w-4.5 h-4.5" />
                )}
              </button>
            )}
            <button
              type="button"
              onClick={() => setShowVoiceSettings(true)}
              className="p-2 rounded-xl border border-slate-700 bg-slate-800/80 text-slate-300 hover:bg-slate-700 hover:text-white transition"
              title="Configurar voz natural (seleccionar voz humana y tono)"
            >
              <Sliders className="w-4.5 h-4.5 text-amber-400" />
            </button>
            <button
              type="button"
              onClick={handleReplayVoice}
              className={`p-2 rounded-xl border border-slate-700 bg-slate-800/80 text-slate-300 hover:bg-slate-700 transition ${
                isSpeaking ? "animate-pulse" : ""
              }`}
              style={
                isSpeaking && styleMode === "neon"
                  ? {
                      borderColor: brandColor,
                      boxShadow: `0 0 14px ${brandColor}`,
                      color: "#ffffff",
                    }
                  : undefined
              }
              title="Escuchar de nuevo"
            >
              <RotateCcw className="w-4.5 h-4.5" />
            </button>
            <button
              type="button"
              onClick={handleClose}
              className="p-2 rounded-xl border border-slate-700 bg-slate-800/80 hover:bg-slate-700 text-slate-300 transition"
              title="Volver a la pizarra"
            >
              <X className="w-4.5 h-4.5" />
            </button>
          </div>
        </div>

        {/* Content body */}
        <div className="p-6 sm:p-8 text-center flex flex-col items-center">
          {/* Draw Time */}
          <div
            className="inline-flex items-center gap-2 px-5 py-2 rounded-full font-medium text-sm sm:text-base mb-6 backdrop-blur-sm"
            style={{
              backgroundColor: "rgba(15, 23, 42, 0.8)",
              border: `1.5px solid ${styleMode === "neon" ? `${brandColor}66` : "rgba(51, 65, 85, 0.8)"}`,
              boxShadow: styleMode === "neon" ? `0 0 14px ${brandColor}30` : "none",
            }}
          >
            <Clock className="w-4.5 h-4.5 text-amber-400" />
            <span className="text-slate-300">Sorteo de las</span>
            <span className="font-extrabold text-white font-mono tracking-tight text-base sm:text-lg">
              {formatDisplayTime(currentAlert.drawTime)}
            </span>
          </div>

          {/* Winning Animal Display (Image / Video / Emoji + Big Number) */}
          <div className="relative mb-6 flex flex-col items-center">
            <div
              className="relative w-48 h-48 sm:w-56 sm:h-56 rounded-3xl p-4 flex items-center justify-center overflow-hidden"
              style={
                styleMode === "neon"
                  ? {
                      backgroundColor: "rgba(3, 7, 18, 0.85)",
                      border: `3px solid ${brandColor}`,
                      boxShadow: `0 0 24px ${brandColor}77, inset 0 0 20px ${brandColor}26, 0 20px 40px rgba(0, 0, 0, 0.85)`,
                    }
                  : {
                      backgroundColor: "rgba(10, 15, 29, 0.95)",
                      border: `2.5px solid ${brandColor}`,
                      boxShadow: "0 15px 35px rgba(0, 0, 0, 0.65)",
                    }
              }
            >
              <AnimalMedia
                mediaUrl={currentAlert.animalImageUrl}
                name={currentAlert.animalName}
                number={currentAlert.animalNumber}
                className="w-full h-full object-contain filter drop-shadow-2xl"
                emojiClassName="text-8xl sm:text-9xl select-none"
              />
            </div>

            {/* Winning Number Badge Floating Over the Animal */}
            <div
              className="absolute -bottom-5 px-7 py-2 rounded-2xl text-2xl sm:text-4xl font-black font-mono tracking-tight z-10"
              style={
                styleMode === "neon"
                  ? {
                      backgroundColor: brandColor,
                      color: "#ffffff",
                      border: "3px solid #070b14",
                      boxShadow: `0 0 22px ${brandColor}dd, 0 0 40px ${brandColor}66, 0 10px 25px rgba(0, 0, 0, 0.8)`,
                      textShadow: "0 2px 4px rgba(0, 0, 0, 0.7)",
                    }
                  : {
                      backgroundColor: brandColor,
                      color: "#ffffff",
                      border: "2.5px solid #0b1220",
                      boxShadow: "0 6px 18px rgba(0, 0, 0, 0.6)",
                    }
              }
            >
              {displayLabel}
            </div>
          </div>

          {/* Animal Name */}
          <h3
            className="text-3xl sm:text-5xl font-black tracking-tight text-white uppercase mt-6 mb-2 text-center"
            style={
              styleMode === "neon"
                ? {
                    textShadow: `0 0 20px ${brandColor}aa, 0 2px 6px rgba(0, 0, 0, 0.9)`,
                  }
                : {
                    textShadow: "0 2px 4px rgba(0, 0, 0, 0.7)",
                  }
            }
          >
            {currentAlert.animalName}
          </h3>

          {/* Voice speaking indicator */}
          <div className="h-7 flex items-center justify-center gap-2 text-xs sm:text-sm text-slate-400">
            {isSpeaking ? (
              <>
                <Volume2
                  className="w-4 h-4 animate-bounce"
                  style={{ color: styleMode === "neon" ? brandColor : "#60a5fa" }}
                />
                <span
                  className="font-bold tracking-wide"
                  style={{
                    color: styleMode === "neon" ? brandColor : "#60a5fa",
                    textShadow: styleMode === "neon" ? `0 0 8px ${brandColor}80` : "none",
                  }}
                >
                  Dictando resultado en voz alta...
                </span>
              </>
            ) : (
              <span className="text-slate-400 font-medium">
                Regresando a la pizarra en{" "}
                <span className="text-white font-extrabold font-mono text-sm sm:text-base">
                  {timeLeft}s
                </span>
              </span>
            )}
          </div>
        </div>

        {/* Modal Footer with Actions */}
        <div className="px-6 py-4 bg-slate-950/80 border-t border-slate-800/80 flex items-center justify-between gap-3">
          <div className="text-xs text-slate-400 hidden sm:flex items-center gap-2">
            <span
              className="w-2 h-2 rounded-full animate-pulse"
              style={{
                backgroundColor: brandColor,
                boxShadow: styleMode === "neon" ? `0 0 8px ${brandColor}` : "none",
              }}
            />
            <span>
              {isSpeaking ? (
                <span
                  className="font-semibold"
                  style={{ color: styleMode === "neon" ? brandColor : "#60a5fa" }}
                >
                  Dictando resultado en voz alta...
                </span>
              ) : (
                <>
                  Volviendo a la pizarra en{" "}
                  <strong className="text-white font-mono text-sm">{timeLeft}s</strong>
                </>
              )}
            </span>
          </div>

          <div className="flex items-center gap-3 w-full sm:w-auto justify-end">
            {hasMultiple && currentIndex < uniqueAlerts.length - 1 && (
              <button
                type="button"
                onClick={handleNext}
                className="flex-1 sm:flex-initial px-4 py-2.5 rounded-xl bg-slate-800/90 hover:bg-slate-700 text-slate-200 text-sm font-bold flex items-center justify-center gap-2 border border-slate-700 transition"
              >
                <span>Siguiente</span>
                <ChevronRight className="w-4 h-4" />
              </button>
            )}
            <button
              type="button"
              onClick={handleClose}
              className="flex-1 sm:flex-initial px-6 py-2.5 rounded-xl font-black text-sm uppercase tracking-wider text-white transition transform active:scale-95 flex items-center justify-center gap-2"
              style={
                styleMode === "neon"
                  ? {
                      backgroundColor: brandColor,
                      boxShadow: `0 0 18px ${brandColor}88, 0 4px 14px rgba(0, 0, 0, 0.5)`,
                      textShadow: "0 1px 3px rgba(0, 0, 0, 0.5)",
                    }
                  : {
                      backgroundColor: brandColor,
                      boxShadow: "0 4px 14px rgba(0, 0, 0, 0.4)",
                    }
              }
            >
              Volver a la pizarra
            </button>
          </div>
        </div>
      </div>

      {/* Voice configuration modal */}
      <VoiceSettingsModal
        isOpen={showVoiceSettings}
        onClose={() => setShowVoiceSettings(false)}
        onSettingsChanged={() => {
          if (currentAlert) speakCurrent(currentAlert);
        }}
      />
    </div>
  );
}
