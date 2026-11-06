import { createFileRoute } from "@tanstack/react-router";
import {
  mockStore,
  INITIAL_GAMES,
  mergeAnimalImagesPreserveCustom,
  isDefaultCatalogImageUrl,
} from "@/lib/mock-db";
import type { ClientLicense, AnimalImage } from "@/lib/types";
import { TRIPLE_GAMES, buildTripleAlertItem, type TripleResult } from "@/lib/triples";
import {
  getDefaultGameScheduleTimes,
  getGameScheduleTimes,
  normalizeScheduleTime,
} from "@/lib/game-schedules";
import fs from "fs";
import path from "path";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { resolveCanonicalAnimal, parseCanonicalAnimalNumber } from "@/lib/official-animals";

const RESULTS_FILE = "/tmp/lottery_results.json";
const TRIPLE_RESULTS_FILE = "/tmp/lottery_triples_results.json";
const LATEST_ALERT_FILE = "/tmp/lottery_latest_alert.json";
const ANIMAL_IMAGES_FILE = "/tmp/lottery_animal_images.json";
const WORKSPACE_ANIMAL_IMAGES_FILE = path.join(process.cwd(), "animal_images.persisted.json");
const GAMES_FILE = "/tmp/lottery_games.json";
const TMP_CLIENT_LICENSES_FILE = "/tmp/lottery_client_licenses_v2.json";
const WORKSPACE_CLIENT_LICENSES_FILE = path.join(process.cwd(), "client_licenses.persisted.json");

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
  deletedIds?: string[];
  deletedPins?: string[];
}

