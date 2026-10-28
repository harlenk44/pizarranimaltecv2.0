/**
 * Audio and Speech Synthesis helper for Venezuelan Lottery Boards.
 * Optimizes natural Spanish pronunciation, intonation, and voice selection.
 * Includes HD Natural Spanish streaming to guarantee human-sounding Spanish
 * even on devices without local Spanish voice packages installed.
 */

export type VoiceEngine = "online_hd" | "browser";

export interface VoiceSettings {
  engine: VoiceEngine;
  voiceUri: string;
  rate: number; // 0.8 - 1.2
  pitch: number; // 0.8 - 1.2
  playChime: boolean;
}

const STORAGE_KEY_VOICE = "lottery_voice_settings";

export const DEFAULT_VOICE_SETTINGS: VoiceSettings = {
  engine: "online_hd", // Default to HD natural Spanish stream
  voiceUri: "",
  rate: 0.95,
  pitch: 1.0,
  playChime: true,
};

let currentAudio: HTMLAudioElement | null = null;

export function loadVoiceSettings(): VoiceSettings {
  if (typeof window === "undefined") return DEFAULT_VOICE_SETTINGS;
  try {
    const raw = localStorage.getItem(STORAGE_KEY_VOICE);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        engine: parsed.engine === "browser" ? "browser" : "online_hd",
        voiceUri: typeof parsed.voiceUri === "string" ? parsed.voiceUri : "",
        rate: typeof parsed.rate === "number" ? Math.max(0.7, Math.min(1.3, parsed.rate)) : 0.95,
        pitch: typeof parsed.pitch === "number" ? Math.max(0.7, Math.min(1.3, parsed.pitch)) : 1.0,
        playChime: typeof parsed.playChime === "boolean" ? parsed.playChime : true,
      };
    }
  } catch {
    // ignore
  }
  return DEFAULT_VOICE_SETTINGS;
}

export function saveVoiceSettings(settings: VoiceSettings): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY_VOICE, JSON.stringify(settings));
  } catch {
    // ignore
  }
}

/**
 * Returns available Spanish voices sorted by naturalness and quality.
 * Filters strictly for Spanish ('es-*') voices.
 */
export function getAvailableSpanishVoices(): SpeechSynthesisVoice[] {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return [];
  const allVoices = window.speechSynthesis.getVoices();
  const spanish = allVoices.filter((v) => v.lang.toLowerCase().startsWith("es"));

  return [...spanish].sort((a, b) => scoreVoice(b) - scoreVoice(a));
}

/**
 * All browser voices installed on the system (for diagnosis if Spanish is missing).
 */
export function getAllBrowserVoices(): SpeechSynthesisVoice[] {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return [];
  return window.speechSynthesis.getVoices();
}

function scoreVoice(voice: SpeechSynthesisVoice): number {
  let score = 0;
  const name = voice.name.toLowerCase();
  const lang = voice.lang.toLowerCase();

  // Natural / Neural voices get top priority
  if (name.includes("natural")) score += 100;
  if (name.includes("neural")) score += 95;
  if (name.includes("online")) score += 85;
  if (name.includes("google")) score += 80;
  if (name.includes("enhanced") || name.includes("premium")) score += 75;

  // Well known high quality Spanish voices
  if (
    name.includes("sabina") ||
    name.includes("helena") ||
    name.includes("laura") ||
    name.includes("salma") ||
    name.includes("alvaro") ||
    name.includes("jorge") ||
    name.includes("diego") ||
    name.includes("sofia") ||
    name.includes("monica") ||
    name.includes("paulina")
  ) {
    score += 40;
  }

  // Dialect preferences
  if (lang === "es-ve") score += 35;
  if (lang === "es-419") score += 30;
  if (lang === "es-mx" || lang === "es-us" || lang === "es-co") score += 25;
  if (lang === "es-es") score += 15;

  // Penalize robotic synthesizers (eSpeak / generic robot engines)
  if (name.includes("espeak") || name.includes("compact") || name.includes("klatt")) {
    score -= 150;
  }

  return score;
}

/**
 * Generates an authentic, pleasant two-tone chime via Web Audio API
 * to announce the lottery result before speaking.
 */
export function playLotteryChime(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof window === "undefined") {
      resolve();
      return;
    }

    try {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) {
        resolve();
        return;
      }

      const ctx = new AudioCtx();
      if (ctx.state === "suspended") {
        ctx.resume().catch(() => {});
      }

      const now = ctx.currentTime;

      // Note 1: E5 (659.25 Hz)
      const osc1 = ctx.createOscillator();
      const gain1 = ctx.createGain();
      osc1.type = "sine";
      osc1.frequency.setValueAtTime(659.25, now);
      gain1.gain.setValueAtTime(0.08, now);
      gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.45);
      osc1.connect(gain1);
      gain1.connect(ctx.destination);
      osc1.start(now);
      osc1.stop(now + 0.45);

      // Note 2: A5 (880 Hz) with soft bell resonance
      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.type = "sine";
      osc2.frequency.setValueAtTime(880, now + 0.18);
      gain2.gain.setValueAtTime(0.12, now + 0.18);
      gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.7);
      osc2.connect(gain2);
      gain2.connect(ctx.destination);
      osc2.start(now + 0.18);
      osc2.stop(now + 0.7);

      setTimeout(() => {
        try {
          ctx.close();
        } catch {
          // ignore
        }
        resolve();
      }, 550);
    } catch {
      resolve();
    }
  });
}

