// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import type { Plugin } from "vite";

if (process.argv.includes("build") && !process.env.VITEST) {
  process.env.NODE_ENV = "production";
}

const isHmrDisabled =
  process.env.DISABLE_HMR === "true" ||
  Boolean(process.env.K_SERVICE && process.env.APP_URL?.includes(".run.app"));

async function buildFallbackIndexHtml(distDir: string): Promise<string | null> {
  try {
    const assetsDir = path.join(distDir, "assets");
    const files = await fs.readdir(assetsDir);
    const indexJs = files.find((f) => /^index-[A-Za-z0-9_-]+\.js$/.test(f));
    const stylesCss = files.find((f) => /^styles-[A-Za-z0-9_-]+\.css$/.test(f));
    if (!indexJs) return null;

    return `<!DOCTYPE html><html lang="es"><head><meta charSet="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/>${
      stylesCss
        ? `<link rel="stylesheet" href="/assets/${stylesCss}" data-precedence="default"/>`
        : ""
    }<title>pizarraianimaltec - Resultados de Lotería en Vivo</title><meta name="description" content="Resultados diarios y semanales de loterías de animalitos en pizarra en vivo - pizarraianimaltec."/><meta name="theme-color" content="#020617"/><link rel="manifest" href="/manifest.json"/><link rel="apple-touch-icon" href="/apple-touch-icon.png"/><link rel="icon" href="/favicon.ico" type="image/x-icon"/><link rel="icon" href="/icon.svg" type="image/svg+xml"/></head><body><div class="min-h-screen bg-slate-950"></div><script type="module" async="" src="/assets/${indexJs}"></script></body></html>`;
  } catch {
    return null;
  }
}

function cloudflareStaticShellPlugin(): Plugin {
  return {
    name: "pizarra-cloudflare-static-shell",
    apply: "build",
    enforce: "post",
    buildApp: {
      order: "post",
      async handler() {
        const distDir = path.resolve(process.cwd(), "dist");
        const workerEntry = path.join(distDir, "_worker.js", "index.js");
        let generatedHtml: string | null = null;

        try {
          await fs.access(workerEntry);
          const workerMod = await import(pathToFileURL(workerEntry).href);
          const handler = workerMod.default ?? workerMod;
          if (handler && typeof handler.fetch === "function") {
            const req = new Request("https://pizarraanimal.servhm.com/", {
              method: "GET",
              headers: { Accept: "text/html" },
            });
            const ctx = {
              waitUntil() {},
              passThroughOnException() {},
            };
            const res = await handler.fetch(req, {}, ctx);
            const html = await res.text();
            if (res.status === 200 && html.includes("<html")) {
              generatedHtml = html;
            }
          }
        } catch (err) {
          console.warn("[pizarra-cloudflare-static-shell] SSR shell render fallback:", err);
        }

        if (!generatedHtml) {
          generatedHtml = await buildFallbackIndexHtml(distDir);
        }

        if (generatedHtml) {
          await fs.writeFile(path.join(distDir, "index.html"), generatedHtml, "utf8");
          await fs.writeFile(path.join(distDir, "200.html"), generatedHtml, "utf8");
          await fs.writeFile(path.join(distDir, "404.html"), generatedHtml, "utf8");
          console.log(
            `[pizarra-cloudflare-static-shell] Generated dist/index.html (${generatedHtml.length} bytes)`,
          );
        }

        try {
          const routesJsonPath = path.join(distDir, "_routes.json");
          const routesConfig = {
            version: 1,
            include: ["/api/*"],
            exclude: [],
          };
          await fs.writeFile(routesJsonPath, `${JSON.stringify(routesConfig, null, 2)}\n`, "utf8");
        } catch (err) {
          console.warn("[pizarra-cloudflare-static-shell] Failed writing _routes.json:", err);
        }
      },
    },
  };
}

export default defineConfig({
  plugins: [cloudflareStaticShellPlugin()],
  vite: {
    server: {
      host: "0.0.0.0",
      port: 3000,
      ...(isHmrDisabled ? { hmr: false } : {}),
      warmup: {
        clientFiles: ["./src/router.tsx", "./src/routes/index.tsx"],
      },
    },
    optimizeDeps: {
      entries: ["src/router.tsx", "src/routes/index.tsx"],
      include: [
        "react",
        "react-dom",
        "react-dom/client",
        "react/jsx-runtime",
        "react/jsx-dev-runtime",
        "@tanstack/react-query",
        "@supabase/supabase-js",
        "@radix-ui/react-select",
        "@radix-ui/react-slot",
        "@radix-ui/react-dialog",
        "@radix-ui/react-tabs",
        "@radix-ui/react-tooltip",
        "@radix-ui/react-dropdown-menu",
        "@radix-ui/react-label",
        "@radix-ui/react-switch",
        "class-variance-authority",
        "clsx",
        "tailwind-merge",
        "lucide-react",
        "zod",
        "sonner",
        "date-fns",
      ],
    },
  },
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
});
