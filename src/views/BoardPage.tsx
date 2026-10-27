import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { getEmojiForNumber } from "@/lib/animals";
import type { Game, Result, GameWithResults, AnimalImage, AnimalEntry } from "@/lib/types";
import { Clock, LogOut, Settings, RefreshCw, CalendarDays } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useBoardSettings } from "@/context/BoardSettingsContext";
import WeeklyBoard from "@/components/WeeklyBoard";
import AdBanner from "@/components/AdBanner";
import { lotteryDate, LOTTERY_TIMEZONE } from "@/lib/lottery-date";

interface BoardPageProps {
  onAdminClick: () => void;
}

// image map key: `${gameId}:${animalNumber}`
type AnimalImageMap = Record<string, string>;
// animal name map key: `${gameId}:${animalNumber}` -> name
type AnimalNameMap = Record<string, string>;
// animal label map key: `${gameId}:${animalNumber}` -> display label (e.g. "00", "0")
type AnimalLabelMap = Record<string, string>;

function formatTime(timeStr: string): string {
  const [h, m] = timeStr.split(":");
  const hour = parseInt(h ?? "0", 10);
  const ampm = hour >= 12 ? "PM" : "AM";
  const displayHour = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
  return `${displayHour}:${m} ${ampm}`;
}

function getAnimalEmoji(num: number): string {
  return getEmojiForNumber(num);
}

export default function BoardPage({ onAdminClick }: BoardPageProps) {
  const { profile, signOut } = useAuth();
  const { settings } = useBoardSettings();
  const [games, setGames] = useState<Game[]>([]);
  const [resultsMap, setResultsMap] = useState<Record<string, Result[]>>({});
  const [animalImages, setAnimalImages] = useState<AnimalImageMap>({});
  const [animalNames, setAnimalNames] = useState<AnimalNameMap>({});
  const [animalLabels, setAnimalLabels] = useState<AnimalLabelMap>({});
  const [loading, setLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());
  const [clock, setClock] = useState(new Date());
  const [showWeekly, setShowWeekly] = useState(false);

  useEffect(() => {
    if (settings.start_view === "weekly") setShowWeekly(true);
  }, [settings.start_view]);

  useEffect(() => {
    if (!settings.rotation_enabled) return;
    const timer = setInterval(
      () => setShowWeekly((current) => !current),
      settings.rotation_interval_seconds * 1000,
    );
    return () => clearInterval(timer);
  }, [settings.rotation_enabled, settings.rotation_interval_seconds]);

  const fetchAll = useCallback(async () => {
    const { data: gamesData } = await supabase
      .from("games")
      .select("*")
      .eq("is_active", true)
      .order("display_order");

    if (!gamesData) return;
    setGames(gamesData as Game[]);

    const today = lotteryDate();

    const [resultsPromises, imagesData, entriesData] = await Promise.all([
      Promise.all(
        (gamesData as Game[]).map(async (g) => {
          const { data } = await supabase
            .from("results")
            .select("*")
            .eq("game_id", g.id)
            .eq("draw_date", today)
            .order("draw_time", { ascending: true });
          return { gameId: g.id, results: (data ?? []) as Result[] };
        }),
      ),
      supabase.from("animal_images").select("*"),
      supabase.from("animal_entries").select("*"),
    ]);

    const map: Record<string, Result[]> = {};
    for (const r of resultsPromises) {
      map[r.gameId] = r.results;
    }
    setResultsMap(map);

    const imgMap: AnimalImageMap = {};
    for (const img of (imagesData.data ?? []) as AnimalImage[]) {
      imgMap[`${img.game_id}:${img.animal_number}`] = img.image_url;
    }
    setAnimalImages(imgMap);

    const nameMap: AnimalNameMap = {};
    const labelMap: AnimalLabelMap = {};
    for (const entry of (entriesData.data ?? []) as AnimalEntry[]) {
      nameMap[`${entry.game_id}:${entry.number}`] = entry.name;
      if (entry.label) labelMap[`${entry.game_id}:${entry.number}`] = entry.label;
    }
    setAnimalNames(nameMap);
    setAnimalLabels(labelMap);

    setLastUpdate(new Date());
    setLoading(false);
  }, []);

  const handleManualRefresh = useCallback(async () => {
    try {
      const res = await fetch("/api/public/results/sync", { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data?.results)) {
          const { mockStore } = await import("@/lib/mock-db");
          mockStore.results = data.results;
        }
      }
    } catch {
      // ignore
    }
    await fetchAll();
  }, [fetchAll]);

  useEffect(() => {
    fetchAll();
    // Auto-sync today's TuAzar results on initial load
    fetch("/api/public/results/sync", { method: "POST" })
      .then((res) => (res.ok ? res.json() : null))
      .then(async (data) => {
        if (Array.isArray(data?.results)) {
          const { mockStore } = await import("@/lib/mock-db");
          mockStore.results = data.results;
          fetchAll();
        } else if (data?.reports) {
          fetchAll();
        }
      })
      .catch(() => {});

    const refreshInterval = setInterval(fetchAll, 30000);
    const clockInterval = setInterval(() => setClock(new Date()), 1000);
    return () => {
      clearInterval(refreshInterval);
      clearInterval(clockInterval);
    };
  }, [fetchAll]);

  const gameCards: GameWithResults[] = games.map((g) => ({
    ...g,
    latest_results: resultsMap[g.id] ?? [],
  }));

  if (showWeekly) {
    return <WeeklyBoard onClose={() => setShowWeekly(false)} />;
  }

  return (
    <div
      className="min-h-screen text-white flex flex-col"
      style={{ backgroundColor: settings.background_color, color: settings.text_color }}
    >
      {/* Header */}
      <header
        className="flex items-center justify-between px-6 py-3 border-b border-slate-800"
        style={{ backgroundColor: settings.surface_color }}
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center shadow-lg shadow-blue-600/30">
            <span className="text-xl">🎯</span>
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight">Pizarra de Animalitos</h1>
            <p className="text-xs text-slate-400">Resultados en vivo</p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="text-right hidden sm:block">
            <div className="text-2xl font-mono font-bold tabular-nums">
              {clock.toLocaleTimeString("es-VE", {
                timeZone: LOTTERY_TIMEZONE,
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit",
              })}
            </div>
            <div className="text-xs text-slate-400">
              {clock.toLocaleDateString("es-VE", {
                timeZone: LOTTERY_TIMEZONE,
                weekday: "long",
                day: "numeric",
                month: "long",
              })}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500 hidden lg:inline">
              Actualizado:{" "}
              {lastUpdate.toLocaleTimeString("es-VE", { hour: "2-digit", minute: "2-digit" })}
            </span>
            <button
              onClick={() => setShowWeekly(true)}
              className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 transition"
              title="Pizarra semanal"
            >
              <CalendarDays className="w-4 h-4 text-slate-300" />
            </button>
            <button
              onClick={handleManualRefresh}
              className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 transition"
              title="Actualizar"
            >
              <RefreshCw className="w-4 h-4 text-slate-300" />
            </button>
            {profile?.role === "admin" && (
              <button
                onClick={onAdminClick}
                className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 transition"
                title="Panel de administración"
              >
                <Settings className="w-4 h-4 text-slate-300" />
              </button>
            )}
            <button
              onClick={signOut}
              className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 transition"
              title="Salir"
            >
              <LogOut className="w-4 h-4 text-slate-300" />
            </button>
          </div>
        </div>
      </header>

      {/* Board grid */}
      <main className="flex-1 p-4 lg:p-6 overflow-auto">
        <AdBanner placement="top" className="mb-4" />
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <div className="animate-pulse text-slate-400">Cargando resultados...</div>
          </div>
        ) : gameCards.length === 0 ? (
          <div className="flex items-center justify-center h-full text-slate-400">
            No hay juegos activos configurados.
          </div>
        ) : (
          <div className="display-game-grid">
            {gameCards.map((game) => (
              <GameCard
                key={game.id}
                game={game}
                animalImages={animalImages}
                animalNames={animalNames}
                animalLabels={animalLabels}
              />
            ))}
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="px-6 py-2 bg-slate-900/80 border-t border-slate-800 text-center">
        <AdBanner placement="bottom" className="mb-2 max-w-3xl mx-auto" />
        <p className="text-xs text-slate-500">
          {profile?.email} · {profile?.role === "admin" ? "Administrador" : "Visualizador"}
        </p>
      </footer>
    </div>
  );
}