/** Formats 24h or HH:mm time string to a conversational Spanish phrase for voice synthesis */
export function formatTimeForSpeech(timeStr: string): string {
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

/**
 * Plays natural Spanish speech through the dedicated /api/tts streaming endpoint.
 * Bypasses all device/browser voice limitations.
 */
export function playNaturalSpanishAudio(
  text: string,
  onStart?: () => void,
  onEnd?: () => void,
): Promise<void> {
  return new Promise((resolve) => {
    stopAllAudio();

    if (typeof window === "undefined") {
      onEnd?.();
      resolve();
      return;
    }

    const encodedText = encodeURIComponent(text);
    const audioUrl = `/api/tts?text=${encodedText}&lang=es`;
    const audio = new Audio(audioUrl);
    currentAudio = audio;

    audio.onplay = () => onStart?.();
    audio.onended = () => {
      currentAudio = null;
      onEnd?.();
      resolve();
    };
    audio.onerror = () => {
      currentAudio = null;
      onEnd?.();
      resolve();
    };

    try {
      const playPromise = audio.play();
      if (playPromise !== undefined && typeof playPromise?.catch === "function") {
        playPromise.catch((err) => {
          console.warn("[playNaturalSpanishAudio] Autoplay blocked:", err);
          currentAudio = null;
          onEnd?.();
          resolve();
        });
      }
    } catch {
      currentAudio = null;
      onEnd?.();
      resolve();
    }
  });
}

export function stopAllAudio(): void {
  if (currentAudio) {
    try {
      if (typeof currentAudio.pause === "function") {
        currentAudio.pause();
      }
      currentAudio.currentTime = 0;
    } catch {
      // ignore
    }
    currentAudio = null;
  }
  if (typeof window !== "undefined" && "speechSynthesis" in window) {
    try {
      window.speechSynthesis.cancel();
    } catch {
      // ignore
    }
  }
}

export interface SpeakOptions {
  gameName: string;
  drawTime: string;
  animalNumber: number;
  animalName: string;
  animalLabel?: string;
  onStart?: () => void;
  onEnd?: () => void;
  settings?: VoiceSettings;
}

/**
 * Speaks the lottery result with 100% natural Spanish pronunciation.
 * Uses HD Spanish audio stream by default, or browser Spanish voice if chosen and available.
 */
export async function speakLotteryResult({
  gameName,
  drawTime,
  animalNumber,
  animalName,
  animalLabel,
  onStart,
  onEnd,
  settings,
}: SpeakOptions): Promise<void> {
  stopAllAudio();

  const currentSettings = settings ?? loadVoiceSettings();

  // Play pleasant lottery broadcast chime first if enabled
  if (currentSettings.playChime) {
    await playLotteryChime();
  }

  const timePhrase = formatTimeForSpeech(drawTime);
  const numberPhrase =
    animalLabel === "00" ? "doble cero" : animalLabel === "0" ? "cero" : `número ${animalNumber}`;

  // Natural radio broadcast phrasing for animalitos lottery
  const speechText = `¡Atención! Resultado de ${gameName}, sorteo de ${timePhrase}. Ganador: ${numberPhrase}, ¡${animalName}!`;

  const availableSpanish = getAvailableSpanishVoices();
  const shouldUseOnlineHd = currentSettings.engine === "online_hd" || availableSpanish.length === 0;

  if (shouldUseOnlineHd) {
    await playNaturalSpanishAudio(speechText, onStart, onEnd);
    return;
  }

  // Otherwise, use browser Spanish synthesis
  if (
    typeof window === "undefined" ||
    !("speechSynthesis" in window) ||
    typeof SpeechSynthesisUtterance === "undefined"
  ) {
    onEnd?.();
    return;
  }

  try {
    const utterance = new SpeechSynthesisUtterance(speechText);
    utterance.lang = "es-VE";
    utterance.rate = currentSettings.rate;
    utterance.pitch = currentSettings.pitch;

    let selectedVoice: SpeechSynthesisVoice | undefined;
    if (currentSettings.voiceUri) {
      selectedVoice = availableSpanish.find((v) => v.voiceURI === currentSettings.voiceUri);
    }
    if (!selectedVoice && availableSpanish.length > 0) {
      selectedVoice = availableSpanish[0];
    }

    if (selectedVoice) {
      utterance.voice = selectedVoice;
      utterance.lang = selectedVoice.lang;
    }

    utterance.onstart = () => onStart?.();
    utterance.onend = () => onEnd?.();
    utterance.onerror = () => onEnd?.();

    window.speechSynthesis.speak(utterance);
  } catch (err) {
    console.warn("[speechSynthesis] Failed, falling back to natural Spanish audio:", err);
    await playNaturalSpanishAudio(speechText, onStart, onEnd);
  }
}
