import { createFileRoute } from "@tanstack/react-router";
import fs from "fs";
import path from "path";

const TMP_MEDIA_DIR = "/tmp/lottery_media";
const WORKSPACE_MEDIA_DIR = path.join(process.cwd(), "public", "uploads");
const TMP_ADS_STORE_FILE = "/tmp/lottery_ads_store.json";
const WORKSPACE_ADS_STORE_FILE = path.join(process.cwd(), "ads_store.persisted.json");

for (const dir of [TMP_MEDIA_DIR, WORKSPACE_MEDIA_DIR]) {
  if (!fs.existsSync(dir)) {
    try {
      fs.mkdirSync(dir, { recursive: true });
    } catch {
      // ignore
    }
  }
}

function readAdsStore() {
  for (const file of [TMP_ADS_STORE_FILE, WORKSPACE_ADS_STORE_FILE]) {
    try {
      if (fs.existsSync(file)) {
        const parsed = JSON.parse(fs.readFileSync(file, "utf-8"));
        if (parsed && Array.isArray(parsed.ads) && parsed.ads.length > 0) {
          return parsed;
        }
      }
    } catch {
      // ignore
    }
  }
  for (const file of [TMP_ADS_STORE_FILE, WORKSPACE_ADS_STORE_FILE]) {
    try {
      if (fs.existsSync(file)) {
        return JSON.parse(fs.readFileSync(file, "utf-8"));
      }
    } catch {
      // ignore
    }
  }
  return {
    ads: [],
    ticker: {
      enabled: false,
      text: "¡Bienvenidos! Consulta los resultados de animalitos en vivo · Pagos al instante",
      bgColor: "#1e3a8a",
      textColor: "#ffffff",
      speedSeconds: 25,
      carouselIntervalSeconds: 8,
    },
  };
}

function writeAdsStore(data: unknown) {
  const serialized = JSON.stringify(data, null, 2);
  for (const file of [TMP_ADS_STORE_FILE, WORKSPACE_ADS_STORE_FILE]) {
    try {
      fs.writeFileSync(file, serialized);
    } catch {
      // ignore if read-only in production container
    }
  }
}

function getMimeType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  switch (ext) {
    case ".mp4":
      return "video/mp4";
    case ".webm":
      return "video/webm";
    case ".ogg":
    case ".ogv":
      return "video/ogg";
    case ".mov":
      return "video/quicktime";
    case ".png":
      return "image/png";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".gif":
      return "image/gif";
    case ".webp":
      return "image/webp";
    case ".svg":
      return "image/svg+xml";
    default:
      return "application/octet-stream";
  }
}

export const Route = createFileRoute("/api/media")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        if (url.searchParams.get("store") === "ads") {
          return Response.json(readAdsStore());
        }
        const fileName = url.searchParams.get("file");
        if (!fileName) {
          return new Response("Missing file parameter", { status: 400 });
        }

        // Sanitize file name to prevent directory traversal
        const safeName = path.basename(fileName);
        const candidates = [
          path.join(TMP_MEDIA_DIR, safeName),
          path.join(WORKSPACE_MEDIA_DIR, safeName),
        ];
        const fullPath = candidates.find((p) => fs.existsSync(p));

        if (!fullPath) {
          return new Response("File not found", { status: 404 });
        }

        const stat = fs.statSync(fullPath);
        const mimeType = getMimeType(fullPath);

        // Handle HTTP Range requests for smooth video streaming on Smart TVs and browsers
        const range = request.headers.get("range");
        if (range && mimeType.startsWith("video/")) {
          const parts = range.replace(/bytes=/, "").split("-");
          const start = parseInt(parts[0] ?? "0", 10);
          const end = parts[1] ? parseInt(parts[1], 10) : stat.size - 1;
          const chunkSize = end - start + 1;
          const buffer = Buffer.alloc(chunkSize);
          const fd = fs.openSync(fullPath, "r");
          fs.readSync(fd, buffer, 0, chunkSize, start);
          fs.closeSync(fd);

          return new Response(buffer, {
            status: 206,
            headers: {
              "Content-Range": `bytes ${start}-${end}/${stat.size}`,
              "Accept-Ranges": "bytes",
              "Content-Length": String(chunkSize),
              "Content-Type": mimeType,
              "Cache-Control": "public, max-age=31536000, immutable",
            },
          });
        }

        const data = fs.readFileSync(fullPath);
        return new Response(data, {
          status: 200,
          headers: {
            "Content-Type": mimeType,
            "Content-Length": String(stat.size),
            "Accept-Ranges": "bytes",
            "Cache-Control": "public, max-age=31536000, immutable",
          },
        });
      },
      POST: async ({ request }) => {
        try {
          const contentType = request.headers.get("content-type") || "";
          let fileName = "";
          let buffer: Buffer;

          if (contentType.includes("application/json")) {
            const body = await request.json();
            const rawDataUrl = body.dataUrl || body.data;
            const requestedName = body.name || `media-${Date.now()}`;

            if (!rawDataUrl || typeof rawDataUrl !== "string") {
              return Response.json({ error: "Missing dataUrl" }, { status: 400 });
            }

            const matches = rawDataUrl.match(/^data:([^;]+);base64,(.+)$/);
            if (!matches || !matches[2]) {
              return Response.json({ error: "Invalid dataUrl format" }, { status: 400 });
            }

            buffer = Buffer.from(matches[2], "base64");
            const extFromMime = matches[1]?.split("/")[1] || "png";
            const ext = requestedName.includes(".")
              ? path.extname(requestedName)
              : `.${extFromMime}`;
            fileName = `${path.basename(requestedName, ext)}-${Date.now()}${ext}`;
          } else {
            const formData = await request.formData();
            const file = formData.get("file") as File | null;
            if (!file) {
              return Response.json({ error: "Missing file" }, { status: 400 });
            }
            const arrayBuf = await file.arrayBuffer();
            buffer = Buffer.from(arrayBuf);
            const ext = path.extname(file.name) || ".png";
            fileName = `${path.basename(file.name, ext)}-${Date.now()}${ext}`;
          }

          const safeName = path.basename(fileName).replace(/[^a-zA-Z0-9._-]/g, "_");
          for (const dir of [TMP_MEDIA_DIR, WORKSPACE_MEDIA_DIR]) {
            try {
              fs.writeFileSync(path.join(dir, safeName), buffer);
            } catch {
              // ignore if read-only
            }
          }

          return Response.json({
            status: "ok",
            fileName: safeName,
            url: `/api/media?file=${encodeURIComponent(safeName)}`,
          });
        } catch (err) {
          console.error("Error saving media:", err);
          return Response.json(
            {
              error: "Error saving media",
              details: err instanceof Error ? err.message : String(err),
            },
            { status: 500 },
          );
        }
      },
      PUT: async ({ request }) => {
        try {
          const body = await request.json();
          const current = readAdsStore();
          const next = {
            ads: Array.isArray(body.ads) ? body.ads : current.ads,
            ticker:
              body.ticker && typeof body.ticker === "object"
                ? { ...current.ticker, ...body.ticker }
                : current.ticker,
          };
          writeAdsStore(next);
          return Response.json({ status: "ok", ...next });
        } catch (err) {
          return Response.json(
            { error: "Error saving ads store", details: String(err) },
            { status: 500 },
          );
        }
      },
    },
  },
});
