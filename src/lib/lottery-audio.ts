/**
 * Audio and Speech Synthesis helper for Venezuelan Lottery Boards.
 * Optimizes natural Spanish pronunciation, intonation, and voice selection.
 * Includes:
 * 1. Unified Web Audio API (AudioContext) channel shared between the 4-note chime and voice playback
 *    so iframe/browser autoplay policies never block `<audio>` after the chime plays.
 * 2. Smart 2.5-second network timeout with automatic instant fallback to native SpeechSynthesis
 *    on slow internet connections, plus in-memory ArrayBuffer caching (0ms replay).
 * 3. Complete pre-initialization of Web Audio API, SpeechSynthesis, and HTMLAudioElement on the
 *    first user interaction (click, touch, pointer, or TV remote keydown).
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

/** Maximum wait time (2.5s) for network TTS before falling back to native device voice */
const NETWORK_TTS_TIMEOUT_MS = 2500;

/** Maximum number of synthesized phrases kept in RAM for 0ms instant replay */
const MAX_TTS_CACHE_ENTRIES = 50;

/** In-memory cache mapping TTS text+lang to raw MP3 ArrayBuffer */
const ttsAudioBufferCache = new Map<string, ArrayBuffer>();

export const DEFAULT_VOICE_SETTINGS: VoiceSettings = {
  engine: "agency_voice", // Default to Agency Voice with 4-note airport chime and repetition
  voiceUri: "",
  rate: 0.98,
  pitch: 1.02,
  playChime: true,
};

let currentAudio: HTMLAudioElement | null = null;
let currentBufferSource: AudioBufferSourceNode | null = null;
let currentFetchAbort: AbortController | null = null;
let sharedAudioContext: AudioContext | null = null;
let activeUtterance: SpeechSynthesisUtterance | null = null;
let speechKeepAliveTimer: ReturnType<typeof setInterval> | null = null;
let activeSpeechToken = 0;
let audioUnlocked = false;
let speechUnlocked = false;

/**
 * Returns or creates a singleton AudioContext so once unlocked by a user gesture
 * (remote key press, click, or touch), it stays unlocked for both the chime and voice audio.
 */
function getSharedAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  try {
    if (!sharedAudioContext || sharedAudioContext.state === "closed") {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return null;
      sharedAudioContext = new AudioCtx();
    }
    if (sharedAudioContext.state === "suspended") {
      sharedAudioContext.resume().catch(() => {});
    }
    return sharedAudioContext;
  } catch {
    return null;
  }
}

/**
 * Pre-initializes and unlocks Web Audio API (AudioContext), native SpeechSynthesis,
 * and HTMLAudioElement on the first user interaction (click, touch, pointerdown, keydown).
 */
export function ensureAudioUnlocked(): void {
  if (typeof window === "undefined") return;

  // 1. Unlock unified Web Audio API (AudioContext)
  if (!audioUnlocked) {
    try {
      const ctx = getSharedAudioContext();
      if (ctx) {
        if (ctx.state === "suspended") {
          ctx.resume().catch(() => {});
        }
        const buffer = ctx.createBuffer(1, 1, 22050);
        const source = ctx.createBufferSource();
        source.buffer = buffer;
        source.connect(ctx.destination);
        source.start(0);
        if (ctx.state === "running") {
          audioUnlocked = true;
        }
      }
    } catch {
      // ignore
    }
  }

  // 2. Pre-initialize and unlock native SpeechSynthesis
  if (!speechUnlocked && "speechSynthesis" in window) {
    try {
      window.speechSynthesis.getVoices();
      if (window.speechSynthesis.paused) {
        window.speechSynthesis.resume();
      }
      // Silent warm-up utterance so browsers/Smart TVs authorize future automatic calls
      if (
        typeof SpeechSynthesisUtterance !== "undefined" &&
        !window.speechSynthesis.speaking &&
        !window.speechSynthesis.pending
      ) {
        const warmUp = new SpeechSynthesisUtterance("");
        warmUp.volume = 0;
        warmUp.rate = 2;
        warmUp.lang = "es-419";
        window.speechSynthesis.speak(warmUp);
      }
      speechUnlocked = true;
    } catch {
      // ignore
    }
  }
}

