import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

async function main() {
  const distDir = path.resolve(process.cwd(), "dist");
  const workerEntry = path.join(distDir, "_worker.js", "index.js");

  try {
    await fs.access(workerEntry);
  } catch {
    console.warn(
      "[postbuild-cf] dist/_worker.js/index.js not found, skipping static HTML generation.",
    );
    return;
  }

  // 1. Pre-render the root SPA shell ("/") into dist/index.html and dist/404.html
  //    so Cloudflare Pages serves the app directly from Static CDN (0 Worker requests,
  //    works even when the 100k daily Worker request limit is reached).
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
      await fs.writeFile(path.join(distDir, "index.html"), html, "utf8");
      await fs.writeFile(path.join(distDir, "200.html"), html, "utf8");
      await fs.writeFile(path.join(distDir, "404.html"), html, "utf8");
      console.log(`[postbuild-cf] Generated static dist/index.html (${html.length} bytes)`);
    } else {
      throw new Error(
        `[postbuild-cf] Unexpected SSR response while generating dist/index.html: status=${res.status}`,
      );
    }
  }

  // 2. Restrict Cloudflare Pages Worker invocation strictly to /api/* routes.
  //    All frontend routes (/ and static assets) are served directly by Cloudflare Pages CDN
  //    without invoking the Worker.
  const routesJsonPath = path.join(distDir, "_routes.json");
  const routesConfig = {
    version: 1,
    include: ["/api/*"],
    exclude: [],
  };
  await fs.writeFile(routesJsonPath, `${JSON.stringify(routesConfig, null, 2)}\n`, "utf8");
  console.log('[postbuild-cf] Updated dist/_routes.json to route only "/api/*" to Worker');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
