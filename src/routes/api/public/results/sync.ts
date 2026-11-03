import { createFileRoute } from "@tanstack/react-router";
import { mockStore } from "@/lib/mock-db";
import type { ClientLicense } from "@/lib/types";
import { TRIPLE_GAMES, buildTripleAlertItem, type TripleResult } from "@/lib/triples";
import {
  getDefaultGameScheduleTimes,
  getGameScheduleTimes,
  normalizeScheduleTime,
} from "@/lib/game-schedules";
import fs from "fs";

const RESULTS_FILE = "/tmp/lottery_results.json";
const TRIPLE_RESULTS_FILE = "/tmp/lottery_triples_results.json";
const LATEST_ALERT_FILE = "/tmp/lottery_latest_alert.json";
const ANIMAL_IMAGES_FILE = "/tmp/lottery_animal_images.json";
const GAMES_FILE = "/tmp/lottery_games.json";
const CLIENT_LICENSES_FILE = "/tmp/lottery_client_licenses_v2.json";

let serverTripleResults: TripleResult[] = [];

function loadServerTripleResults() {
  try {
    if (fs.existsSync(TRIPLE_RESULTS_FILE)) {
      const data = JSON.parse(fs.readFileSync(TRIPLE_RESULTS_FILE, "utf-8"));
      if (Array.isArray(data)) {
        serverTripleResults = data;
      }
    }
  } catch {
    // ignore
  }
}

function saveServerTripleResults() {
  try {
    fs.writeFileSync(TRIPLE_RESULTS_FILE, JSON.stringify(serverTripleResults));
  } catch {
    // ignore
  }
}

interface ServerLicenseState {
  requireLicense: boolean;
  licenses: ClientLicense[];
}

let serverLicenseState: ServerLicenseState = {
  requireLicense: true,
  licenses: [
    {
      id: "lic-master-admin",
      client_name: "Administrador Maestro",
      pin_code: "291007",
      status: "active",
      expires_at: new Date(Date.now() + 3650 * 86400000).toISOString(),
      max_devices: 999,
      bound_device_ids: [],
      notes: "PIN Maestro: 291007",
      created_at: new Date().toISOString(),
    },
  ],
};

function loadServerLicenses() {
  try {
    if (fs.existsSync(CLIENT_LICENSES_FILE)) {
      const parsed = JSON.parse(fs.readFileSync(CLIENT_LICENSES_FILE, "utf-8"));
      if (parsed && typeof parsed === "object") {
        serverLicenseState = {
          requireLicense: Boolean(parsed.requireLicense),
          licenses: Array.isArray(parsed.licenses) ? parsed.licenses : serverLicenseState.licenses,
        };
      }
    }
    // Guarantee that master PIN 291007 is always active and present
    if (!serverLicenseState.licenses.some((l) => l.pin_code === "291007")) {
      serverLicenseState.licenses.unshift({
        id: "lic-master-admin",
        client_name: "Administrador Maestro",
        pin_code: "291007",
        status: "active",
        expires_at: new Date(Date.now() + 3650 * 86400000).toISOString(),
        max_devices: 999,
        bound_device_ids: [],
        notes: "PIN Maestro: 291007",
        created_at: new Date().toISOString(),
      });
      saveServerLicenses();
    }
  } catch {
    // ignore
  }
}

function saveServerLicenses() {
  try {
    fs.writeFileSync(CLIENT_LICENSES_FILE, JSON.stringify(serverLicenseState));
  } catch {
    // ignore
  }
}

function sanitizeResultsList(results: unknown[]): typeof mockStore.results {
  if (!Array.isArray(results)) return [];
  return results.filter((r) => {
    if (!r || typeof r !== "object") return false;
    const res = r as { game_id?: string; draw_time?: string };
    if (!res.game_id || !res.draw_time) return false;
    const game = mockStore.games.find((g) => g.id === res.game_id);
    if (!game) return true;
    const validSchedule = new Set(
      getGameScheduleTimes(game).map((t) => normalizeScheduleTime(t) ?? t),
    );
    const normDraw = normalizeScheduleTime(res.draw_time) ?? res.draw_time;
    return validSchedule.has(normDraw);
  });
}

