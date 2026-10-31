import { useEffect, useState, useRef, useCallback, useMemo } from "react";
import { Volume2, VolumeX, X, Clock, Trophy, ChevronRight, RotateCcw, Sliders } from "lucide-react";
import { speakLotteryResult, stopAllAudio } from "@/lib/lottery-audio";
import { getEmojiForNumber } from "@/lib/animals";
import VoiceSettingsModal from "@/components/VoiceSettingsModal";
import AnimalMedia from "@/components/AnimalMedia";
import { getSorteoAlertKey, sorteoAlertTracker } from "@/lib/sorteo-alert-tracker";

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

  // Function to synthesize speech in Spanish using natural voice
  const speakCurrent = useCallback((alert: ResultAlertItem) => {
    if (!voiceEnabledRef.current) {
      isSpeakingRef.current = false;
      setIsSpeaking(false);
      return;
    }

    isSpeakingRef.current = true;
    setIsSpeaking(true);

    speakLotteryResult({
      gameName: alert.gameName,
      drawTime: alert.drawTime,
      animalNumber: alert.animalNumber,
      animalName: alert.animalName,
      animalLabel: alert.animalLabel,
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

  const displayLabel =
    currentAlert.animalLabel ?? String(currentAlert.animalNumber).padStart(2, "0");
  const brandColor = currentAlert.gameColor || "#3b82f6";
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
        className="relative w-full max-w-xl rounded-2xl overflow-hidden bg-slate-900 border-2 shadow-2xl transition-all transform animate-in zoom-in-95 duration-200 cursor-default"
        onClick={(e) => e.stopPropagation()}
        style={{
          borderColor: brandColor,
          boxShadow: `0 0 50px -10px ${brandColor}50, 0 25px 50px -12px rgba(0, 0, 0, 0.7)`,
        }}
      >
        {/* Top auto-close progress bar */}
        <div className="h-1.5 w-full bg-slate-800 overflow-hidden">
          <div
            className="h-full transition-all duration-1000 ease-linear"
            style={{
              width: `${progressPercent}%`,
              backgroundColor: brandColor,
            }}
          />
        </div>

        {/* Header bar with Game title and Quick controls */}
        <div
          className="px-6 py-4 flex items-center justify-between border-b border-slate-800"
          style={{ backgroundColor: `${brandColor}18` }}
        >
          <div className="flex items-center gap-3">
            {currentAlert.gameLogoUrl ? (
              <img
                src={currentAlert.gameLogoUrl}
                alt={currentAlert.gameName}
                className="w-10 h-10 object-contain rounded-lg bg-slate-950/40 p-1 border border-slate-800"
              />
            ) : (
              <div
                className="w-10 h-10 rounded-lg flex items-center justify-center text-xl font-bold shadow-sm"
                style={{ backgroundColor: brandColor, color: "#fff" }}
              >
                <Trophy className="w-5 h-5" />
              </div>
            )}
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-semibold tracking-wider uppercase px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                  ¡Sorteo Confirmado!
                </span>
                {hasMultiple && (
                  <span className="text-xs text-slate-400 font-mono">
                    ({currentIndex + 1} de {uniqueAlerts.length})
                  </span>
                )}
              </div>
              <h2 className="text-lg sm:text-xl font-black text-white tracking-wide uppercase mt-0.5">
                {currentAlert.gameName}
              </h2>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            {onToggleVoice && (
              <button
                type="button"
                onClick={() => onToggleVoice(!voiceEnabled)}
                className={`p-2 rounded-lg border transition ${
                  voiceEnabled
                    ? "bg-blue-600/20 border-blue-500/40 text-blue-400 hover:bg-blue-600/30"
                    : "bg-slate-800 border-slate-700 text-slate-400 hover:bg-slate-700"
                }`}
                title={voiceEnabled ? "Desactivar voz" : "Activar voz"}
              >
                {voiceEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
              </button>
            )}
            <button
              type="button"
              onClick={() => setShowVoiceSettings(true)}
              className="p-2 rounded-lg border border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white transition"
              title="Configurar voz natural (seleccionar voz humana y tono)"
            >
              <Sliders className="w-4 h-4 text-amber-400" />
            </button>
            <button
              type="button"
              onClick={handleReplayVoice}
              className={`p-2 rounded-lg border border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700 transition ${
                isSpeaking ? "animate-pulse ring-2 ring-blue-500" : ""
              }`}
              title="Escuchar de nuevo"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={handleClose}
              className="p-2 rounded-lg border border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
              title="Volver a la pizarra"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Content body */}
        <div className="p-6 sm:p-8 text-center flex flex-col items-center">
          {/* Draw Time */}
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-slate-800/80 border border-slate-700 text-slate-300 font-medium text-sm sm:text-base mb-6">
            <Clock className="w-4 h-4 text-amber-400" />
            <span>Sorteo de las</span>
            <span className="font-bold text-white font-mono">
              {formatDisplayTime(currentAlert.drawTime)}
            </span>
          </div>

          {/* Winning Animal Display (Image / Video / Emoji + Big Number) */}
          <div className="relative mb-5 flex flex-col items-center">
            <div
              className="relative w-44 h-44 sm:w-52 sm:h-52 rounded-2xl p-3 bg-slate-950/80 border-2 flex items-center justify-center overflow-hidden shadow-2xl"
              style={{ borderColor: `${brandColor}80` }}
            >
              <AnimalMedia
                mediaUrl={currentAlert.animalImageUrl}
                name={currentAlert.animalName}
                number={currentAlert.animalNumber}
                className="w-full h-full object-contain filter drop-shadow-lg"
                emojiClassName="text-7xl sm:text-8xl select-none"
              />
            </div>

            {/* Winning Number Badge Floating Over the Animal */}
            <div
              className="absolute -bottom-4 px-6 py-1.5 rounded-xl text-2xl sm:text-3xl font-black font-mono tracking-tight shadow-xl border-2 border-slate-900"
              style={{
                backgroundColor: brandColor,
                color: "#ffffff",
                boxShadow: `0 8px 20px -4px ${brandColor}80`,
              }}
            >
              {displayLabel}
            </div>
          </div>

          {/* Animal Name */}
          <h3 className="text-3xl sm:text-4xl font-black tracking-tight text-white uppercase mt-4 mb-2 drop-shadow">
            {currentAlert.animalName}
          </h3>

          {/* Voice speaking indicator */}
          <div className="h-6 flex items-center justify-center gap-1.5 text-xs text-slate-400">
            {isSpeaking ? (
              <>
                <Volume2 className="w-3.5 h-3.5 text-blue-400 animate-bounce" />
                <span className="text-blue-400 font-medium">Dictando resultado en voz alta...</span>
              </>
            ) : (
              <span className="text-slate-500">
                Regresando a la pizarra en{" "}
                <span className="text-slate-300 font-bold font-mono">{timeLeft}s</span>
              </span>
            )}
          </div>
        </div>

        {/* Modal Footer with Actions */}
        <div className="px-6 py-4 bg-slate-950/70 border-t border-slate-800 flex items-center justify-between gap-3">
          <div className="text-xs text-slate-400 hidden sm:flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span>
              {isSpeaking ? (
                <span className="text-blue-400 font-medium">Dictando resultado en voz alta...</span>
              ) : (
                <>
                  Volviendo a la pizarra en{" "}
                  <strong className="text-white font-mono">{timeLeft}s</strong>
                </>
              )}
            </span>
          </div>

          <div className="flex items-center gap-3 w-full sm:w-auto justify-end">
            {hasMultiple && currentIndex < uniqueAlerts.length - 1 && (
              <button
                type="button"
                onClick={handleNext}
                className="flex-1 sm:flex-initial px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm font-semibold flex items-center justify-center gap-2 border border-slate-700 transition"
              >
                <span>Siguiente</span>
                <ChevronRight className="w-4 h-4" />
              </button>
            )}
            <button
              type="button"
              onClick={handleClose}
              className="flex-1 sm:flex-initial px-5 py-2.5 rounded-xl font-bold text-sm text-white transition shadow-lg flex items-center justify-center gap-2"
              style={{
                backgroundColor: brandColor,
                boxShadow: `0 4px 14px 0 ${brandColor}40`,
              }}
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
