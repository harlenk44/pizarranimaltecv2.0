import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/tts")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const url = new URL(request.url);
          const rawText = url.searchParams.get("text") || "Atención";
          const text = rawText.trim().slice(0, 200);
          const lang = url.searchParams.get("lang") || "es";

          const ttsUrl = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(text)}&tl=${encodeURIComponent(lang)}&client=tw-ob`;

          const res = await fetch(ttsUrl, {
            headers: {
              "User-Agent":
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
              Referer: "https://translate.google.com/",
            },
          });

          if (!res.ok) {
            return new Response("TTS upstream error", { status: 502 });
          }

          const audioBuffer = await res.arrayBuffer();

          return new Response(audioBuffer, {
            status: 200,
            headers: {
              "Content-Type": "audio/mpeg",
              "Cache-Control": "public, max-age=86400",
            },
          });
        } catch (err) {
          console.error("[api/tts error]", err);
          return new Response("Error al generar voz en español", { status: 500 });
        }
      },
    },
  },
});