function loadServerResults() {
  try {
    if (fs.existsSync(RESULTS_FILE)) {
      const data = JSON.parse(fs.readFileSync(RESULTS_FILE, "utf-8"));
      if (Array.isArray(data) && data.length > 0) {
        mockStore.results = sanitizeResultsList(data);
        if (mockStore.results.length !== data.length) {
          fs.writeFileSync(RESULTS_FILE, JSON.stringify(mockStore.results));
        }
      }
    }
  } catch {
    // ignore
  }
}

function saveServerResults() {
  try {
    mockStore.results = sanitizeResultsList(mockStore.results);
    fs.writeFileSync(RESULTS_FILE, JSON.stringify(mockStore.results));
  } catch {
    // ignore
  }
}

function loadServerAnimalImages() {
  try {
    if (fs.existsSync(ANIMAL_IMAGES_FILE)) {
      const data = JSON.parse(fs.readFileSync(ANIMAL_IMAGES_FILE, "utf-8"));
      if (Array.isArray(data) && data.length > 0) {
        mockStore.animal_images = data;
      }
    }
  } catch {
    // ignore
  }
}

function saveServerAnimalImages() {
  try {
    fs.writeFileSync(ANIMAL_IMAGES_FILE, JSON.stringify(mockStore.animal_images));
  } catch {
    // ignore
  }
}

function loadServerGames() {
  try {
    if (fs.existsSync(GAMES_FILE)) {
      const data = JSON.parse(fs.readFileSync(GAMES_FILE, "utf-8"));
      if (Array.isArray(data) && data.length > 0) {
        for (const savedGame of data) {
          const idx = mockStore.games.findIndex(
            (g) => g.id === savedGame.id || g.slug === savedGame.slug,
          );
          if (idx >= 0) {
            const existing = mockStore.games[idx];
            const defaultSchedule = getDefaultGameScheduleTimes(
              existing?.slug ?? savedGame?.slug ?? "",
            );
            mockStore.games[idx] = {
              ...existing,
              ...savedGame,
              schedule_times:
                Array.isArray(savedGame.schedule_times) && savedGame.schedule_times.length > 0
                  ? savedGame.schedule_times
                  : (existing?.schedule_times ?? defaultSchedule),
            };
          } else {
            const defaultSchedule = getDefaultGameScheduleTimes(savedGame?.slug ?? "");
            mockStore.games.push({
              ...savedGame,
              schedule_times:
                Array.isArray(savedGame.schedule_times) && savedGame.schedule_times.length > 0
                  ? savedGame.schedule_times
                  : defaultSchedule,
            });
          }
        }
      }
    }
  } catch {
    // ignore
  }
}

function saveServerGames() {
  try {
    fs.writeFileSync(GAMES_FILE, JSON.stringify(mockStore.games));
  } catch {
    // ignore
  }
}

loadServerResults();
loadServerTripleResults();
loadServerAnimalImages();
loadServerGames();
loadServerLicenses();

let lastAutoSyncTimestamp = 0;
let isAutoSyncing = false;
const AUTO_SYNC_INTERVAL_MS = 15_000;

