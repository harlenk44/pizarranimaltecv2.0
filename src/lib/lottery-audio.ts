/**
 * Audio and Speech Synthesis helper for Venezuelan Lottery Boards.
 * Optimizes natural Spanish pronunciation, intonation, and voice selection.
 * Includes HD Natural Spanish streaming to guarantee human-sounding Spanish
 * even on devices without local Spanish voice packages installed.
 */

export type VoiceEngine = "online_hd" | "agency_voice" | "browser";

export interface VoiceSettings {
  engine: VoiceEngine;
  voiceUri: string;
  rate: number; // 0.8 - 1.2
  pitch: number; // 0.8 - 1.2
  playChime: boolean;
}

const STORAGE_KEY_VOICE = "lottery_voice_settings";

export const DEFAULT_VOICE_SETTINGS: VoiceSettings = {
  engine: "agency_voice", // Default to Agency Voice with 4-note airport chime and repetition
  voiceUri: "",
  rate: 0.98,
  pitch: 1.02,
  playChime: true,
};

let currentAudio: HTMLAudioElement | null = null;
let activeSpeechToken = 0;

export function loadVoiceSettings(): VoiceSettings {
  if (typeof window === "undefined") return DEFAULT_VOICE_SETTINGS;
  try {
    const raw = localStorage.getItem(STORAGE_KEY_VOICE);
    if (raw) {
      const parsed = JSON.parse(raw);
      let engine: VoiceEngine = DEFAULT_VOICE_SETTINGS.engine;
      if (
        parsed.engine === "browser" ||
        parsed.engine === "online_hd" ||
        parsed.engine === "agency_voice"
      ) {
        engine = parsed.engine;
      }
      return {
        engine,
        voiceUri: typeof parsed.voiceUri === "string" ? parsed.voiceUri : "",
        rate: typeof parsed.rate === "number" ? Math.max(0.7, Math.min(1.3, parsed.rate)) : 0.98,
        pitch: typeof parsed.pitch === "number" ? Math.max(0.7, Math.min(1.3, parsed.pitch)) : 1.02,
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

  // High quality Latin American Spanish voices (Sabina, Dalia, Jorge, Paloma, Alonso, etc.)
  if (
    name.includes("sabina") ||
    name.includes("dalia") ||
    name.includes("paloma") ||
    name.includes("alonso") ||
    name.includes("raul") ||
    name.includes("paulina") ||
    name.includes("jorge") ||
    name.includes("diego") ||
    name.includes("sofia") ||
    name.includes("salome") ||
    name.includes("gonzalo") ||
    name.includes("sebastian") ||
    name.includes("elena")
  ) {
    score += 45;
  }

  // Strong preference for Latin American Spanish dialects over Spain (es-ES)
  if (lang === "es-ve") score += 60;
  else if (lang === "es-419") score += 55;
  else if (
    lang === "es-mx" ||
    lang === "es-us" ||
    lang === "es-co" ||
    lang === "es-ar" ||
    lang === "es-cl" ||
    lang === "es-pe"
  ) {
    score += 50;
  } else if (lang === "es-es") {
    score -= 20;
  }

  // Penalize robotic synthesizers (eSpeak / generic robot engines)
  if (name.includes("espeak") || name.includes("compact") || name.includes("klatt")) {
    score -= 150;
  }

  return score;
}

/**
 * Reproduce el timbre de notificación tipo aeropuerto/agencia (Acorde Do Mayor: C5, E5, G5, C6)
 * usando Web Audio API antes de cantar el resultado.
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

      const notas = [523.25, 659.25, 783.99, 1046.5]; // Acorde Do Mayor (C5, E5, G5, C6)

      notas.forEach((frecuencia, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = "triangle";
        osc.frequency.setValueAtTime(frecuencia, ctx.currentTime + idx * 0.11);

        gain.gain.setValueAtTime(0.15, ctx.currentTime + idx * 0.11);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + idx * 0.11 + 0.35);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(ctx.currentTime + idx * 0.11);
        osc.stop(ctx.currentTime + idx * 0.11 + 0.35);
      });

      setTimeout(() => {
        try {
          ctx.close();
        } catch {
          // ignore
        }
        resolve();
      }, 450);
    } catch {
      resolve();
    }
  });
}

// Precargar las voces del navegador al iniciar la página
if (typeof window !== "undefined" && "speechSynthesis" in window) {
  try {
    window.speechSynthesis.onvoiceschanged = () => {
      window.speechSynthesis.getVoices();
    };
  } catch {
    // ignore
  }
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
 * Plays natural Latin American Spanish speech through the dedicated /api/tts streaming endpoint.
 * Bypasses all device/browser voice limitations and guarantees a Latin American Spanish accent.
 */
export function playNaturalSpanishAudio(
  text: string,
  onStart?: () => void,
  onEnd?: () => void,
  token?: number,
  rate = 0.98,
): Promise<void> {
  return new Promise((resolve) => {
    const myToken = token ?? ++activeSpeechToken;
    if (currentAudio) {
      try {
        currentAudio.onplay = null;
        currentAudio.onended = null;
        currentAudio.onerror = null;
        if (typeof currentAudio.pause === "function") {
          currentAudio.pause();
        }
      } catch {
        // ignore
      }
      currentAudio = null;
    }

    if (typeof window === "undefined") {
      if (myToken === activeSpeechToken) onEnd?.();
      resolve();
      return;
    }

    const encodedText = encodeURIComponent(text);
    const audioUrl = `/api/tts?text=${encodedText}&lang=es-US`;
    const audio = new Audio(audioUrl);
    audio.playbackRate = Math.max(0.75, Math.min(1.25, rate || 0.98));
    currentAudio = audio;

    audio.onplay = () => {
      if (myToken === activeSpeechToken) onStart?.();
    };
    audio.onended = () => {
      if (currentAudio === audio) currentAudio = null;
      if (myToken === activeSpeechToken) onEnd?.();
      resolve();
    };
    audio.onerror = () => {
      if (currentAudio === audio) currentAudio = null;
      if (myToken === activeSpeechToken) onEnd?.();
      resolve();
    };

    try {
      const playPromise = audio.play();
      if (playPromise !== undefined && typeof playPromise?.catch === "function") {
        playPromise.catch((err) => {
          console.warn("[playNaturalSpanishAudio] Autoplay blocked:", err);
          if (currentAudio === audio) currentAudio = null;
          if (myToken === activeSpeechToken) onEnd?.();
          resolve();
        });
      }
    } catch {
      if (currentAudio === audio) currentAudio = null;
      if (myToken === activeSpeechToken) onEnd?.();
      resolve();
    }
  });
}

export function stopAllAudio(): void {
  activeSpeechToken++;
  if (currentAudio) {
    try {
      currentAudio.onplay = null;
      currentAudio.onended = null;
      currentAudio.onerror = null;
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
 * Speaks the lottery result with 100% natural Latin American Spanish pronunciation.
 * Supports Agency Voice (with repetition in Latin American Spanish), Online HD Latin Spanish stream, or local Browser voice.
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
  const myToken = activeSpeechToken;

  const currentSettings = settings ?? loadVoiceSettings();

  // Primero suena el timbre de alerta si está activo
  if (currentSettings.playChime) {
    await playLotteryChime();
    if (myToken !== activeSpeechToken) return;
  }

  const timePhrase = formatTimeForSpeech(drawTime);
  const numeroTexto =
    animalLabel === "00" ? "doble cero" : animalLabel === "0" ? "cero" : String(animalNumber);
  const numberPhrase =
    animalLabel === "00" ? "doble cero" : animalLabel === "0" ? "cero" : `número ${animalNumber}`;

  // Frase según el tipo de voz elegido
  const isAgencyStyle = currentSettings.engine === "agency_voice";
  const speechText = isAgencyStyle
    ? `Atención en la agencia. Nuevo resultado de ${gameName}. Ha salido el número ${numeroTexto}, ${animalName}. Repito: en ${gameName}, número ${numeroTexto}, ${animalName}. ¡Felicidades a los ganadores!`
    : `¡Atención! Resultado de ${gameName}, sorteo de ${timePhrase}. Ganador: ${numberPhrase}, ¡${animalName}!`;

  // Tanto "agency_voice" (Voz de Agencia con Repetición) como "online_hd" (Voz Corta de Radio)
  // usan el motor de voz en Español Latino HD (es-US) para garantizar acento latino natural en cualquier TV o PC
  if (currentSettings.engine === "agency_voice" || currentSettings.engine === "online_hd") {
    await playNaturalSpanishAudio(
      speechText,
      onStart,
      onEnd,
      myToken,
      isAgencyStyle ? currentSettings.rate || 0.98 : currentSettings.rate,
    );
    return;
  }

  const availableSpanish = getAvailableSpanishVoices();

  // Para "browser", usamos Web Speech API priorizando voces en Español Latino (y si no hay, respaldamos con audio HD Latino)
  if (
    typeof window === "undefined" ||
    !("speechSynthesis" in window) ||
    typeof SpeechSynthesisUtterance === "undefined" ||
    availableSpanish.length === 0
  ) {
    await playNaturalSpanishAudio(speechText, onStart, onEnd, myToken, currentSettings.rate);
    return;
  }

  try {
    window.speechSynthesis.cancel();

    const locucion = new SpeechSynthesisUtterance(speechText);
    locucion.lang = "es-419";
    locucion.rate = currentSettings.rate || 0.98;
    locucion.pitch = currentSettings.pitch || 1.02;

    // Buscar preferiblemente una voz en Español Latino (Venezuela, México, Latinoamérica, EE.UU., Colombia)
    const voces = window.speechSynthesis.getVoices();
    let selectedVoice: SpeechSynthesisVoice | undefined;

    if (currentSettings.voiceUri) {
      selectedVoice = voces.find((v) => v.voiceURI === currentSettings.voiceUri);
    }

    if (!selectedVoice) {
      selectedVoice =
        voces.find((v) => {
          const l = v.lang.toLowerCase();
          return (
            l.startsWith("es-ve") ||
            l.startsWith("es-419") ||
            l.startsWith("es-mx") ||
            l.startsWith("es-us") ||
            l.startsWith("es-co") ||
            l.startsWith("es-ar") ||
            l.startsWith("es-cl") ||
            l.startsWith("es-pe")
          );
        }) ?? availableSpanish[0];
    }

    if (selectedVoice) {
      locucion.voice = selectedVoice;
      locucion.lang = selectedVoice.lang;
    }

    locucion.onstart = () => {
      if (myToken === activeSpeechToken) onStart?.();
    };
    locucion.onend = () => {
      if (myToken === activeSpeechToken) onEnd?.();
    };
    locucion.onerror = () => {
      if (myToken === activeSpeechToken) onEnd?.();
    };

    window.speechSynthesis.speak(locucion);
  } catch (err) {
    console.warn("[speechSynthesis] Failed, falling back to natural Spanish audio:", err);
    await playNaturalSpanishAudio(speechText, onStart, onEnd, myToken, currentSettings.rate);
  }
}