if (typeof window !== "undefined") {
  const unlockHandler = () => {
    ensureAudioUnlocked();
  };
  window.addEventListener("click", unlockHandler, { passive: true });
  window.addEventListener("touchstart", unlockHandler, { passive: true });
  window.addEventListener("pointerdown", unlockHandler, { passive: true });
  window.addEventListener("keydown", unlockHandler, { passive: true });

  if ("speechSynthesis" in window) {
    try {
      window.speechSynthesis.getVoices();
      window.speechSynthesis.onvoiceschanged = () => {
        window.speechSynthesis.getVoices();
      };
    } catch {
      // ignore
    }
  }
}

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
  const spanish = allVoices.filter((v) => (v?.lang || "").toLowerCase().startsWith("es"));

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
  const name = (voice.name || "").toLowerCase();
  const lang = (voice.lang || "").toLowerCase();

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
      const ctx = getSharedAudioContext();
      if (!ctx) {
        resolve();
        return;
      }

      if (ctx.state === "suspended") {
        ctx.resume().catch(() => {});
      }

      const notas = [523.25, 659.25, 783.99, 1046.5]; // Acorde Do Mayor (C5, E5, G5, C6)

      notas.forEach((frecuencia, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = "triangle";
        osc.frequency.setValueAtTime(frecuencia, ctx.currentTime + idx * 0.11);

        gain.gain.setValueAtTime(0.18, ctx.currentTime + idx * 0.11);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + idx * 0.11 + 0.35);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(ctx.currentTime + idx * 0.11);
        osc.stop(ctx.currentTime + idx * 0.11 + 0.35);
      });

      setTimeout(() => {
        resolve();
      }, 450);
    } catch {
      resolve();
    }
  });
}

/** Phonetic dictionary to restore natural Spanish accents and word boundaries from uppercase/unaccented strings */
const PHONETIC_SPANISH_WORDS: Record<string, string> = {
  atencion: "Atención",
  atención: "Atención",
  numero: "número",
  número: "número",
  loteria: "Lotería",
  lotería: "Lotería",
  lotoanimalito: "Loto Animalito",
  lottopantera: "Lotto Pantera",
  guacharo: "Guácharo",
  guácharo: "Guácharo",
  cazaloton: "Cazalotón",
  cazalotón: "Cazalotón",
  tachira: "Táchira",
  táchira: "Táchira",
  delfin: "Delfín",
  delfín: "Delfín",
  ciempies: "Ciempiés",
  ciempiés: "Ciempiés",
  alacran: "Alacrán",
  alacrán: "Alacrán",
  leon: "León",
  león: "León",
  raton: "Ratón",
  ratón: "Ratón",
  aguila: "Águila",
  águila: "Águila",
  pajaro: "Pájaro",
  pájaro: "Pájaro",
  caiman: "Caimán",
  caimán: "Caimán",
  tiburon: "Tiburón",
  tiburón: "Tiburón",
  camaron: "Camarón",
  camarón: "Camarón",
  puercoespin: "Puercoespín",
  puercoespín: "Puercoespín",
  gavilan: "Gavilán",
  gavilán: "Gavilán",
  pelicano: "Pelícano",
  pelícano: "Pelícano",
  tucan: "Tucán",
  tucán: "Tucán",
  halcon: "Halcón",
  halcón: "Halcón",
  jabali: "Jabalí",
  jabalí: "Jabalí",
  atun: "Atún",
  atún: "Atún",
  dragon: "Dragón",
  dragón: "Dragón",
  chiguire: "Chigüire",
  chigüire: "Chigüire",
  geminis: "Géminis",
  géminis: "Géminis",
  cancer: "Cáncer",
  cáncer: "Cáncer",
};

