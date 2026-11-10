import { createFileRoute } from "@tanstack/react-router";
import { normalizeTextForSpeech } from "@/lib/lottery-audio";

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

const MAX_SERVER_TTS_CACHE = 80;
const serverTtsCache = new Map<string, Uint8Array>();

function splitTextIntoChunks(text: string, maxLen = 185): string[] {
  const cleaned = text.trim().replace(/\s+/g, " ");
  if (cleaned.length <= maxLen) return [cleaned];

  // Split by sentence boundaries first
  const parts = cleaned.split(/(?<=[.!?;])\s+/);
  const chunks: string[] = [];
  let current = "";

  for (const part of parts) {
    if (!current) {
      current = part;
    } else if ((current + " " + part).length <= maxLen) {
      current += " " + part;
    } else {
      chunks.push(current);
      current = part;
    }
  }
  if (current) chunks.push(current);

  return chunks.flatMap((c) => {
    if (c.length <= maxLen) return [c];
    const sub: string[] = [];
    for (let i = 0; i < c.length; i += maxLen) {
      sub.push(c.slice(i, i + maxLen));
    }
    return sub;
  });
}

export const Route = createFileRoute("/api/tts")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const url = new URL(request.url);
          const rawText = url.searchParams.get("text") || "Atención";
          const text = normalizeTextForSpeech(rawText).slice(0, 600);
          // Forzar español latinoamericano (es-US / es-419 / es-MX) en lugar de español de España (es / es-ES)
          const requestedLang = url.searchParams.get("lang") || "es-US";
          const lang =
            requestedLang === "es" || requestedLang === "es-ES" ? "es-US" : requestedLang;

          const cacheKey = `${lang}::${text}`;
          const cachedAudio = serverTtsCache.get(cacheKey);
          if (cachedAudio && cachedAudio.byteLength > 0) {
            return new Response(cachedAudio.slice(0).buffer, {
              status: 200,
              headers: {
                "Content-Type": "audio/mpeg",
                "Cache-Control": "public, max-age=86400",
              },
            });
          }

          const chunks = splitTextIntoChunks(text, 185);
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 2200);

          let buffers: ArrayBuffer[];
          try {
            buffers = await Promise.all(
              chunks.map(async (chunk) => {
                const ttsUrl = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(chunk)}&tl=${encodeURIComponent(lang)}&client=tw-ob`;
                const res = await fetch(ttsUrl, {
                  headers: {
                    "User-Agent": USER_AGENT,
                    Referer: "https://translate.google.com/",
                  },
                  signal: controller.signal,
                });

                if (!res.ok) {
                  throw new Error(`TTS upstream status ${res.status}`);
                }
                return res.arrayBuffer();
              }),
            );
          } finally {
            clearTimeout(timeoutId);
          }

          const totalLength = buffers.reduce((acc, b) => acc + b.byteLength, 0);
          const combined = new Uint8Array(totalLength);
          let offset = 0;
          for (const b of buffers) {
            combined.set(new Uint8Array(b), offset);
            offset += b.byteLength;
          }

          if (combined.byteLength > 0) {
            if (serverTtsCache.size >= MAX_SERVER_TTS_CACHE) {
              const firstKey = serverTtsCache.keys().next().value;
              if (firstKey) serverTtsCache.delete(firstKey);
            }
            serverTtsCache.set(cacheKey, combined);
          }

          return new Response(combined.buffer, {
            status: 200,
            headers: {
              "Content-Type": "audio/mpeg",
              "Cache-Control": "public, max-age=86400",
            },
          });
        } catch (err) {
          console.error("[api/tts error]", err);
          return new Response("Error al generar voz en español latino", { status: 502 });
        }
      },
    },
  },
});