function GameCard({
  game,
  animalImages,
  animalNames,
  animalLabels,
}: {
  game: GameWithResults;
  animalImages: AnimalImageMap;
  animalNames: AnimalNameMap;
  animalLabels: AnimalLabelMap;
}) {
  const results = game.latest_results;
  const { settings } = useBoardSettings();

  return (
    <div
      className="display-game-card rounded-lg overflow-hidden shadow-xl border border-slate-800 flex flex-col"
      style={{
        borderTopColor: game.color,
        borderTopWidth: "4px",
        backgroundColor: settings.card_color,
      }}
    >
      {/* Game title */}
      <div
        className="display-game-title px-4 py-2.5 font-bold text-center uppercase flex flex-col items-center justify-center gap-2"
        style={{ backgroundColor: `${game.color}25`, color: game.color }}
      >
        {game.logo_url && (
          <img src={game.logo_url} alt={`Logo ${game.name}`} className="display-logo" />
        )}
        <span>{game.name}</span>
      </div>

      {/* All results for today — list */}
      <div className="flex-1 px-3 py-3 space-y-2">
        {results.length === 0 ? (
          <div className="text-slate-500 text-sm text-center py-8">Sin resultados hoy</div>
        ) : (
          results.map((r, idx) => {
            const isLatest = idx === results.length - 1;
            const imgUrl = animalImages[`${game.id}:${r.animal_number}`];
            const displayName = animalNames[`${game.id}:${r.animal_number}`] ?? r.animal_name;
            const displayLabel =
              animalLabels[`${game.id}:${r.animal_number}`] ??
              String(r.animal_number).padStart(2, "0");
            return (
              <div
                key={r.id}
                className="display-result-row rounded-lg"
                style={{
                  backgroundColor: settings.result_row_color,
                  ...(isLatest ? { boxShadow: `inset 0 0 0 1px ${game.color}40` } : {}),
                }}
              >
                {/* Time */}
                <div className="flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-slate-500" />
                  <span className="display-time font-mono font-bold">
                    {formatTime(r.draw_time)}
                  </span>
                </div>

                {/* Animal image/emoji + number + name */}
                <div className="display-animal">
                  {imgUrl ? (
                    <img
                      src={imgUrl}
                      alt={displayName}
                      className="display-animal-image object-contain rounded"
                    />
                  ) : (
                    <span className="display-animal-emoji">{getAnimalEmoji(r.animal_number)}</span>
                  )}
                  <span className="display-number font-black tabular-nums">{displayLabel}</span>
                  <span className="display-name font-bold">{displayName}</span>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
