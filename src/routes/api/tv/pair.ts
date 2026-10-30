import { createFileRoute } from "@tanstack/react-router";
import fs from "fs";

interface PairingSession {
  code: string;
  email?: string;
  password?: string;
  authorized: boolean;
  expiresAt: number;
}

const SESSIONS_FILE = "/tmp/tv_pairing_sessions.json";

function loadSessions(): Map<string, PairingSession> {
  try {
    if (fs.existsSync(SESSIONS_FILE)) {
      const data = JSON.parse(fs.readFileSync(SESSIONS_FILE, "utf-8"));
      return new Map(Object.entries(data));
    }
  } catch {
    // ignore
  }
  return new Map();
}

function saveSessions(map: Map<string, PairingSession>) {
  try {
    const obj = Object.fromEntries(map.entries());
    fs.writeFileSync(SESSIONS_FILE, JSON.stringify(obj));
  } catch {
    // ignore
  }
}

function cleanExpiredSessions(map: Map<string, PairingSession>) {
  const now = Date.now();
  let changed = false;
  for (const [code, session] of map.entries()) {
    if (session.expiresAt < now) {
      map.delete(code);
      changed = true;
    }
  }
  if (changed) saveSessions(map);
}

function generateNumericCode(map: Map<string, PairingSession>): string {
  let code = String(Math.floor(100000 + Math.random() * 900000));
  while (map.has(code)) {
    code = String(Math.floor(100000 + Math.random() * 900000));
  }
  return code;
}

export const Route = createFileRoute("/api/tv/pair")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const pairingStore = loadSessions();
        cleanExpiredSessions(pairingStore);

        const url = new URL(request.url);
        const code = (url.searchParams.get("code") || "").replace(/[^0-9]/g, "");

        if (!code) {
          return Response.json({ error: "Código requerido" }, { status: 400 });
        }

        const session = pairingStore.get(code);
        if (!session) {
          return Response.json({ status: "not_found", authorized: false });
        }

        if (session.authorized) {
          // One-time consumption
          pairingStore.delete(code);
          saveSessions(pairingStore);
          return Response.json({
            status: "authorized",
            authorized: true,
            email: session.email,
            password: session.password || "admin123",
          });
        }

        return Response.json({ status: "pending", authorized: false });
      },
      POST: async ({ request }) => {
        const pairingStore = loadSessions();
        cleanExpiredSessions(pairingStore);

        try {
          const body = (await request.json()) as {
            action: "generate" | "authorize" | "cancel";
            code?: string;
            email?: string;
            password?: string;
          };

          if (body.action === "generate") {
            const code = generateNumericCode(pairingStore);
            const expiresAt = Date.now() + 30 * 60 * 1000; // 30 minutes
            pairingStore.set(code, {
              code,
              authorized: false,
              expiresAt,
            });
            saveSessions(pairingStore);

            const formatted = `${code.slice(0, 3)}-${code.slice(3)}`;
            return Response.json({
              status: "ok",
              code,
              formatted,
              expiresInSeconds: 1800,
            });
          }

          if (body.action === "authorize") {
            const rawCode = (body.code || "").replace(/[^0-9]/g, "");
            if (!rawCode || !body.email) {
              return Response.json(
                { error: "Código y correo electrónico requeridos" },
                { status: 400 },
              );
            }

            const existing = pairingStore.get(rawCode);
            if (!existing) {
              return Response.json(
                {
                  error:
                    "El código " +
                    rawCode +
                    " no existe o ha expirado. Por favor genera un nuevo código en el televisor.",
                },
                { status: 404 },
              );
            }

            existing.authorized = true;
            existing.email = body.email.trim().toLowerCase();
            existing.password = body.password || "admin123";
            pairingStore.set(rawCode, existing);
            saveSessions(pairingStore);

            return Response.json({
              status: "ok",
              message: "Televisor vinculado exitosamente a la cuenta " + body.email,
            });
          }

          return Response.json({ error: "Acción no válida" }, { status: 400 });
        } catch (err) {
          return Response.json(
            { error: "Error procesando solicitud", details: String(err) },
            { status: 500 },
          );
        }
      },
    },
  },
});
