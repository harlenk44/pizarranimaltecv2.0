import { useEffect, useState, useCallback, useRef } from "react";
import { supabase } from "@/lib/supabase";
import { getEmojiForNumber } from "@/lib/animals";
import type { Game, Result, GameWithResults, AnimalImage, AnimalEntry } from "@/lib/types";
import {
  Clock,
  LogOut,
  Settings,
  RefreshCw,
  CalendarDays,
  Volume2,
  VolumeX,
  Sliders,
  Target,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useBoardSettings } from "@/context/BoardSettingsContext";
import WeeklyBoard from "@/components/WeeklyBoard";
import AdBanner from "@/components/AdBanner";
import ResultAlertModal, { type ResultAlertItem } from "@/components/ResultAlertModal";
import VoiceSettingsModal from "@/components/VoiceSettingsModal";
import AnimalMedia from "@/components/AnimalMedia";
import { lotteryDate, LOTTERY_TIMEZONE } from "@/lib/lottery-date";

interface BoardPageProps {
  onAdminClick: () => void;
}

type AnimalImageMap = Record<string, string>;
type AnimalNameMap = Record<string, string>;
type AnimalLabelMap = Record<string, string>;

function formatTime(timeStr: string): string {
  const [h, m] = timeStr.split(":");
  const hour = parseInt(h ?? "0", 10);
  const ampm = hour >= 12 ? "PM" : "AM";
  const displayHour = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
  return `${displayHour}:${m || "00"} ${ampm}`;
}

function getAnimalEmoji(num: number, name?: string): string {
  return getEmojiForNumber(num, name);
}

function formatBoardDate(d: Date): string {
  const weekday = d.toLocaleDateString("es-VE", { timeZone: LOTTERY_TIMEZONE, weekday: "long" });
  const day = d.toLocaleDateString("es-VE", { timeZone: LOTTERY_TIMEZONE, day: "numeric" });
  const month = d.toLocaleDateString("es-VE", { timeZone: LOTTERY_TIMEZONE, month: "long" });
  const capitalize = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : "");
  return `${capitalize(weekday)}, ${day} De ${capitalize(month)}`;
}

import { getGameScheduleTimes, formatScheduleTime } from "@/lib/game-schedules";

function buildFullSchedule(gameOrSlug: Game | string, _results: Result[]): string[] {
  return getGameScheduleTimes(gameOrSlug);
}

function findResultForTimeSlot(results: Result[], timeSlot: string): Result | undefined {
  const normSlot = timeSlot.replace(/^0/, "");
  return results.find((r) => {
    const rShort = r.draw_time.substring(0, 5).replace(/^0/, "");
    return rShort === normSlot;
  });
}

