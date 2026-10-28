import { useEffect, useState, useCallback, useMemo } from "react";
import { supabase } from "@/lib/supabase";
import { getEmojiForNumber } from "@/lib/animals";
import type { Game, Result, AnimalImage, AnimalEntry } from "@/lib/types";
import { Calendar, ChevronLeft, ChevronRight, RefreshCw } from "lucide-react";
import AdBanner from "@/components/AdBanner";
import { useBoardSettings } from "@/context/BoardSettingsContext";
import { lotteryDate } from "@/lib/lottery-date";

type AnimalImageMap = Record<string, string>;
type AnimalNameMap = Record<string, string>;
type AnimalLabelMap = Record<string, string>;

const WEEKDAYS_ES = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];

function startOfWeek(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay();
  d.setDate(d.getDate() - day);
  return d;
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function formatTime(timeStr: string): string {
  const [h, m] = timeStr.split(":");
  const hour = parseInt(h ?? "0", 10);
  const ampm = hour >= 12 ? "PM" : "AM";
  const displayHour = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
  return `${displayHour}:${m} ${ampm}`;
}

function dateToISO(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function currentLotteryWeek(): Date {
  return startOfWeek(new Date(`${lotteryDate()}T12:00:00`));
}

interface WeeklyBoardProps {
  onClose: () => void;
}

export default function WeeklyBoard({ onClose }: WeeklyBoardProps) {
  const [games, setGames] = useState<Game[]>([]);
  const [results, setResults] = useState<Result[]>([]);
  const [animalImages, setAnimalImages] = useState<AnimalImageMap>({});
  const [animalNames, setAnimalNames] = useState<AnimalNameMap>({});
  const [animalLabels, setAnimalLabels] = useState<AnimalLabelMap>({});
  const [loading, setLoading] = useState(true);
  const [weekStart, setWeekStart] = useState<Date>(currentLotteryWeek);
  const { settings } = useBoardSettings();

  const weekDays = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)),
    [weekStart],
  );

  const fetchData = useCallback(async () => {
    setLoading(true);
    const [gamesRes, imagesRes, entriesRes] = await Promise.all([
      supabase.from("games").select("*").eq("is_active", true).order("display_order"),
      supabase.from("animal_images").select("*"),
      supabase.from("animal_entries").select("*"),
    ]);

    setGames((gamesRes.data ?? []) as Game[]);

    const imgMap: AnimalImageMap = {};
    for (const img of (imagesRes.data ?? []) as AnimalImage[]) {
      imgMap[`${img.game_id}:${img.animal_number}`] = img.image_url;
    }
    setAnimalImages(imgMap);

    const nameMap: AnimalNameMap = {};
    const labelMap: AnimalLabelMap = {};
    for (const entry of (entriesRes.data ?? []) as AnimalEntry[]) {
      nameMap[`${entry.game_id}:${entry.number}`] = entry.name;
      if (entry.label) labelMap[`${entry.game_id}:${entry.number}`] = entry.label;
    }
    setAnimalNames(nameMap);
    setAnimalLabels(labelMap);

    const startDate = dateToISO(weekDays[0] ?? weekStart);
    const endDate = dateToISO(weekDays[6] ?? weekStart);
    const { data: resultsData } = await supabase
      .from("results")
      .select("*")
      .gte("draw_date", startDate)
      .lte("draw_date", endDate)
      .order("draw_time", { ascending: true });
    setResults((resultsData ?? []) as Result[]);

    setLoading(false);
  }, [weekDays]);

  useEffect(() => {
    fetchData();
    const refreshInterval = setInterval(fetchData, 30000);
    return () => clearInterval(refreshInterval);
  }, [fetchData]);

  const resultsByGameDay = useMemo(() => {
    const map: Record<string, Result[]> = {};
    for (const r of results) {
      const key = `${r.game_id}|${r.draw_date}`;
      if (!map[key]) map[key] = [];
      map[key].push(r);
    }
    return map;
  }, [results]);

  const weekLabel = `${(weekDays[0] ?? weekStart).toLocaleDateString("es-VE", { day: "2-digit", month: "short" })} – ${(weekDays[6] ?? weekStart).toLocaleDateString("es-VE", { day: "2-digit", month: "short", year: "numeric" })}`;
  const isCurrentWeek = dateToISO(weekStart) === dateToISO(currentLotteryWeek());

  return (
    <div
      className="min-h-screen text-white flex flex-col"
      style={{ backgroundColor: settings.background_color, color: settings.text_color }}
    >
      <header
        className="flex items-center justify-between px-6 py-3 border-b border-slate-800"
        style={{ backgroundColor: settings.surface_color }}
      >
        <div className="flex items-center gap-3">
          <button
            onClick={onClose}
            className="px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-sm font-medium flex items-center gap-2 transition"
          >
            <ChevronLeft className="w-4 h-4" /> Hoy
          </button>
          <div>
            <h1 className="text-xl font-bold tracking-tight flex items-center gap-2">
              <Calendar className="w-5 h-5 text-blue-500" />
              Pizarra Semanal
            </h1>
            <p className="text-xs text-slate-400">Resultados de toda la semana</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1 bg-slate-800 rounded-lg p-1">
            <button
              onClick={() => setWeekStart(addDays(weekStart, -7))}
              className="p-1.5 rounded hover:bg-slate-700 transition"
              title="Semana anterior"
            >
              <ChevronLeft className="w-4 h-4 text-slate-300" />
            </button>
            <span className="text-sm font-medium px-3 min-w-[140px] text-center">{weekLabel}</span>
            <button
              onClick={() => setWeekStart(addDays(weekStart, 7))}
              className="p-1.5 rounded hover:bg-slate-700 transition"
              title="Semana siguiente"
            >
              <ChevronRight className="w-4 h-4 text-slate-300" />
            </button>
          </div>
          {!isCurrentWeek && (
            <button
              onClick={() => setWeekStart(currentLotteryWeek())}
              className="px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-medium transition"
            >
              Esta semana
            </button>
          )}
          <button
            onClick={fetchData}
            className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 transition"
            title="Actualizar"
          >
            <RefreshCw className={`w-4 h-4 text-slate-300 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </header>

      <main className="flex-1 p-4 lg:p-6 overflow-auto">
        <AdBanner placement="top" className="mb-4" />
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <div className="animate-pulse text-slate-400">Cargando resultados...</div>
          </div>
        ) : games.length === 0 ? (
          <div className="flex items-center justify-center h-full text-slate-400">
            No hay juegos activos configurados.
          </div>
        ) : (
          <div className="rounded-2xl border border-slate-800 bg-slate-900/70 shadow-2xl overflow-hidden">
            <div className="overflow-x-auto">
              <div className="display-week-table">
                <div className="display-week-grid border-b border-slate-700 bg-slate-800/80">
                  <div className="px-3 py-3 flex items-center text-[10px] uppercase tracking-widest font-bold text-slate-500 border-r border-slate-700">
                    Juegos / Día
                  </div>
                  {weekDays.map((day, dayIdx) => {
                    const isToday = dateToISO(day) === lotteryDate();
                    return (
                      <div
                        key={dateToISO(day)}
                        className={`text-center px-2 py-2 border-r border-slate-700 last:border-r-0 ${isToday ? "bg-blue-600/20" : ""}`}
                      >
                        <div
                          className={`text-[10px] uppercase tracking-wide font-bold ${isToday ? "text-blue-300" : "text-slate-400"}`}
                        >
                          {(WEEKDAYS_ES[dayIdx] ?? "").slice(0, 3)}
                        </div>
                        <div
                          className={`text-xl leading-6 font-black ${isToday ? "text-blue-300" : "text-white"}`}
                        >
                          {day.getDate()}
                        </div>
                        {isToday && (
                          <div className="text-[9px] text-blue-400 uppercase tracking-widest">
                            Hoy
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {games.map((game, gameIdx) => (
                  <div
                    key={game.id}
                    className={`display-week-grid ${gameIdx < games.length - 1 ? "border-b border-slate-800" : ""}`}
                  >
                    <div
                      className="px-3 py-2 border-r border-slate-700 flex items-center gap-2 min-h-[112px]"
                      style={{ borderLeft: `4px solid ${game.color}` }}
                    >
                      <div className="min-w-0">
                        {game.logo_url && (
                          <img
                            src={game.logo_url}
                            alt={`Logo ${game.name}`}
                            className="display-logo mb-2"
                          />
                        )}
                        <div
                          className="display-game-title font-black uppercase leading-tight"
                          style={{ color: game.color }}
                        >
                          {game.name}
                        </div>
                        <div className="text-[9px] text-slate-600 uppercase tracking-wider mt-1">
                          Resultados
                        </div>
                      </div>
                    </div>
                    {weekDays.map((day) => {
                      const dayISO = dateToISO(day);
                      return (
                        <WeeklyGridCell
                          key={`${game.id}-${dayISO}`}
                          game={game}
                          dayResults={resultsByGameDay[`${game.id}|${dayISO}`] ?? []}
                          animalImages={animalImages}
                          animalNames={animalNames}
                          animalLabels={animalLabels}
                          isToday={dayISO === lotteryDate()}
                        />
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

function WeeklyGridCell({
  game,
  dayResults,
  animalImages,
  animalNames,
  animalLabels,
  isToday,
}: {
  game: Game;
  dayResults: Result[];
  animalImages: AnimalImageMap;
  animalNames: AnimalNameMap;
  animalLabels: AnimalLabelMap;
  isToday: boolean;
}) {
  return (
    <div
      className={`min-h-[112px] p-1.5 border-r border-slate-800 last:border-r-0 ${isToday ? "bg-blue-950/15" : ""}`}
    >
      {dayResults.length === 0 ? (
        <div className="h-full min-h-[98px] flex items-center justify-center text-[10px] text-slate-700">
          —
        </div>
      ) : (
        <div className="space-y-1">
          {dayResults.map((r) => {
            const imgUrl = animalImages[`${game.id}:${r.animal_number}`];
            const displayName = animalNames[`${game.id}:${r.animal_number}`] ?? r.animal_name;
            const displayLabel =
              animalLabels[`${game.id}:${r.animal_number}`] ??
              String(r.animal_number).padStart(2, "0");
            return (
              <div key={r.id} className="display-week-result rounded">
                <span className="display-time font-mono font-bold">{formatTime(r.draw_time)}</span>
                {imgUrl ? (
                  <img
                    src={imgUrl}
                    alt={displayName}
                    className="display-animal-image object-contain rounded"
                  />
                ) : (
                  <span className="display-animal-emoji">
                    {getEmojiForNumber(r.animal_number, displayName)}
                  </span>
                )}
                <span className="display-number font-black tabular-nums">{displayLabel}</span>
                <span className="display-name font-bold">{displayName}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
