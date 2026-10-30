import { useEffect, useState, useRef, useCallback } from "react";
import { Volume2, VolumeX, X, Clock, Trophy, ChevronRight, RotateCcw, Sliders } from "lucide-react";
import { speakLotteryResult, stopAllAudio } from "@/lib/lottery-audio";
import { getEmojiForNumber } from "@/lib/animals";
import VoiceSettingsModal from "@/components/VoiceSettingsModal";
import AnimalMedia from "@/components/AnimalMedia";

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
  autoCloseSeconds = 8,
}: ResultAlertModalProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [timeLeft, setTimeLeft] = useState(autoCloseSeconds);
  const [isPaused, setIsPaused] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const currentAlert: ResultAlertItem | undefined = alerts[currentIndex];
  const hasMultiple = alerts.length > 1;
  const [showVoiceSettings, setShowVoiceSettings] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);

  // Reset image error state whenever the displayed alert changes
  useEffect(() => {
    setImageFailed(false);
  }, [currentAlert?.id, currentAlert?.animalImageUrl]);

  // Function to synthesize speech in Spanish using natural voice
  const speakCurrent = useCallback(
    (alert: ResultAlertItem) => {
      if (!voiceEnabled) return;

      speakLotteryResult({
        gameName: alert.gameName,
        drawTime: alert.drawTime,
        animalNumber: alert.animalNumber,
        animalName: alert.animalName,
        animalLabel: alert.animalLabel,
        onStart: () => setIsSpeaking(true),
        onEnd: () => setIsSpeaking(false),
      });
    },
    [voiceEnabled],
  );

  // When currentAlert changes, reset timer and speak
  useEffect(() => {
    if (!currentAlert) return;

    setTimeLeft(autoCloseSeconds);
    speakCurrent(currentAlert);

    return () => {
      stopAllAudio();
    };
  }, [currentAlert, autoCloseSeconds, speakCurrent]);

  const handleClose = useCallback(() => {
    stopAllAudio();
    if (timerRef.current) clearInterval(timerRef.current);
    onClose();
  }, [onClose]);

  // Countdown timer to return automatically to normal board
  useEffect(() => {
    if (isPaused || !currentAlert) return;

    timerRef.current = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          // If there are more items in queue, advance; otherwise close and return to normal
          if (currentIndex < alerts.length - 1) {
            setCurrentIndex((i) => i + 1);
            return autoCloseSeconds;
          } else {
            handleClose();
            return 0;
          }
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [currentIndex, alerts.length, isPaused, currentAlert, autoCloseSeconds, handleClose]);

  const handleNext = () => {
    if (currentIndex < alerts.length - 1) {
      setCurrentIndex((i) => i + 1);
    } else {
      handleClose();
    }
  };

  const handleReplayVoice = () => {
    if (currentAlert) {
      speakCurrent(currentAlert);
    }
  };

  if (!currentAlert) return null;

  const displayLabel =
    currentAlert.animalLabel ?? String(currentAlert.animalNumber).padStart(2, "0");
  const brandColor = currentAlert.gameColor || "#3b82f6";
  const progressPercent = Math.max(0, Math.min(100, (timeLeft / autoCloseSeconds) * 100));

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-slate-950/85 backdrop-blur-md transition-opacity duration-300 animate-in fade-in"
      role="dialog"
      aria-modal="true"
      aria-label={`Nuevo resultado de ${currentAlert.gameName}`}
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
    >
      <div
        className="relative w-full max-w-xl rounded-2xl overflow-hidden bg-slate-900 border-2 shadow-2xl transition-all transform animate-in zoom-in-95 duration-200"
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
                    ({currentIndex + 1} de {alerts.length})
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
          <div className="text-xs text-slate-500 hidden sm:block">
            {isPaused ? "Pausa (pasa el cursor para ver detalles)" : "Cierre automático activo"}
          </div>

          <div className="flex items-center gap-3 w-full sm:w-auto justify-end">
            {hasMultiple && currentIndex < alerts.length - 1 && (
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