function getDynamicGridStyle(count: number): React.CSSProperties {
  let cols = 4;
  let rows = 2;
  if (count <= 1) {
    cols = 1;
    rows = 1;
  } else if (count <= 2) {
    cols = 2;
    rows = 1;
  } else if (count <= 4) {
    cols = 2;
    rows = 2;
  } else if (count <= 6) {
    cols = 3;
    rows = 2;
  } else if (count <= 8) {
    cols = 4;
    rows = 2;
  } else if (count <= 10) {
    cols = 5;
    rows = 2;
  } else if (count <= 12) {
    cols = 4;
    rows = 3;
  } else if (count <= 15) {
    cols = 5;
    rows = 3;
  } else {
    cols = 4;
    rows = Math.ceil(count / 4);
  }

  return {
    gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
    gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))`,
  };
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
  const [showVoiceSettings, setShowVoiceSettings] = useState(false);
  const [alertQueue, setAlertQueue] = useState<ResultAlertItem[]>([]);
  const [voiceEnabled, setVoiceEnabled] = useState<boolean>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("lottery_voice_enabled");
      return saved !== null ? saved === "true" : true;
    }
    return true;
  });
  const isInitialLoadRef = useRef(true);
  const prevSignaturesRef = useRef<Map<string, string>>(new Map());
  const lastAlertAnnouncedIdRef = useRef<string | null>(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("pizarra_last_announced_alert_id");
    }
    return null;
  });

  const handleVoiceToggle = (enabled: boolean) => {
    setVoiceEnabled(enabled);
    if (typeof window !== "undefined") {
      localStorage.setItem("lottery_voice_enabled", String(enabled));
    }
  };

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
    // 1. Sync from server backend to get latest results, alerts, and custom animal videos/images
    try {
      const syncRes = await fetch("/api/public/results/sync");
      if (syncRes.ok) {
        const syncData = await syncRes.json();
        // Sync animal images into mockStore & localStorage so all TVs have them
        if (Array.isArray(syncData?.animalImages) && syncData.animalImages.length > 0) {
          const { mockStore } = await import("@/lib/mock-db");
          mockStore.animal_images = syncData.animalImages;
          try {
            localStorage.setItem(
              "pizarra_custom_animal_images",
              JSON.stringify(syncData.animalImages),
            );
          } catch {
            // ignore
          }
        }

        // If server broadcasted a latestAlert, announce it if not already announced
        if (syncData?.latestAlert && syncData.latestAlert.id) {
          const alert = syncData.latestAlert as ResultAlertItem;
          const lastId =
            lastAlertAnnouncedIdRef.current ||
            (typeof window !== "undefined"
              ? localStorage.getItem("pizarra_last_announced_alert_id")
              : null);

          if (alert.id !== lastId) {
            const parts = alert.id.split("-");
            const ts = parseInt(parts[parts.length - 1] ?? "0", 10);
            const isRecent = !ts || Date.now() - ts < 5 * 60 * 1000;

            if (isRecent) {
              lastAlertAnnouncedIdRef.current = alert.id;
              try {
                localStorage.setItem("pizarra_last_announced_alert_id", alert.id);
              } catch {
                // ignore
              }
              setAlertQueue((prev) => {
                if (prev.some((a) => a.id === alert.id)) return prev;
                return [...prev, alert];
              });
            }
          }
        }
      }
    } catch {
      // server route may be temporarily busy
    }

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
    const imgMap: AnimalImageMap = {};
    for (const img of (imagesData.data ?? []) as AnimalImage[]) {
      imgMap[`${img.game_id}:${img.animal_number}`] = img.image_url;
      // Also provide a fallback for this animal across all games
      if (!imgMap[`any:${img.animal_number}`]) {
        imgMap[`any:${img.animal_number}`] = img.image_url;
      }
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

    const newAlerts: ResultAlertItem[] = [];

    for (const r of resultsPromises) {
      map[r.gameId] = r.results;
      const gameObj = (gamesData as Game[]).find((g) => g.id === r.gameId);
      if (!gameObj) continue;

      for (const res of r.results) {
        const sig = `${res.animal_number}:${res.animal_name}:${res.draw_time}`;
        const prevSig = prevSignaturesRef.current.get(res.id);

        if (!isInitialLoadRef.current) {
          if (prevSig === undefined || prevSig !== sig) {
            const displayName = nameMap[`${res.game_id}:${res.animal_number}`] ?? res.animal_name;
            const displayLabel =
              labelMap[`${res.game_id}:${res.animal_number}`] ??
              String(res.animal_number).padStart(2, "0");
            const imgUrl =
              imgMap[`${res.game_id}:${res.animal_number}`] ?? imgMap[`any:${res.animal_number}`];

            newAlerts.push({
              id: `${res.id}-${Date.now()}`,
              gameId: gameObj.id,
              gameName: gameObj.name,
              gameColor: gameObj.color,
              gameLogoUrl: gameObj.logo_url,
              drawDate: res.draw_date,
              drawTime: res.draw_time,
              animalNumber: res.animal_number,
              animalName: displayName,
              animalLabel: displayLabel,
              animalImageUrl: imgUrl,
              animalEmoji: getAnimalEmoji(res.animal_number, displayName),
            });
          }
        }
        prevSignaturesRef.current.set(res.id, sig);
      }
    }
    setResultsMap(map);

    if (isInitialLoadRef.current) {
      isInitialLoadRef.current = false;
    } else if (newAlerts.length > 0) {
      setAlertQueue((prev) => [...prev, ...newAlerts]);
    }

    setLastUpdate(new Date());
    setLoading(false);
  }, []);

  // Listen for real-time broadcasts and check pending alerts on mount
  useEffect(() => {
    let bc: BroadcastChannel | null = null;
    try {
      bc = new BroadcastChannel("pizarra_lottery_channel");
      bc.onmessage = (event) => {
        if (event.data?.type === "NEW_RESULT_ALERT" && event.data.alert) {
          const incoming = event.data.alert as ResultAlertItem;
          lastAlertAnnouncedIdRef.current = incoming.id;
          try {
            localStorage.setItem("pizarra_last_announced_alert_id", incoming.id);
          } catch {
            // ignore
          }
          setAlertQueue((prev) => {
            if (prev.some((a) => a.id === incoming.id)) return prev;
            return [...prev, incoming];
          });
          fetchAll();
        } else if (event.data?.type === "ANIMAL_MEDIA_UPDATED") {
          fetchAll();
        }
      };
    } catch {
      // ignore
    }

    const checkPendingAlerts = () => {
      try {
        const raw = localStorage.getItem("pizarra_pending_result_alerts");
        if (raw) {
          const list = JSON.parse(raw);
          if (Array.isArray(list) && list.length > 0) {
            setAlertQueue((prev) => {
              const prevIds = new Set(prev.map((a) => a.id));
              const fresh = list.filter((a) => !prevIds.has(a.id));
              return fresh.length > 0 ? [...prev, ...fresh] : prev;
            });
            localStorage.removeItem("pizarra_pending_result_alerts");
          }
        }
      } catch {
        // ignore
      }
    };

    checkPendingAlerts();

    const onStorage = (e: StorageEvent) => {
      if (e.key === "pizarra_pending_result_alerts") {
        checkPendingAlerts();
      }
    };
    window.addEventListener("storage", onStorage);

    return () => {
      bc?.close();
      window.removeEventListener("storage", onStorage);
    };
  }, [fetchAll]);

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
    const interval = setInterval(fetchAll, 10000);
    return () => clearInterval(interval);
  }, [fetchAll]);

  useEffect(() => {
    const timer = setInterval(() => setClock(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const handleTestAlert = () => {
    const allResults: { res: Result; game: Game }[] = [];
    for (const g of games) {
      const gResults = resultsMap[g.id] ?? [];
      for (const r of gResults) {
        allResults.push({ res: r, game: g });
      }
    }

    const sample = allResults.length > 0 ? allResults[allResults.length - 1] : null;
    if (sample) {
      const g = sample.game;
      const r = sample.res;
      const displayName = animalNames[`${g.id}:${r.animal_number}`] ?? r.animal_name;
      const displayLabel =
        animalLabels[`${g.id}:${r.animal_number}`] ?? String(r.animal_number).padStart(2, "0");
      const imgUrl =
        animalImages[`${g.id}:${r.animal_number}`] ?? animalImages[`any:${r.animal_number}`];
      setAlertQueue([
        {
          id: `test-${Date.now()}`,
          gameId: g.id,
          gameName: g.name,
          gameColor: g.color,
          gameLogoUrl: g.logo_url,
          drawDate: r.draw_date,
          drawTime: r.draw_time,
          animalNumber: r.animal_number,
          animalName: displayName,
          animalLabel: displayLabel,
          animalImageUrl: imgUrl,
          animalEmoji: getAnimalEmoji(r.animal_number, displayName),
        },
      ]);
    } else if (games.length > 0) {
      const g = games[0]!;
      const imgUrl = animalImages[`${g.id}:4`] ?? animalImages["any:4"] ?? null;
      setAlertQueue([
        {
          id: `test-${Date.now()}`,
          gameId: g.id,
          gameName: g.name,
          gameColor: g.color,
          gameLogoUrl: g.logo_url,
          drawDate: lotteryDate(),
          drawTime: "10:00:00",
          animalNumber: 4,
          animalName: "Alacrán",
          animalLabel: "04",
          animalImageUrl: imgUrl,
          animalEmoji: getAnimalEmoji(4, "Alacrán"),
        },
      ]);
    }
  };

  const gameCards: GameWithResults[] = games.map((g) => ({
    ...g,
    latest_results: resultsMap[g.id] ?? [],
  }));

  if (showWeekly) {
    return (
      <>
        <WeeklyBoard onClose={() => setShowWeekly(false)} />
        {alertQueue.length > 0 && (
          <ResultAlertModal
            alerts={alertQueue}
            voiceEnabled={voiceEnabled}
            onToggleVoice={handleVoiceToggle}
            onClose={() => setAlertQueue([])}
          />
        )}
      </>
    );
  }

  return (
    <div
      className="full-screen-board font-sans"
      style={{
        backgroundColor: settings.background_color || "#000000",
        color: settings.text_color || "#ffffff",
        fontFamily: settings.font_family || "inherit",
      }}
    >
      {/* Header */}
      <header
        className="board-fluid-header flex items-center justify-between"
        style={{
          backgroundColor: settings.surface_color || "transparent",
        }}
      >
        {/* Left Title */}
        <div className="flex items-center gap-3">
          <h1
            className="text-2xl sm:text-3xl lg:text-4xl font-black tracking-tight font-sans"
            style={{ color: settings.text_color || "#ffffff" }}
          >
            Pizarra Animaltec
          </h1>
        </div>

        {/* Right Clock & Controls */}
        <div className="flex items-center gap-4 sm:gap-6">
          <div className="text-right">
            <div className="text-2xl sm:text-3xl lg:text-4xl font-mono font-black text-emerald-400 tracking-tight tabular-nums leading-none">
              {clock.toLocaleTimeString("es-VE", {
                timeZone: LOTTERY_TIMEZONE,
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit",
                hour12: false,
              })}
            </div>
            <div className="text-xs sm:text-sm font-semibold opacity-90 mt-1">
              {formatBoardDate(clock)}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleTestAlert}
              className="p-2 rounded-lg bg-slate-900 border border-slate-800 hover:bg-slate-800 transition text-xs text-slate-300 hidden md:flex items-center gap-1.5"
              title="Probar voz"
            >
              <Volume2 className="w-4 h-4 text-emerald-400" />
              <span>Probar voz</span>
            </button>
            <button
              onClick={() => setShowVoiceSettings(true)}
              className="p-2 rounded-lg bg-slate-900 border border-slate-800 hover:bg-slate-800 transition text-xs text-slate-300 hidden lg:flex items-center gap-1.5"
              title="Ajustar voz"
            >
              <Sliders className="w-4 h-4 text-amber-400" />
              <span>Voz</span>
            </button>
            <button
              onClick={() => handleVoiceToggle(!voiceEnabled)}
              className={`p-2 rounded-lg transition border border-slate-800 ${
                voiceEnabled
                  ? "bg-blue-950/60 text-blue-400 hover:bg-blue-900/60"
                  : "bg-slate-900 text-slate-500 hover:bg-slate-800"
              }`}
              title={voiceEnabled ? "Voz activada" : "Voz silenciada"}
            >
              {voiceEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
            </button>
            <button
              onClick={() => setShowWeekly(true)}
              className="p-2 rounded-lg bg-slate-900 border border-slate-800 hover:bg-slate-800 transition text-slate-300"
              title="Pizarra semanal"
            >
              <CalendarDays className="w-4 h-4" />
            </button>
            <button
              onClick={handleManualRefresh}
              className="p-2 rounded-lg bg-slate-900 border border-slate-800 hover:bg-slate-800 transition text-slate-300"
              title="Actualizar"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
            <button
              onClick={onAdminClick}
              className="p-2 rounded-lg bg-slate-900 border border-slate-800 hover:bg-slate-800 transition text-slate-300"
              title="Panel de administración"
            >
              <Settings className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      {/* Dynamic Screen-Filling Grid Container */}
      <main
        className="board-fluid-main"
        style={{ backgroundColor: settings.background_color || "#000000" }}
      >
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <div className="animate-pulse text-slate-400 font-medium">Cargando resultados...</div>
          </div>
        ) : gameCards.length === 0 ? (
          <div className="flex items-center justify-center h-full text-slate-400">
            No hay juegos activos configurados.
          </div>
        ) : (
          <div className="board-fluid-grid" style={getDynamicGridStyle(gameCards.length)}>
            {gameCards.map((game) => (
              <GameCard
                key={game.id}
                game={game}
                animalImages={animalImages}
                animalNames={animalNames}
                animalLabels={animalLabels}
                settings={settings}
              />
            ))}
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="px-6 py-1 bg-black border-t border-slate-900/80 text-center flex-shrink-0">
        <p className="text-[10px] text-slate-600 font-mono">
          pizarraianimaltec · Pizarra de Resultados de Lotería en Vivo
        </p>
      </footer>

      {/* Real-time result announcement modal */}
      {alertQueue.length > 0 && (
        <ResultAlertModal
          alerts={alertQueue}
          voiceEnabled={voiceEnabled}
          onToggleVoice={handleVoiceToggle}
          onClose={() => setAlertQueue([])}
        />
      )}

      {/* Voice configuration modal */}
      <VoiceSettingsModal isOpen={showVoiceSettings} onClose={() => setShowVoiceSettings(false)} />
    </div>
  );
}

function AnimalAvatar({
  imageUrl,
  name,
  number,
  className,
}: {
  imageUrl?: string;
  name: string;
  number: number;
  className?: string;
}) {
  return (
    <AnimalMedia
      mediaUrl={imageUrl}
      name={name}
      number={number}
      className={className || "w-full h-full object-contain rounded-md"}
      emojiClassName="text-[clamp(1.8rem,3.2vw,3.8rem)] leading-none select-none"
    />
  );
}

function GameCard({
  game,
  animalImages,
  animalNames,
  animalLabels,
  settings,
}: {
  game: GameWithResults;
  animalImages: AnimalImageMap;
  animalNames: AnimalNameMap;
  animalLabels: AnimalLabelMap;
  settings: ReturnType<typeof useBoardSettings>["settings"];
}) {
  const results = game.latest_results;
  const scheduleTimes = buildFullSchedule(game, results);
  const latestResult = results.length > 0 ? results[results.length - 1] : null;

  const latestImgUrl = latestResult
    ? (animalImages[`${game.id}:${latestResult.animal_number}`] ??
      animalImages[`any:${latestResult.animal_number}`])
    : undefined;
  const latestDisplayName = latestResult
    ? (animalNames[`${game.id}:${latestResult.animal_number}`] ?? latestResult.animal_name)
    : "";
  const latestLabel = latestResult
    ? (animalLabels[`${game.id}:${latestResult.animal_number}`] ??
      String(latestResult.animal_number).padStart(2, "0"))
    : "";

  return (
    <div
      className="fluid-game-card"
      style={{
        backgroundColor: settings.card_color || "#000000",
        borderColor: game.color,
        boxShadow: `0 0 15px ${game.color}15`,
      }}
    >
      {/* Top Header */}
      <div className="fluid-card-header">
        {game.logo_url ? (
          <div
            className="rounded-full border border-slate-800 bg-slate-900 flex items-center justify-center overflow-hidden flex-shrink-0 fluid-logo-wrapper"
            style={{ width: "var(--display-logo)", height: "var(--display-logo)" }}
          >
            <img
              src={game.logo_url}
              alt={game.name}
              className="w-full h-full object-contain p-0.5"
            />
          </div>
        ) : (
          <div
            className="rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 fluid-logo-wrapper"
            style={{
              backgroundColor: `${game.color}20`,
              color: game.color,
              width: "var(--display-logo)",
              height: "var(--display-logo)",
            }}
          >
            🎯
          </div>
        )}
        <div className="flex-1 min-w-0">
          <h2 className="fluid-game-title truncate" style={{ color: game.color }}>
            {game.name}
          </h2>
          <p className="fluid-game-subtitle font-mono truncate">
            {results.length >= scheduleTimes.length ? "Sorteos de hoy completos" : "En progreso"}
          </p>
        </div>
      </div>

      {/* Hero Center Display (Customized by result_row_color, --display-hero-scale and --display-animal-scale) */}
      <div
        className="fluid-hero-banner"
        style={{
          backgroundColor: settings.result_row_color || "rgba(15, 23, 42, 0.8)",
        }}
      >
        <div
          className="fluid-hero-avatar rounded-xl bg-slate-950/90 border border-slate-700/80 flex items-center justify-center flex-shrink-0 overflow-hidden shadow-inner p-1"
          style={{
            width: "calc(clamp(3.2rem, 4.8vw, 6rem) * var(--display-animal-scale, 1))",
            height: "calc(clamp(3.2rem, 4.8vw, 6rem) * var(--display-animal-scale, 1))",
          }}
        >
          {latestResult ? (
            <AnimalAvatar
              imageUrl={latestImgUrl}
              name={latestDisplayName}
              number={latestResult.animal_number}
              className="w-full h-full object-contain p-0.5 drop-shadow-md rounded-lg"
            />
          ) : (
            <Target className="w-8 h-8 sm:w-10 sm:h-10 text-slate-500" />
          )}
        </div>

        <div className="flex-1 text-right min-w-0">
          <div
            className="h-2 w-12 sm:w-16 rounded-full ml-auto mb-1.5 shadow-sm"
            style={{ backgroundColor: game.color }}
          />
          {latestResult ? (
            <div className="truncate">
              <div className="fluid-hero-text font-black text-white tracking-wide truncate">
                {latestLabel} - {latestDisplayName.toUpperCase()}
              </div>
              <div className="fluid-hero-time font-mono font-semibold text-slate-300 mt-0.5">
                {formatTime(latestResult.draw_time)}
              </div>
            </div>
          ) : (
            <div className="fluid-hero-text font-bold text-slate-400 tracking-wide">
              Esperando sorteo
            </div>
          )}
        </div>
      </div>

      {/* Bottom Schedule Matrix Grid */}
      <div className="fluid-schedule-matrix">
        {scheduleTimes.map((timeSlot) => {
          const res = findResultForTimeSlot(results, timeSlot);
          const displayNum = res
            ? (animalLabels[`${game.id}:${res.animal_number}`] ??
              String(res.animal_number).padStart(2, "0"))
            : null;

          return (
            <div
              key={timeSlot}
              className={`fluid-schedule-cell transition ${
                res ? "border-slate-700/90 shadow-sm" : "border-slate-800/80 opacity-80"
              }`}
              style={{
                backgroundColor: res
                  ? settings.result_row_color || "rgba(15, 23, 42, 0.9)"
                  : "rgba(2, 6, 23, 0.6)",
              }}
            >
              <div className="fluid-cell-time">{formatTime(timeSlot)}</div>
              <div className="fluid-cell-result truncate">
                {res ? (
                  <span style={{ color: game.color }} className="font-black">
                    {displayNum}
                  </span>
                ) : (
                  <span className="text-slate-600 font-normal">—</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
