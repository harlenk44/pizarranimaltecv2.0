import { createFileRoute } from "@tanstack/react-router";
import { mockStore } from "@/lib/mock-db";
import { getDefaultGameScheduleTimes } from "@/lib/game-schedules";
import fs from "fs";

const RESULTS_FILE = "/tmp/lottery_results.json";
const LATEST_ALERT_FILE = "/tmp/lottery_latest_alert.json";
const ANIMAL_IMAGES_FILE = "/tmp/lottery_animal_images.json";
const GAMES_FILE = "/tmp/lottery_games.json";

function loadServerResults() {
  try {
    if (fs.existsSync(RESULTS_FILE)) {
      const data = JSON.parse(fs.readFileSync(RESULTS_FILE, "utf-8"));
      if (Array.isArray(data) && data.length > 0) {
        mockStore.results = data;
      }
    }
  } catch {
    // ignore
  }
}

function saveServerResults() {
  try {
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
loadServerAnimalImages();
loadServerGames();

export const Route = createFileRoute("/api/public/results/sync")({
  server: {
    handlers: {
      GET: async () => {
        loadServerResults();
        loadServerAnimalImages();
        loadServerGames();
        const monjeGame = mockStore.games.find((g) => g.slug === "monje-millonario");
        const monjeCount = monjeGame
          ? mockStore.results.filter((r) => r.game_id === monjeGame.id).length
          : 0;

        if (mockStore.results.length === 0 || (monjeGame && monjeCount < 6)) {
          try {
            const { synchronizeAutomaticResults } = await import("@/lib/result-sync.server");
            await synchronizeAutomaticResults();
            saveServerResults();
          } catch (err) {
            console.warn("[sync-get-warn]", err);
          }
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
          latestAlert,
          animalImages: mockStore.animal_images,
          games: mockStore.games,
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
          const { synchronizeAutomaticResults } = await import("@/lib/result-sync.server");
          const reports = await synchronizeAutomaticResults();
          saveServerResults();
          return Response.json({ reports, results: mockStore.results });
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
          const body = await request.json();
          const { result, alert, animalImage, gameUpdate } = body;
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
            animalImages: mockStore.animal_images,
            games: mockStore.games,
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