const LOWERCASE_CONNECTORS = new Set([
  "de",
  "del",
  "la",
  "las",
  "el",
  "los",
  "en",
  "a",
  "y",
  "o",
  "con",
  "por",
  "para",
]);

function capitalizeSpanishWord(word: string, isSentenceStart = false): string {
  if (!word) return "";
  const lower = word.toLowerCase();
  const mapped = PHONETIC_SPANISH_WORDS[lower];
  if (mapped) {
    if (!isSentenceStart && mapped === "número") return "número";
    return mapped;
  }
  if (!isSentenceStart && LOWERCASE_CONNECTORS.has(lower)) {
    return lower;
  }
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

/**
 * Normalizes any lottery text phonetically before sending it to SpeechSynthesisUtterance or /api/tts:
 * 1. Separates attached number-animal pairs like "05-LEON" into "número 05, León" (and "00-BALLENA" into "número cero cero, Ballena").
 * 2. Converts "00" into "cero cero".
 * 3. Replaces hyphens (-), underscores (_), slashes (/), bullets (·) and special symbols with natural commas/pauses.
 * 4. Converts ALL-CAPS words into lowercase with the first letter capitalized so the voice engine never spells out letters as acronyms.
 */
export function normalizeTextForSpeech(rawText: string): string {
  if (!rawText) return "";

  let text = rawText.trim();

  // 1. Expand Triple notation like "A: 452 · B: 819" into natural spoken pauses
  text = text.replace(/\b([ABC]):\s*(\d+)/gi, (_match, letter: string, digits: string) => {
    return `Triple ${letter.toUpperCase()}, ${digits}`;
  });

  // 2. Separate number + name patterns like "05-LEON", "05_LEON", "05/LEON", "00-BALLENA"
  text = text.replace(
    /(?:(n[úu]mero)\s+)?\b(00|\d{1,3})\s*[-_/:]+\s*([A-Za-zÁÉÍÓÚÜÑáéíóúüñ]{2,})/gi,
    (_match, existingNumero: string | undefined, numStr: string, animalWord: string) => {
      const spokenNum = numStr === "00" ? "cero cero" : numStr;
      const prefix = existingNumero ? `${existingNumero} ` : "número ";
      return `${prefix}${spokenNum}, ${capitalizeSpanishWord(animalWord, true)}`;
    },
  );

  // 3. Convert standalone "00" or "doble cero" to "cero cero"
  text = text.replace(/\bdoble\s+cero\b/gi, "cero cero");
  text = text.replace(/(?<![\d:])00(?![\d:])/g, "cero cero");

  // 4. Replace hyphens (-), underscores (_), slashes (/), pipes (|), bullets (·) and special characters with natural commas
  text = text.replace(/[-_/|·•*#@~]+/g, ", ");

  // 5. Convert words to lowercase with first letter capitalized (preventing 100% UPPERCASE acronym spelling)
  let isStartOfClause = true;
  text = text.replace(
    /([¡¿]?)([A-Za-zÁÉÍÓÚÜÑáéíóúüñ]+)([.!?,;:]?)/g,
    (_full, openPunct: string, word: string, closePunct: string) => {
      const lower = word.toLowerCase();
      let formatted: string;

      // Keep common conversational words in natural casing within sentences unless at start of clause or all-caps
      const isAllCaps = word.length > 1 && word === word.toUpperCase();
      if (PHONETIC_SPANISH_WORDS[lower]) {
        const dictVal = PHONETIC_SPANISH_WORDS[lower]!;
        formatted =
          isStartOfClause || dictVal.charAt(0) === dictVal.charAt(0).toUpperCase()
            ? dictVal
            : dictVal.toLowerCase();
      } else if (isAllCaps) {
        formatted = capitalizeSpanishWord(lower, isStartOfClause);
      } else if (isStartOfClause || openPunct) {
        formatted = lower.charAt(0).toUpperCase() + lower.slice(1);
      } else {
        formatted = word;
      }

      isStartOfClause = Boolean(closePunct && /[.!?;:]/.test(closePunct));
      return `${openPunct}${formatted}${closePunct}`;
    },
  );

  // 6. Clean up redundant spaces and duplicate commas
  text = text
    .replace(/\s*,\s*,+/g, ", ")
    .replace(/,\s*([.!?;:])/g, "$1")
    .replace(/\s{2,}/g, " ")
    .trim();

  return text;
}

/** Formats a lottery or animal name specifically for voice announcement (Title Case, no hyphens/underscores, no ALL-CAPS) */
function formatNameForSpeech(rawName: string): string {
  if (!rawName) return "";
  const cleaned = rawName
    .replace(/[-_/|·•]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned
    .split(" ")
    .map((w, idx) => capitalizeSpanishWord(w, idx === 0))
    .join(" ");
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

function clearSpeechKeepAlive() {
  if (speechKeepAliveTimer) {
    clearInterval(speechKeepAliveTimer);
    speechKeepAliveTimer = null;
  }
}

/**
 * Reproduce voz usando Web Speech API del navegador / Smart TV con protección
 * contra recolección de basura (GC), reanudación automática y espera de carga de voces.
 */
function speakWithBrowserSynthesis(
  text: string,
  settings: VoiceSettings,
  myToken: number,
  onStart?: () => void,
  onEnd?: () => void,
): Promise<boolean> {
  const normalizedText = normalizeTextForSpeech(text);
  return new Promise((resolve) => {
    if (
      typeof window === "undefined" ||
      !("speechSynthesis" in window) ||
      typeof SpeechSynthesisUtterance === "undefined"
    ) {
      resolve(false);
      return;
    }

    const startUtterance = () => {
      if (myToken !== activeSpeechToken) {
        resolve(false);
        return;
      }

      try {
        clearSpeechKeepAlive();
        if (window.speechSynthesis.speaking || window.speechSynthesis.pending) {
          window.speechSynthesis.cancel();
        }
        if (window.speechSynthesis.paused) {
          window.speechSynthesis.resume();
        }

        // Pequeña pausa tras cancel() para evitar bug en Chrome/Android TV donde cancel() anula el nuevo speak()
        setTimeout(() => {
          if (myToken !== activeSpeechToken) {
            resolve(false);
            return;
          }

          try {
            const locucion = new SpeechSynthesisUtterance(normalizedText);
            activeUtterance = locucion; // Mantener referencia global para que el GC no corte el audio
            locucion.lang = "es-419";
            locucion.rate = Math.max(0.75, Math.min(1.25, settings.rate || 0.98));
            locucion.pitch = Math.max(0.75, Math.min(1.25, settings.pitch || 1.02));
            locucion.volume = 1;

            const voces = window.speechSynthesis.getVoices();
            const availableSpanish = getAvailableSpanishVoices();
            let selectedVoice: SpeechSynthesisVoice | undefined;

            if (settings.voiceUri) {
              selectedVoice = voces.find((v) => v.voiceURI === settings.voiceUri);
            }

            if (!selectedVoice) {
              selectedVoice =
                voces.find((v) => {
                  const l = (v?.lang || "").toLowerCase();
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
                }) ??
                availableSpanish[0] ??
                voces.find((v) => (v?.lang || "").toLowerCase().startsWith("es"));
            }

            if (selectedVoice) {
              locucion.voice = selectedVoice;
              locucion.lang = selectedVoice.lang;
            }

            let finished = false;
            const finish = (success: boolean) => {
              if (finished) return;
              finished = true;
              clearSpeechKeepAlive();
              if (activeUtterance === locucion) {
                activeUtterance = null;
              }
              if (success && myToken === activeSpeechToken) {
                onEnd?.();
              }
              resolve(success);
            };

            locucion.onstart = () => {
              if (myToken === activeSpeechToken) onStart?.();
            };
            locucion.onend = () => {
              finish(true);
            };
            locucion.onerror = (ev) => {
              if (ev.error === "canceled" || ev.error === "interrupted") {
                finish(true);
              } else {
                finish(false);
              }
            };

            // Keep-alive cada 4 segundos para evitar el corte de 15s en Chrome / Smart TVs
            speechKeepAliveTimer = setInterval(() => {
              if (typeof window !== "undefined" && "speechSynthesis" in window) {
                if (window.speechSynthesis.paused) {
                  window.speechSynthesis.resume();
                }
              }
            }, 4000);

            window.speechSynthesis.speak(locucion);
            if (window.speechSynthesis.paused) {
              window.speechSynthesis.resume();
            }
          } catch {
            resolve(false);
          }
        }, 60);
      } catch {
        resolve(false);
      }
    };

    const existingVoices = window.speechSynthesis.getVoices();
    if (existingVoices.length > 0) {
      startUtterance();
    } else {
      // Esperar hasta 350ms si las voces del navegador aún se están inicializando
      let started = false;
      const timer = setTimeout(() => {
        if (!started) {
          started = true;
          startUtterance();
        }
      }, 350);
      window.speechSynthesis.onvoiceschanged = () => {
        if (!started) {
          started = true;
          clearTimeout(timer);
          startUtterance();
        }
      };
    }
  });
}

/**
 * Fetches TTS audio with a strict 2.5-second timeout and stores it in the RAM cache
 * so repeated announcements play in 0ms without network consumption.
 */
async function fetchTtsArrayBufferWithCache(
  text: string,
  lang = "es-US",
  signal?: AbortSignal,
): Promise<ArrayBuffer | null> {
  const normalizedText = normalizeTextForSpeech(text);
  const cacheKey = `${lang}::${normalizedText}`;
  const cached = ttsAudioBufferCache.get(cacheKey);
  if (cached && cached.byteLength > 0) {
    return cached;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort();
  }, NETWORK_TTS_TIMEOUT_MS);

  const onExternalAbort = () => controller.abort();
  if (signal) {
    if (signal.aborted) {
      clearTimeout(timeoutId);
      return null;
    }
    signal.addEventListener("abort", onExternalAbort, { once: true });
  }

  try {
    const encodedText = encodeURIComponent(normalizedText);
    const res = await fetch(`/api/tts?text=${encodedText}&lang=${encodeURIComponent(lang)}`, {
      signal: controller.signal,
    });
    if (!res.ok) return null;

    const buffer = await res.arrayBuffer();
    if (!buffer || buffer.byteLength === 0) return null;

    // Save to in-memory LRU-style cache
    if (ttsAudioBufferCache.size >= MAX_TTS_CACHE_ENTRIES) {
      const oldestKey = ttsAudioBufferCache.keys().next().value;
      if (oldestKey) ttsAudioBufferCache.delete(oldestKey);
    }
    ttsAudioBufferCache.set(cacheKey, buffer);
    return buffer;
  } catch {
    return null;
  } finally {
    clearTimeout(timeoutId);
    if (signal) {
      signal.removeEventListener("abort", onExternalAbort);
    }
  }
}

/**
 * Plays natural Latin American Spanish speech through the unified Web Audio API (AudioContext)
 * channel shared with `playLotteryChime()`.
 * - Uses a strict 2.5s timeout on slow connections so it immediately falls back to native SpeechSynthesis.
 * - Uses in-memory ArrayBuffer cache for 0ms instant playback on repeat.
 */
export function playNaturalSpanishAudio(
  text: string,
  onStart?: () => void,
  onEnd?: () => void,
  token?: number,
  rate = 0.98,
): Promise<boolean> {
  const normalizedText = normalizeTextForSpeech(text);
  return new Promise((resolve) => {
    const myToken = token ?? ++activeSpeechToken;

    if (currentBufferSource) {
      try {
        currentBufferSource.onended = null;
        currentBufferSource.stop();
        currentBufferSource.disconnect();
      } catch {
        // ignore
      }
      currentBufferSource = null;
    }

    if (currentFetchAbort) {
      try {
        currentFetchAbort.abort();
      } catch {
        // ignore
      }
      currentFetchAbort = null;
    }

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
      resolve(false);
      return;
    }

    const clampedRate = Math.max(0.75, Math.min(1.25, rate || 0.98));
    const abortCtrl = new AbortController();
    currentFetchAbort = abortCtrl;

    (async () => {
      const rawBuffer = await fetchTtsArrayBufferWithCache(
        normalizedText,
        "es-US",
        abortCtrl.signal,
      );
      if (!rawBuffer || myToken !== activeSpeechToken) {
        resolve(false);
        return;
      }

      // 1. Primary Playback: Unified Web Audio API (same AudioContext used by the 4-note chime)
      const ctx = getSharedAudioContext();
      if (ctx && typeof ctx.decodeAudioData === "function") {
        try {
          if (ctx.state === "suspended") {
            await ctx.resume().catch(() => {});
          }
          // Clone buffer with .slice(0) so cached ArrayBuffer is never detached by decodeAudioData
          const decodedAudio = await ctx.decodeAudioData(rawBuffer.slice(0));
          if (myToken !== activeSpeechToken) {
            resolve(false);
            return;
          }

          const source = ctx.createBufferSource();
          source.buffer = decodedAudio;
          source.playbackRate.value = clampedRate;

          const gainNode = ctx.createGain();
          gainNode.gain.value = 1.0;
          source.connect(gainNode);
          gainNode.connect(ctx.destination);

          currentBufferSource = source;
          let settled = false;

          source.onended = () => {
            if (settled) return;
            settled = true;
            if (currentBufferSource === source) {
              currentBufferSource = null;
            }
            if (myToken === activeSpeechToken) {
              onEnd?.();
            }
            resolve(true);
          };

          if (myToken === activeSpeechToken) {
            onStart?.();
          }
          source.start(0);
          return;
        } catch {
          // If decodeAudioData fails on a specific platform, fall through to Blob Audio fallback
        }
      }

      // 2. Secondary Playback Fallback: Blob URL via HTMLAudioElement
      try {
        const blob = new Blob([rawBuffer.slice(0)], { type: "audio/mpeg" });
        const blobUrl = URL.createObjectURL(blob);
        const audio = new Audio(blobUrl);
        audio.volume = 1;
        audio.playbackRate = clampedRate;
        currentAudio = audio;

        let settled = false;
        const settle = (ok: boolean) => {
          if (settled) return;
          settled = true;
          URL.revokeObjectURL(blobUrl);
          if (currentAudio === audio) currentAudio = null;
          if (ok && myToken === activeSpeechToken) {
            onEnd?.();
          }
          resolve(ok);
        };

        audio.onplay = () => {
          if (myToken === activeSpeechToken) onStart?.();
        };
        audio.onended = () => settle(true);
        audio.onerror = () => settle(false);

        const playPromise = audio.play();
        if (playPromise !== undefined && typeof playPromise?.catch === "function") {
          playPromise.catch(() => settle(false));
        }
      } catch {
        resolve(false);
      }
    })();
  });
}

export function stopAllAudio(): void {
  activeSpeechToken++;
  clearSpeechKeepAlive();
  activeUtterance = null;

  if (currentFetchAbort) {
    try {
      currentFetchAbort.abort();
    } catch {
      // ignore
    }
    currentFetchAbort = null;
  }

  if (currentBufferSource) {
    try {
      currentBufferSource.onended = null;
      currentBufferSource.stop();
      currentBufferSource.disconnect();
    } catch {
      // ignore
    }
    currentBufferSource = null;
  }

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
 * - Uses the unified Web Audio API channel (`AudioContext`) shared with the chime.
 * - Enforces a 2.5s network timeout: if the connection is slow, immediately falls back
 *   to the device's native `speechSynthesis` so announcements never stay silent.
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
  ensureAudioUnlocked();
  stopAllAudio();
  const myToken = activeSpeechToken;

  const currentSettings = settings ?? loadVoiceSettings();

  const timePhrase = formatTimeForSpeech(drawTime);

  // Extract embedded number prefix if animalName arrives as "05-LEON" or "00-BALLENA"
  let rawCleanAnimalName = (animalName || "").trim();
  let effectiveLabel = (animalLabel || "").trim();
  const prefixMatch = rawCleanAnimalName.match(
    /^(00|\d{1,3})\s*[-_/:]+\s*([A-Za-zÁÉÍÓÚÜÑáéíóúüñ].*)$/,
  );
  if (prefixMatch) {
    if (!effectiveLabel) {
      effectiveLabel = prefixMatch[1]!;
    }
    rawCleanAnimalName = prefixMatch[2]!.trim();
  }

  const spokenGameName = formatNameForSpeech(gameName);
  const spokenAnimalName = formatNameForSpeech(rawCleanAnimalName);

  const isDoubleZero = effectiveLabel === "00";
  const isSingleZero = !isDoubleZero && (effectiveLabel === "0" || animalNumber === 0);
  const displayNum =
    effectiveLabel || (animalNumber < 10 ? `0${animalNumber}` : String(animalNumber));

  const numeroTexto = isDoubleZero ? "cero cero" : isSingleZero ? "cero" : displayNum;
  const winnerPhrase = `número ${numeroTexto}, ${spokenAnimalName}`;

  // Frase según el tipo de voz elegido (normalizada fonéticamente para evitar deletreo)
  const isAgencyStyle = currentSettings.engine === "agency_voice";
  const rawSpeechText = isAgencyStyle
    ? `Atención en la agencia. Nuevo resultado de ${spokenGameName}. Ha salido el ${winnerPhrase}. Repito: en ${spokenGameName}, ${winnerPhrase}. ¡Felicidades a los ganadores!`
    : `¡Atención! Resultado de ${spokenGameName}, sorteo de ${timePhrase}. Ganador: ${winnerPhrase}.`;

  const speechText = normalizeTextForSpeech(rawSpeechText);

  // Pre-descargar el audio en paralelo mientras suena el timbre de 4 notas (ahorra ~450ms)
  const prefetchPromise =
    currentSettings.engine === "agency_voice" || currentSettings.engine === "online_hd"
      ? fetchTtsArrayBufferWithCache(speechText, "es-US")
      : null;

  // Primero suena el timbre de alerta si está activo
  if (currentSettings.playChime) {
    await playLotteryChime();
    if (myToken !== activeSpeechToken) return;
  }

  if (currentSettings.engine === "agency_voice" || currentSettings.engine === "online_hd") {
    // Wait for the parallel prefetch if still in progress (already bounded by 2.5s timeout)
    await prefetchPromise;
    if (myToken !== activeSpeechToken) return;

    const playedOk = await playNaturalSpanishAudio(
      speechText,
      onStart,
      onEnd,
      myToken,
      isAgencyStyle ? currentSettings.rate || 0.98 : currentSettings.rate,
    );
    if (playedOk || myToken !== activeSpeechToken) {
      return;
    }

    // Respaldo inmediato al sintetizador nativo del navegador/Smart TV si el internet tardó > 2.5s o falló
    const fallbackOk = await speakWithBrowserSynthesis(
      speechText,
      currentSettings,
      myToken,
      onStart,
      onEnd,
    );
    if (!fallbackOk && myToken === activeSpeechToken) {
      onEnd?.();
    }
    return;
  }

  // Modo "browser": intenta primero Web Speech API y si falla o no hay voces disponibles, usa el canal unificado HD
  const browserOk = await speakWithBrowserSynthesis(
    speechText,
    currentSettings,
    myToken,
    onStart,
    onEnd,
  );
  if (browserOk || myToken !== activeSpeechToken) {
    return;
  }

  const fallbackStreamOk = await playNaturalSpanishAudio(
    speechText,
    onStart,
    onEnd,
    myToken,
    currentSettings.rate,
  );
  if (!fallbackStreamOk && myToken !== activeSpeechToken) {
    onEnd?.();
  }
}