async function triggerBackgroundSync(forceWait = false) {
  const now = Date.now();
  if (isAutoSyncing) return;
  if (!forceWait && now - lastAutoSyncTimestamp < AUTO_SYNC_INTERVAL_MS) return;

  isAutoSyncing = true;
  lastAutoSyncTimestamp = now;

  try {
    loadServerGames();
    loadServerResults();
    loadServerTripleResults();
    loadServerAnimalImages();
    const prevCount = mockStore.results.length;
    const hadPriorTriples = serverTripleResults.length > 0;

    const [{ synchronizeAutomaticResults }, { synchronizeAutomaticTriplesResults }] =
      await Promise.all([
        import("@/lib/result-sync.server"),
        import("@/lib/triples-sync.server"),
      ]);

    const [reports, triplesSync] = await Promise.all([
      synchronizeAutomaticResults(),
      synchronizeAutomaticTriplesResults(serverTripleResults),
    ]);

    saveServerResults();

    serverTripleResults = triplesSync.merged;
    saveServerTripleResults();

    const anyWritten = reports.some((r) => r.written > 0) || mockStore.results.length > prevCount;
    if (anyWritten) {
      const latest = mockStore.results[mockStore.results.length - 1];
      if (latest) {
        const gameObj = mockStore.games.find((g) => g.id === latest.game_id);
        const exactImg = mockStore.animal_images.find(
          (img) =>
            (img.game_id === latest.game_id || (gameObj && img.game_id === gameObj.slug)) &&
            img.animal_number === latest.animal_number,
        );
        const fallbackImg = mockStore.animal_images.find(
          (img) => img.animal_number === latest.animal_number,
        );
        const alertPayload = {
          id: `auto-${latest.id || `${latest.game_id}-${latest.draw_date}-${latest.draw_time}`}`,
          gameId: latest.game_id,
          gameName: gameObj?.name || "Lotería",
          gameColor: gameObj?.color || "#10b981",
          gameLogoUrl: gameObj?.logo_url,
          drawDate: latest.draw_date,
          drawTime: latest.draw_time,
          animalNumber: latest.animal_number,
          animalName: latest.animal_name,
          animalImageUrl: exactImg?.image_url ?? fallbackImg?.image_url ?? null,
        };
        try {
          fs.writeFileSync(LATEST_ALERT_FILE, JSON.stringify(alertPayload));
        } catch {
          // ignore
        }
      }
    } else if (hadPriorTriples && triplesSync.newlyAdded.length > 0) {
      const latestTriple = triplesSync.newlyAdded[triplesSync.newlyAdded.length - 1];
      if (latestTriple) {
        const tripleGame = TRIPLE_GAMES.find((g) => g.id === latestTriple.game_id);
        if (tripleGame) {
          const alertPayload = buildTripleAlertItem(latestTriple, tripleGame);
          try {
            fs.writeFileSync(LATEST_ALERT_FILE, JSON.stringify(alertPayload));
          } catch {
            // ignore
          }
        }
      }
    }
  } catch (err) {
    console.warn("[auto-sync-warn]", err);
  } finally {
    isAutoSyncing = false;
  }
}

// Background scheduler so external lotteries are checked continuously even between active page polls
if (typeof setInterval !== "undefined") {
  setInterval(() => {
    triggerBackgroundSync(false).catch(() => {});
  }, AUTO_SYNC_INTERVAL_MS);
}