let serverLicenseState: ServerLicenseState = {
  requireLicense: true,
  licenses: [
    {
      id: "lic-exito-carupano-310148",
      client_name: "EXITO CARUPANO",
      pin_code: "310148",
      status: "active",
      expires_at: "2026-12-05T01:38:00.000Z",
      max_devices: 1,
      bound_device_ids: [],
      notes: "",
      created_at: "2026-11-05T01:38:00.000Z",
    },
    {
      id: "lic-mariana-108271",
      client_name: "Mariana",
      pin_code: "108271",
      status: "active",
      expires_at: "2026-12-05T01:38:00.000Z",
      max_devices: 1,
      bound_device_ids: [],
      notes: "",
      created_at: "2026-11-05T01:38:00.000Z",
    },
    {
      id: "lic-jose-barreto-770595",
      client_name: "José barreto",
      pin_code: "770595",
      status: "active",
      expires_at: "2026-12-05T01:38:00.000Z",
      max_devices: 1,
      bound_device_ids: [],
      notes: "",
      created_at: "2026-11-05T01:38:00.000Z",
    },
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
  deletedIds: [],
  deletedPins: [],
};

function loadServerLicenses() {
  try {
    for (const file of [WORKSPACE_CLIENT_LICENSES_FILE, TMP_CLIENT_LICENSES_FILE]) {
      if (fs.existsSync(file)) {
        const parsed = JSON.parse(fs.readFileSync(file, "utf-8"));
        if (parsed && typeof parsed === "object") {
          serverLicenseState = {
            requireLicense: Boolean(parsed.requireLicense),
            licenses:
              Array.isArray(parsed.licenses) && parsed.licenses.length > 0
                ? parsed.licenses
                : serverLicenseState.licenses,
            deletedIds: Array.isArray(parsed.deletedIds) ? parsed.deletedIds : [],
            deletedPins: Array.isArray(parsed.deletedPins) ? parsed.deletedPins : [],
          };
          break;
        }
      }
    }
    // Guarantee that master PIN 291007 is always active and present
    if (!serverLicenseState.licenses.some((l) => l.pin_code === "291007")) {
      serverLicenseState.licenses.push({
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
    const serialized = JSON.stringify(serverLicenseState, null, 2);
    // Persist to workspace project file so it survives container restarts
    fs.writeFileSync(WORKSPACE_CLIENT_LICENSES_FILE, serialized);
  } catch {
    // ignore
  }
  try {
    // Also keep in tmp for fast reading
    fs.writeFileSync(TMP_CLIENT_LICENSES_FILE, JSON.stringify(serverLicenseState));
  } catch {
    // ignore
  }
}

export async function syncLicensesWithSupabase() {
  try {
    const { data, error } = await supabaseAdmin.from("client_licenses").select("*");
    if (!error && Array.isArray(data)) {
      const mapped: ClientLicense[] = data.map((d: Record<string, unknown>) => ({
        id: String(d["id"]),
        client_name: String(d["client_name"] || "Cliente"),
        pin_code: String(d["pin_code"] || ""),
        status: d["status"] === "paused" ? "paused" : "active",
        expires_at: d["expires_at"] ? new Date(d["expires_at"] as string).toISOString() : null,
        max_devices: Number(d["max_devices"]) || 1,
        bound_device_ids: Array.isArray(d["bound_device_ids"])
          ? (d["bound_device_ids"] as string[])
          : [],
        notes: typeof d["notes"] === "string" ? d["notes"] : "",
        created_at: d["created_at"]
          ? new Date(d["created_at"] as string).toISOString()
          : new Date().toISOString(),
      }));

      // Safe bidirectional merge: combine Supabase and local persistent licenses by ID or PIN
      const deletedSet = new Set<string>(serverLicenseState.deletedIds || []);
      const deletedPinSet = new Set<string>(serverLicenseState.deletedPins || []);
      const mergedMap = new Map<string, ClientLicense>();
      // 1. Retain all local persistent licenses (excluding deleted ones)
      for (const lic of serverLicenseState.licenses) {
        if (!deletedSet.has(lic.id) && !deletedPinSet.has(lic.pin_code)) {
          mergedMap.set(lic.id, lic);
        }
      }
      // 2. Merge records from Supabase
      for (const sLic of mapped) {
        if (deletedSet.has(sLic.id) || deletedPinSet.has(sLic.pin_code)) {
          // Permanently cleanup deleted license from Supabase as well
          supabaseAdmin
            .from("client_licenses")
            .delete()
            .eq("id", sLic.id)
            .catch(() => {});
          continue;
        }
        const existing =
          mergedMap.get(sLic.id) ||
          Array.from(mergedMap.values()).find((l) => l.pin_code === sLic.pin_code);
        if (existing) {
          // Local server state (e.g. paused, renewed) has priority over Supabase's older status
          mergedMap.set(existing.id, {
            ...sLic,
            ...existing,
            bound_device_ids: Array.from(
              new Set([...existing.bound_device_ids, ...sLic.bound_device_ids]),
            ),
          });
        } else {
          mergedMap.set(sLic.id, sLic);
        }
      }
      // 3. Ensure master PIN is always present
      if (!Array.from(mergedMap.values()).some((l) => l.pin_code === "291007")) {
        mergedMap.set("lic-master-admin", {
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
      }

      serverLicenseState.licenses = Array.from(mergedMap.values());
      saveServerLicenses();

      // 4. Ensure any local licenses not yet in Supabase are uploaded
      for (const lic of serverLicenseState.licenses) {
        await supabaseAdmin
          .from("client_licenses")
          .upsert({
            id: lic.id,
            client_name: lic.client_name,
            pin_code: lic.pin_code,
            status: lic.status,
            expires_at: lic.expires_at,
            max_devices: lic.max_devices,
            bound_device_ids: lic.bound_device_ids,
            notes: lic.notes ?? "",
            created_at: lic.created_at,
          })
          .catch(() => {});
      }
    }
  } catch {
    // If Supabase table isn't created yet or network is offline, rely on persistent file
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
    let persistedWorkspace: AnimalImage[] = [];
    let persistedTmp: AnimalImage[] = [];

    if (fs.existsSync(WORKSPACE_ANIMAL_IMAGES_FILE)) {
      const parsed = JSON.parse(fs.readFileSync(WORKSPACE_ANIMAL_IMAGES_FILE, "utf-8"));
      if (Array.isArray(parsed)) {
        persistedWorkspace = parsed;
      }
    }
    if (fs.existsSync(ANIMAL_IMAGES_FILE)) {
      const parsed = JSON.parse(fs.readFileSync(ANIMAL_IMAGES_FILE, "utf-8"));
      if (Array.isArray(parsed)) {
        persistedTmp = parsed;
      }
    }

    if (persistedWorkspace.length > 0 || persistedTmp.length > 0) {
      mockStore.animal_images = mergeAnimalImagesPreserveCustom(
        mockStore.animal_images,
        persistedTmp,
        persistedWorkspace,
      );
    }
  } catch {
    // ignore
  }
}

function saveServerAnimalImages() {
  try {
    const customOnly = mockStore.animal_images.filter(
      (img) => !isDefaultCatalogImageUrl(img.image_url),
    );
    fs.writeFileSync(WORKSPACE_ANIMAL_IMAGES_FILE, JSON.stringify(customOnly, null, 2));
  } catch {
    // ignore
  }
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
    // Ensure all catalog games from INITIAL_GAMES are present
    for (const initGame of INITIAL_GAMES) {
      if (!mockStore.games.some((g) => g.id === initGame.id || g.slug === initGame.slug)) {
        mockStore.games.push({ ...initGame });
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
syncLicensesWithSupabase().catch(() => {});

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
    loadServerLicenses();
    const prevCount = mockStore.results.length;
    const hadPriorTriples = serverTripleResults.length > 0;

    const [
      { synchronizeAutomaticResults },
      { synchronizeAutomaticTriplesResults },
      { synchronizeMultiloteriasData, getCachedMultiloteriasItems },
    ] = await Promise.all([
      import("@/lib/result-sync.server"),
      import("@/lib/triples-sync.server"),
      import("@/lib/multiloterias-provider.server"),
    ]);

    const [reports, triplesSync, multiloteriasSync] = await Promise.all([
      synchronizeAutomaticResults(),
      synchronizeAutomaticTriplesResults(serverTripleResults),
      synchronizeMultiloteriasData(mockStore.results, serverTripleResults),
      syncLicensesWithSupabase().catch(() => null),
    ]);

    // Apply Multiloterias animal results if any
    if (
      multiloteriasSync.newAnimalCount > 0 ||
      multiloteriasSync.animalResults.length > mockStore.results.length
    ) {
      mockStore.results = sanitizeResultsList(multiloteriasSync.animalResults);
    }
    saveServerResults();

    // Merge triples from both LoteriaDeHoy/TuAzar and Multiloterias
    serverTripleResults = multiloteriasSync.tripleResults;
    for (const t of triplesSync.merged) {
      const exists = serverTripleResults.some(
        (st) =>
          st.game_id === t.game_id && st.draw_date === t.draw_date && st.draw_time === t.draw_time,
      );
      if (!exists) {
        serverTripleResults.push(t);
      }
    }
    saveServerTripleResults();

    // Ensure Multiloterias official images (including 37-48 for Lottopantera) are stored
    try {
      const [lotoItems, panteraItems] = await Promise.all([
        getCachedMultiloteriasItems("lotoanimalito"),
        getCachedMultiloteriasItems("lottopantera"),
      ]);
      let addedImgs = false;
      for (const item of lotoItems) {
        const num = parseCanonicalAnimalNumber("lotoanimalito", item.number, item.name);
        if (Number.isFinite(num) && item.imageUrl) {
          const gameId = "d953f80c-4335-4bc9-9f78-9b56193286fe";
          if (
            !mockStore.animal_images.some(
              (img) =>
                (img.game_id === gameId || img.game_id === "lotoanimalito") &&
                img.animal_number === num,
            )
          ) {
            mockStore.animal_images.push({
              id: `img-lotoanimalito-${num}`,
              game_id: gameId,
              animal_number: num,
              image_url: item.imageUrl,
            });
            addedImgs = true;
          }
        }
      }
      for (const item of panteraItems) {
        const num = parseCanonicalAnimalNumber("lottopantera", item.number, item.name);
        if (Number.isFinite(num) && item.imageUrl) {
          const gameId = "61580ccf-5a2d-4d10-877e-4883515135e4";
          if (
            !mockStore.animal_images.some(
              (img) =>
                (img.game_id === gameId || img.game_id === "lottopantera") &&
                img.animal_number === num,
            )
          ) {
            mockStore.animal_images.push({
              id: `img-lottopantera-${num}`,
              game_id: gameId,
              animal_number: num,
              image_url: item.imageUrl,
            });
            addedImgs = true;
          }
        }
      }
      if (addedImgs) {
        saveServerAnimalImages();
      }
    } catch {
      // ignore
    }

    const anyWritten =
      reports.some((r) => r.written > 0) ||
      multiloteriasSync.newAnimalCount > 0 ||
      mockStore.results.length > prevCount;
    if (anyWritten) {
      const latest = mockStore.results[mockStore.results.length - 1];
      if (latest) {
        const gameObj = mockStore.games.find((g) => g.id === latest.game_id);
        const canonical = resolveCanonicalAnimal(
          gameObj?.slug ?? latest.game_id,
          latest.animal_number,
          latest.animal_name,
        );
        const exactImg = mockStore.animal_images.find(
          (img) =>
            (img.game_id === latest.game_id || (gameObj && img.game_id === gameObj.slug)) &&
            img.animal_number === canonical.number,
        );
        const alertPayload = {
          id: `auto-${latest.id || `${latest.game_id}-${latest.draw_date}-${latest.draw_time}`}`,
          gameId: latest.game_id,
          gameName: gameObj?.name || "Lotería",
          gameColor: gameObj?.color || "#10b981",
          gameLogoUrl: gameObj?.logo_url,
          drawDate: latest.draw_date,
          drawTime: latest.draw_time,
          animalNumber: canonical.number,
          animalLabel: canonical.label,
          animalName: canonical.name,
          animalImageUrl: exactImg?.image_url ?? canonical.imageUrl ?? null,
        };
        try {
          fs.writeFileSync(LATEST_ALERT_FILE, JSON.stringify(alertPayload));
        } catch {
          // ignore
        }
      }
    } else if (
      (hadPriorTriples && triplesSync.newlyAdded.length > 0) ||
      multiloteriasSync.newTripleCount > 0
    ) {
      const latestTriple =
        triplesSync.newlyAdded[triplesSync.newlyAdded.length - 1] ||
        serverTripleResults[serverTripleResults.length - 1];
      if (latestTriple) {
        const tripleGame = TRIPLE_GAMES.find(
          (g) => g.id === latestTriple.game_id || g.slug === latestTriple.game_slug,
        );
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
        const serverToday = new Intl.DateTimeFormat("en-CA", {
          timeZone: "America/Caracas",
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
        }).format(new Date());

        const monjeGame = mockStore.games.find((g) => g.slug === "monje-millonario");
        const monjeCount = monjeGame
          ? mockStore.results.filter(
              (r) => r.game_id === monjeGame.id && r.draw_date === serverToday,
            ).length
          : 0;
        const todayResultsCount = mockStore.results.filter(
          (r) => r.draw_date === serverToday,
        ).length;

        const needsImmediateSync =
          todayResultsCount === 0 ||
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
          serverLotteryDate: serverToday,
          results: mockStore.results,
          tripleResults: serverTripleResults,
          latestAlert,
          animalImages: mockStore.animal_images,
          games: mockStore.games,
          requireLicense: serverLicenseState.requireLicense,
          clientLicenses: serverLicenseState.licenses,
          deletedIds: serverLicenseState.deletedIds || [],
          deletedPins: serverLicenseState.deletedPins || [],
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
          loadServerAnimalImages();
          const body = await request.json();
          const {
            result,
            tripleResult,
            deleteTripleId,
            alert,
            animalImage,
            animalImagesBatch,
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
              licenses?: ClientLicense[];
            };

            if (act.type === "toggle_enforcement") {
              serverLicenseState.requireLicense = Boolean(act.requireLicense);
              saveServerLicenses();
            } else if (act.type === "restore_batch" && Array.isArray(act.licenses)) {
              const deletedSet = new Set<string>(serverLicenseState.deletedIds || []);
              const deletedPinSet = new Set<string>(serverLicenseState.deletedPins || []);
              let addedAny = false;
              for (const cachedLic of act.licenses) {
                if (
                  !cachedLic ||
                  !cachedLic.pin_code ||
                  cachedLic.pin_code === "291007" ||
                  deletedSet.has(cachedLic.id) ||
                  deletedPinSet.has(cachedLic.pin_code)
                ) {
                  continue;
                }
                const alreadyExists = serverLicenseState.licenses.some(
                  (l) => l.id === cachedLic.id || l.pin_code === cachedLic.pin_code,
                );
                if (!alreadyExists) {
                  const restored: ClientLicense = {
                    id:
                      cachedLic.id || `lic-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                    client_name: (cachedLic.client_name || "Cliente").trim(),
                    pin_code: String(cachedLic.pin_code)
                      .replace(/[^0-9]/g, "")
                      .slice(0, 6),
                    status: cachedLic.status === "paused" ? "paused" : "active",
                    expires_at: cachedLic.expires_at || null,
                    max_devices: Math.max(1, Number(cachedLic.max_devices) || 1),
                    bound_device_ids: Array.isArray(cachedLic.bound_device_ids)
                      ? cachedLic.bound_device_ids
                      : [],
                    notes: cachedLic.notes || "",
                    created_at: cachedLic.created_at || new Date().toISOString(),
                  };
                  serverLicenseState.licenses.unshift(restored);
                  addedAny = true;
                  try {
                    await supabaseAdmin.from("client_licenses").upsert({
                      id: restored.id,
                      client_name: restored.client_name,
                      pin_code: restored.pin_code,
                      status: restored.status,
                      expires_at: restored.expires_at,
                      max_devices: restored.max_devices,
                      bound_device_ids: restored.bound_device_ids,
                      notes: restored.notes ?? "",
                      created_at: restored.created_at,
                    });
                  } catch {
                    // ignore
                  }
                }
              }
              if (addedAny) {
                saveServerLicenses();
              }
            } else if (act.type === "create") {
              const cleanPin =
                (act.pin_code || "").replace(/[^0-9]/g, "").slice(0, 6) ||
                String(Math.floor(100000 + Math.random() * 900000));
              const daysNum =
                act.days === null ? null : Math.max(1, Math.min(365, Number(act.days) || 30));
              const expiresAt =
                typeof daysNum === "number" && daysNum > 0
                  ? new Date(Date.now() + daysNum * 86400000).toISOString()
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
              if (serverLicenseState.deletedIds) {
                serverLicenseState.deletedIds = serverLicenseState.deletedIds.filter(
                  (id) => id !== newLic.id,
                );
              }
              if (serverLicenseState.deletedPins) {
                serverLicenseState.deletedPins = serverLicenseState.deletedPins.filter(
                  (pin) => pin !== cleanPin,
                );
              }
              serverLicenseState.licenses.unshift(newLic);
              saveServerLicenses();

              // Persistent write in Supabase
              try {
                await supabaseAdmin.from("client_licenses").upsert({
                  id: newLic.id,
                  client_name: newLic.client_name,
                  pin_code: newLic.pin_code,
                  status: newLic.status,
                  expires_at: newLic.expires_at,
                  max_devices: newLic.max_devices,
                  bound_device_ids: newLic.bound_device_ids,
                  notes: newLic.notes ?? "",
                  created_at: newLic.created_at,
                });
              } catch (err: unknown) {
                console.warn("[supabase-create-license-warn]", err);
              }
            } else if (act.type === "renew" && act.id) {
              const target = serverLicenseState.licenses.find((l) => l.id === act.id);
              if (target) {
                if (act.days === null) {
                  target.expires_at = null;
                } else {
                  const daysToAdd = Math.max(1, Math.min(365, Number(act.days) || 30));
                  const isStillActive =
                    target.expires_at && new Date(target.expires_at).getTime() > Date.now();
                  const baseDate = isStillActive ? new Date(target.expires_at) : new Date();
                  target.expires_at = new Date(
                    baseDate.getTime() + daysToAdd * 86400000,
                  ).toISOString();
                }
                target.status = "active";
                saveServerLicenses();

                // Update only expires_at and status in Supabase (preserving PIN, name, bound devices)
                try {
                  await supabaseAdmin
                    .from("client_licenses")
                    .update({
                      expires_at: target.expires_at,
                      status: target.status,
                    })
                    .eq("id", target.id);
                } catch (err: unknown) {
                  console.warn("[supabase-renew-license-warn]", err);
                }
              }
            } else if (act.type === "toggle_status" && act.id) {
              const target = serverLicenseState.licenses.find((l) => l.id === act.id);
              if (target) {
                target.status = target.status === "active" ? "paused" : "active";
                saveServerLicenses();

                // Update in Supabase
                try {
                  await supabaseAdmin
                    .from("client_licenses")
                    .update({
                      status: target.status,
                    })
                    .eq("id", target.id);
                } catch (err: unknown) {
                  console.warn("[supabase-toggle-status-warn]", err);
                }
              }
            } else if (act.type === "reset_devices" && act.id) {
              const target = serverLicenseState.licenses.find((l) => l.id === act.id);
              if (target) {
                target.bound_device_ids = [];
                saveServerLicenses();

                // Update in Supabase
                try {
                  await supabaseAdmin
                    .from("client_licenses")
                    .update({
                      bound_device_ids: target.bound_device_ids,
                    })
                    .eq("id", target.id);
                } catch (err: unknown) {
                  console.warn("[supabase-reset-devices-warn]", err);
                }
              }
            } else if (
              act.type === "update_lotteries" &&
              act.id &&
              typeof act.client_name === "string"
            ) {
              const target = serverLicenseState.licenses.find((l) => l.id === act.id);
              if (target) {
                target.client_name = act.client_name.trim();
                saveServerLicenses();

                // Persistent update of client_name in Supabase
                try {
                  await supabaseAdmin
                    .from("client_licenses")
                    .update({
                      client_name: target.client_name,
                    })
                    .eq("id", target.id);
                } catch (err: unknown) {
                  console.warn("[supabase-update-lotteries-warn]", err);
                }
              }
            } else if (act.type === "delete" && act.id) {
              const targetToDelete = serverLicenseState.licenses.find((l) => l.id === act.id);
              serverLicenseState.licenses = serverLicenseState.licenses.filter(
                (l) => l.id !== act.id,
              );
              if (!serverLicenseState.deletedIds) {
                serverLicenseState.deletedIds = [];
              }
              if (!serverLicenseState.deletedIds.includes(act.id)) {
                serverLicenseState.deletedIds.push(act.id);
              }
              if (!serverLicenseState.deletedPins) {
                serverLicenseState.deletedPins = [];
              }
              if (
                targetToDelete?.pin_code &&
                !serverLicenseState.deletedPins.includes(targetToDelete.pin_code)
              ) {
                serverLicenseState.deletedPins.push(targetToDelete.pin_code);
              }
              saveServerLicenses();

              // Delete in Supabase
              try {
                await supabaseAdmin.from("client_licenses").delete().eq("id", act.id);
              } catch (err: unknown) {
                console.warn("[supabase-delete-license-warn]", err);
              }
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

                      // Update device binding in Supabase
                      supabaseAdmin
                        .from("client_licenses")
                        .update({
                          bound_device_ids: match.bound_device_ids,
                        })
                        .eq("id", match.id)
                        .catch((err: unknown) => console.warn("[supabase-bind-device-warn]", err));
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

          if (Array.isArray(animalImagesBatch) && animalImagesBatch.length > 0) {
            const validBatch: AnimalImage[] = animalImagesBatch
              .filter(
                (item: unknown) =>
                  Boolean(item) &&
                  typeof item === "object" &&
                  typeof (item as AnimalImage).game_id === "string" &&
                  typeof (item as AnimalImage).animal_number === "number" &&
                  typeof (item as AnimalImage).image_url === "string" &&
                  Boolean((item as AnimalImage).image_url.trim()),
              )
              .map((item: AnimalImage) => ({
                id: item.id ?? `img-${item.game_id}-${item.animal_number}`,
                game_id: item.game_id,
                animal_number: item.animal_number,
                image_url: item.image_url,
              }));
            if (validBatch.length > 0) {
              mockStore.animal_images = mergeAnimalImagesPreserveCustom(
                mockStore.animal_images,
                validBatch,
              );
              saveServerAnimalImages();
            }
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
            deletedIds: serverLicenseState.deletedIds || [],
            deletedPins: serverLicenseState.deletedPins || [],
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