export const Route = createFileRoute("/api/public/results/sync")({
  server: {
    handlers: {
      GET: async () => {
        loadServerResults();
        loadServerTripleResults();
        loadServerAnimalImages();
        loadServerGames();
        loadServerLicenses();
        const monjeGame = mockStore.games.find((g) => g.slug === "monje-millonario");
        const monjeCount = monjeGame
          ? mockStore.results.filter((r) => r.game_id === monjeGame.id).length
          : 0;

        const needsImmediateSync =
          mockStore.results.length === 0 ||
          serverTripleResults.length === 0 ||
          (monjeGame && monjeCount < 6);

        if (needsImmediateSync) {
          await triggerBackgroundSync(true);
        } else {
          // Asynchronous continuous sync in background
          triggerBackgroundSync(false).catch(() => {});
        }

        let latestAlert = null;
        try {
          if (fs.existsSync(LATEST_ALERT_FILE)) {
            latestAlert = JSON.parse(fs.readFileSync(LATEST_ALERT_FILE, "utf-8"));
          }
        } catch {
          // ignore
        }

        return Response.json({
          status: "ok",
          results: mockStore.results,
          tripleResults: serverTripleResults,
          latestAlert,
          animalImages: mockStore.animal_images,
          games: mockStore.games,
          requireLicense: serverLicenseState.requireLicense,
          clientLicenses: serverLicenseState.licenses,
        });
      },
      POST: async ({ request }) => {
        if (process.env["SUPABASE_URL"]) {
          const { authenticateCronRequest } = await import("@/integrations/supabase/cron-auth");
          const authFailure = await authenticateCronRequest(request);
          if (authFailure) return authFailure;
        }
        try {
          loadServerGames();
          loadServerTripleResults();
          const [{ synchronizeAutomaticResults }, { synchronizeAutomaticTriplesResults }] =
            await Promise.all([
              import("@/lib/result-sync.server"),
              import("@/lib/triples-sync.server"),
            ]);
          const [reports, triplesSync] = await Promise.all([
            synchronizeAutomaticResults(),
            synchronizeAutomaticTriplesResults(serverTripleResults),
          ]);
          saveServerResults();
          serverTripleResults = triplesSync.merged;
          saveServerTripleResults();
          return Response.json({
            reports,
            results: mockStore.results,
            tripleResults: serverTripleResults,
          });
        } catch (err) {
          console.error("[sync-error]", err);
          return Response.json(
            {
              error: "No se pudo sincronizar",
              details: err instanceof Error ? err.message : String(err),
            },
            { status: 500 },
          );
        }
      },
      PUT: async ({ request }) => {
        try {
          loadServerLicenses();
          loadServerTripleResults();
          const body = await request.json();
          const {
            result,
            tripleResult,
            deleteTripleId,
            alert,
            animalImage,
            deleteAnimalImage,
            gameUpdate,
            licenseAction,
          } = body;
          let licenseActivation: {
            valid: boolean;
            reason?: string;
            license?: ClientLicense;
          } | null = null;

          if (licenseAction && typeof licenseAction === "object") {
            const act = licenseAction as {
              type: string;
              requireLicense?: boolean;
              id?: string;
              client_name?: string;
              pin_code?: string;
              days?: number | null;
              max_devices?: number;
              notes?: string;
              device_id?: string;
            };

            if (act.type === "toggle_enforcement") {
              serverLicenseState.requireLicense = Boolean(act.requireLicense);
              saveServerLicenses();
            } else if (act.type === "create") {
              const cleanPin =
                (act.pin_code || "").replace(/[^0-9]/g, "").slice(0, 6) ||
                String(Math.floor(100000 + Math.random() * 900000));
              const expiresAt =
                typeof act.days === "number" && act.days > 0
                  ? new Date(Date.now() + act.days * 86400000).toISOString()
                  : null;
              const newLic: ClientLicense = {
                id: `lic-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                client_name: (act.client_name || "Cliente").trim(),
                pin_code: cleanPin,
                status: "active",
                expires_at: expiresAt,
                max_devices: Math.max(1, Number(act.max_devices) || 1),
                bound_device_ids: [],
                notes: act.notes?.trim() || "",
                created_at: new Date().toISOString(),
              };
              serverLicenseState.licenses.unshift(newLic);
              saveServerLicenses();
            } else if (act.type === "renew" && act.id) {
              const target = serverLicenseState.licenses.find((l) => l.id === act.id);
              if (target) {
                if (act.days === null) {
                  target.expires_at = null;
                } else {
                  const daysToAdd = Number(act.days) || 30;
                  const baseDate =
                    target.expires_at && new Date(target.expires_at) > new Date()
                      ? new Date(target.expires_at)
                      : new Date();
                  target.expires_at = new Date(
                    baseDate.getTime() + daysToAdd * 86400000,
                  ).toISOString();
                }
                target.status = "active";
                saveServerLicenses();
              }
            } else if (act.type === "toggle_status" && act.id) {
              const target = serverLicenseState.licenses.find((l) => l.id === act.id);
              if (target) {
                target.status = target.status === "active" ? "paused" : "active";
                saveServerLicenses();
              }
            } else if (act.type === "reset_devices" && act.id) {
              const target = serverLicenseState.licenses.find((l) => l.id === act.id);
              if (target) {
                target.bound_device_ids = [];
                saveServerLicenses();
              }
            } else if (act.type === "delete" && act.id) {
              serverLicenseState.licenses = serverLicenseState.licenses.filter(
                (l) => l.id !== act.id,
              );
              saveServerLicenses();
            } else if (act.type === "activate_pin") {
              const cleanPin = (act.pin_code || "").replace(/[^0-9]/g, "");
              const devId = (act.device_id || "TV-DEFAULT").trim();
              if (cleanPin === "291007") {
                licenseActivation = {
                  valid: true,
                  license: {
                    id: "lic-master-admin",
                    client_name: "Administrador Maestro",
                    pin_code: "291007",
                    status: "active",
                    expires_at: new Date(Date.now() + 3650 * 86400000).toISOString(),
                    max_devices: 999,
                    bound_device_ids: [devId],
                    notes: "PIN Maestro: 291007",
                    created_at: new Date().toISOString(),
                  },
                };
              } else {
                const match = serverLicenseState.licenses.find((l) => l.pin_code === cleanPin);

                if (!match) {
                  licenseActivation = {
                    valid: false,
                    reason: "Código PIN inválido. Verifique los 6 dígitos con su proveedor.",
                  };
              } else if (match.status === "paused") {
                licenseActivation = {
                  valid: false,
                  reason: "Esta licencia se encuentra suspendida temporalmente.",
                };
              } else if (match.expires_at && new Date(match.expires_at) < new Date()) {
                licenseActivation = {
                  valid: false,
                  reason: "Su suscripción ha vencido. Contacte al administrador para renovar.",
                };
              } else {
                const alreadyBound = match.bound_device_ids.includes(devId);
                if (!alreadyBound && match.bound_device_ids.length >= (match.max_devices || 1)) {
                  licenseActivation = {
                    valid: false,
                    reason: `Este PIN ya está en uso en el máximo de pantallas permitidas (${match.max_devices}). Solicite liberar la pantalla anterior.`,
                  };
                } else {
                  if (!alreadyBound) {
                    match.bound_device_ids.push(devId);
                    saveServerLicenses();
                  }
                  licenseActivation = {
                    valid: true,
                    license: match,
                  };
                }
              }
            }
          }
        }

          if (result) {
            const conflictIndex = mockStore.results.findIndex(
              (r) =>
                r.game_id === result.game_id &&
                r.draw_date === result.draw_date &&
                r.draw_time === result.draw_time,
            );
            if (conflictIndex >= 0) {
              mockStore.results[conflictIndex] = {
                ...mockStore.results[conflictIndex],
                ...result,
              };
            } else {
              mockStore.results.push({
                id: result.id ?? `res-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                ...result,
              });
            }
            saveServerResults();
          }

          if (tripleResult && typeof tripleResult === "object") {
            const tr = tripleResult as TripleResult;
            const conflictIdx = serverTripleResults.findIndex(
              (r) =>
                r.game_id === tr.game_id &&
                r.draw_date === tr.draw_date &&
                r.draw_time === tr.draw_time,
            );
            if (conflictIdx >= 0) {
              serverTripleResults[conflictIdx] = {
                ...serverTripleResults[conflictIdx],
                ...tr,
              };
            } else {
              serverTripleResults.push({
                ...tr,
                id: tr.id || `triple-${tr.game_id}-${tr.draw_date}-${tr.draw_time}`,
              });
            }
            saveServerTripleResults();
          }

          if (deleteTripleId && typeof deleteTripleId === "string") {
            serverTripleResults = serverTripleResults.filter((r) => r.id !== deleteTripleId);
            saveServerTripleResults();
          }

          if (gameUpdate) {
            const { id, loading_mode, mode, schedule_times, color, name, is_active, logo_url } =
              gameUpdate;
            const targetGame = mockStore.games.find((g) => g.id === id);
            if (targetGame) {
              if (mode !== undefined || loading_mode !== undefined) {
                const effectiveMode = (mode ?? loading_mode ?? "automatic") as
                  "manual" | "automatic";
                targetGame.loading_mode = effectiveMode;
                targetGame.mode = effectiveMode;
              }
              if (Array.isArray(schedule_times)) {
                targetGame.schedule_times = schedule_times;
              }
              if (color !== undefined) targetGame.color = color;
              if (name !== undefined) targetGame.name = name;
              if (is_active !== undefined) targetGame.is_active = is_active;
              if (logo_url !== undefined) targetGame.logo_url = logo_url;
              saveServerGames();
            }
          }

          if (animalImage) {
            const existingIdx = mockStore.animal_images.findIndex(
              (img) =>
                img.game_id === animalImage.game_id &&
                img.animal_number === animalImage.animal_number,
            );
            if (existingIdx >= 0) {
              mockStore.animal_images[existingIdx] = {
                ...mockStore.animal_images[existingIdx],
                ...animalImage,
              };
            } else {
              mockStore.animal_images.push({
                id: animalImage.id ?? `img-${animalImage.game_id}-${animalImage.animal_number}`,
                ...animalImage,
              });
            }
            saveServerAnimalImages();
          }

          if (deleteAnimalImage && typeof deleteAnimalImage === "object") {
            mockStore.animal_images = mockStore.animal_images.filter(
              (img) =>
                !(
                  img.game_id === deleteAnimalImage.game_id &&
                  img.animal_number === deleteAnimalImage.animal_number
                ),
            );
            saveServerAnimalImages();
          }

          if (alert) {
            try {
              fs.writeFileSync(LATEST_ALERT_FILE, JSON.stringify(alert));
            } catch {
              // ignore
            }
          }

          return Response.json({
            status: "ok",
            results: mockStore.results,
            tripleResults: serverTripleResults,
            animalImages: mockStore.animal_images,
            games: mockStore.games,
            requireLicense: serverLicenseState.requireLicense,
            clientLicenses: serverLicenseState.licenses,
            licenseActivation,
          });
        } catch (err) {
          return Response.json(
            { error: "Error updating result", details: String(err) },
            { status: 500 },
          );
        }
      },
    },
  },
});
