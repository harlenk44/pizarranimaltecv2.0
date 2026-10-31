import { useEffect, useState, useCallback, useRef } from "react";
import { supabase, getMediaUrl } from "@/lib/supabase";
import {
  ANIMALS as DEFAULT_ANIMALS,
  generateDefaultAnimals,
  getAnimalName,
  getEmojiForNumber,
} from "@/lib/animals";
import type {
  Game,
  Result,
  AnimalImage,
  AnimalEntry,
  Profile,
  Ad,
  AdPlacement,
  AdMediaType,
} from "@/lib/types";
import DesignManager from "@/components/DesignManager";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { manualResultSource, type LoadingMode } from "@/lib/result-sync";
import { lotteryDate } from "@/lib/lottery-date";
import {
  getGameScheduleTimes,
  getDefaultGameScheduleTimes,
  formatScheduleTime,
  normalizeScheduleTime,
} from "@/lib/game-schedules";
import {
  ArrowLeft,
  Plus,
  Trash2,
  Calendar,
  Clock,
  PawPrint,
  Check,
  X,
  ChevronDown,
  ChevronUp,
  Loader2,
  Image as ImageIcon,
  Upload,
  ListPlus,
  Save,
  Megaphone,
  Link2,
  Eye,
  EyeOff,
  GripVertical,
  Palette,
  Pencil,
  RefreshCw,
  Video,
} from "lucide-react";
import AnimalMedia, { isVideoMedia } from "@/components/AnimalMedia";
import { mockStore } from "@/lib/mock-db";

interface AnimalListItem {
  number: number;
  name: string;
  label: string | null;
}

async function fetchAnimalList(gameId: string): Promise<AnimalListItem[]> {
  const { data } = await supabase
    .from("animal_entries")
    .select("*")
    .eq("game_id", gameId)
    .order("number", { ascending: true });
  const entries = (data ?? []) as AnimalEntry[];
  if (entries.length > 0) {
    return entries.map((e) => ({ number: e.number, name: e.name, label: e.label }));
  }
  return DEFAULT_ANIMALS.map((a) => ({ number: a.number, name: a.name, label: null }));
}

function animalDisplayLabel(item: { number: number; label?: string | null }): string {
  return item.label ?? String(item.number).padStart(2, "0");
}

interface AdminPageProps {
  onBack: () => void;
}

type Tab = "results" | "games" | "animals" | "ads" | "design";

export default function AdminPage({ onBack }: AdminPageProps) {
  const [tab, setTab] = useState<Tab>("results");
  const [games, setGames] = useState<Game[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchGames = useCallback(async () => {
    let localGames: Game[] = [];
    if (typeof window !== "undefined") {
      try {
        const raw = localStorage.getItem("pizarra_persisted_games");
        if (raw) localGames = JSON.parse(raw);
      } catch {
        // ignore
      }
    }

    const { data } = await supabase.from("games").select("*").order("display_order");
    let loaded = (data ?? []) as Game[];
    if (localGames.length > 0) {
      loaded = loaded.map((g) => {
        const match = localGames.find((lg) => lg.id === g.id || lg.slug === g.slug);
        if (match) {
          const effectiveMode =
            match.loading_mode ?? match.mode ?? g.loading_mode ?? g.mode ?? "automatic";
          return { ...g, ...match, loading_mode: effectiveMode, mode: effectiveMode };
        }
        return g;
      });
    }
    setGames(loaded);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchGames();
  }, [fetchGames]);

  return (
    <div className="min-h-screen bg-slate-950 text-white flex flex-col">
      <header className="flex items-center justify-between px-6 py-4 bg-slate-900 border-b border-slate-800">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 transition flex items-center gap-2 text-xs font-bold text-slate-200 cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Volver a la Pizarra</span>
          </button>
          <h1 className="text-xl font-bold ml-2">Panel de Administración</h1>
        </div>
      </header>

      <div className="flex gap-2 px-6 py-3 bg-slate-900/50 border-b border-slate-800 flex-wrap">
        <button
          onClick={() => setTab("results")}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
            tab === "results"
              ? "bg-blue-600 text-white"
              : "bg-slate-800 text-slate-400 hover:text-white"
          }`}
        >
          Resultados
        </button>
        <button
          onClick={() => setTab("games")}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
            tab === "games"
              ? "bg-blue-600 text-white"
              : "bg-slate-800 text-slate-400 hover:text-white"
          }`}
        >
          Juegos
        </button>
        <button
          onClick={() => setTab("animals")}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
            tab === "animals"
              ? "bg-blue-600 text-white"
              : "bg-slate-800 text-slate-400 hover:text-white"
          }`}
        >
          Animales
        </button>
        <button
          onClick={() => setTab("ads")}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition flex items-center gap-2 ${tab === "ads" ? "bg-blue-600 text-white" : "bg-slate-800 text-slate-400 hover:text-white"}`}
        >
          <Megaphone className="w-4 h-4" /> Publicidad
        </button>
        <button
          onClick={() => setTab("design")}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition flex items-center gap-2 ${tab === "design" ? "bg-blue-600 text-white" : "bg-slate-800 text-slate-400 hover:text-white"}`}
        >
          <Palette className="w-4 h-4" /> Diseño
        </button>
      </div>

      <main className="flex-1 p-6 overflow-auto">
        {loading ? (
          <div className="flex items-center justify-center h-full text-slate-400">
            <Loader2 className="w-6 h-6 animate-spin" /> <span className="ml-2">Cargando...</span>
          </div>
        ) : tab === "results" ? (
          <ResultsManager games={games} />
        ) : tab === "games" ? (
          <GamesManager games={games} onRefresh={fetchGames} />
        ) : tab === "animals" ? (
          <AnimalsManager games={games} />
        ) : tab === "ads" ? (
          <AdsManager />
        ) : (
          <DesignManager />
        )}
      </main>
    </div>
  );
}

// ---------- Results Manager ----------

function ResultsManager({ games }: { games: Game[] }) {
  const [selectedGame, setSelectedGame] = useState<string>(games[0]?.id ?? "");
  const [results, setResults] = useState<Result[]>([]);
  const [loadingResults, setLoadingResults] = useState(false);
  const [drawDate, setDrawDate] = useState(lotteryDate());
  const [drawTime, setDrawTime] = useState("13:00");
  const [animalNumber, setAnimalNumber] = useState<number>(0);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [animalList, setAnimalList] = useState<AnimalListItem[]>(
    DEFAULT_ANIMALS.map((a) => ({ number: a.number, name: a.name, label: null })),
  );

  useEffect(() => {
    if (games.length > 0 && !selectedGame) {
      setSelectedGame(games[0]!.id);
    }
  }, [games, selectedGame]);

  useEffect(() => {
    if (!selectedGame) return;
    fetchAnimalList(selectedGame).then(setAnimalList);
    setAnimalNumber(0);
  }, [selectedGame]);

  const fetchResults = useCallback(async () => {
    if (!selectedGame) return;
    setLoadingResults(true);
    const { data } = await supabase
      .from("results")
      .select("*")
      .eq("game_id", selectedGame)
      .order("draw_date", { ascending: false })
      .order("draw_time", { ascending: false })
      .limit(20);
    setResults((data ?? []) as Result[]);
    setLoadingResults(false);
  }, [selectedGame]);

  useEffect(() => {
    fetchResults();
  }, [fetchResults]);

  async function handleAddResult() {
    if (!selectedGame) return;
    setSaving(true);
    setMessage(null);

    const animal = animalList.find((a) => a.number === animalNumber);
    const animalName = animal ? animal.name : `Animal ${animalNumber}`;

    const resultPayload = {
      game_id: selectedGame,
      draw_date: drawDate,
      draw_time: drawTime + ":00",
      animal_number: animalNumber,
      animal_name: animalName,
      source: manualResultSource,
    };

    const { error } = await supabase
      .from("results")
      .upsert(resultPayload, { onConflict: "game_id,draw_date,draw_time" });

    if (error) {
      setMessage({ type: "err", text: error.message });
    } else {
      setMessage({ type: "ok", text: "Resultado guardado correctamente" });
      fetchResults();

      // Broadcast and queue announcement alert for this winning animal
      const gameObj = games.find((g) => g.id === selectedGame);
      const displayLabel = animal?.label ?? String(animalNumber).padStart(2, "0");

      // Query media (video / image) for this animal
      let animalImageUrl: string | null = null;
      try {
        const { data: imgData } = await supabase
          .from("animal_images")
          .select("image_url")
          .eq("game_id", selectedGame)
          .eq("animal_number", animalNumber)
          .maybeSingle();

        if (imgData?.image_url) {
          animalImageUrl = imgData.image_url;
        } else {
          const { data: anyImgData } = await supabase
            .from("animal_images")
            .select("image_url")
            .eq("animal_number", animalNumber)
            .limit(1);
          if (anyImgData && anyImgData.length > 0 && anyImgData[0]?.image_url) {
            animalImageUrl = anyImgData[0].image_url;
          }
        }
      } catch {
        // ignore
      }

      const alertItem = {
        id: `alert-${selectedGame}-${drawDate}-${drawTime}-${Date.now()}`,
        gameId: selectedGame,
        gameName: gameObj?.name ?? "Lotería",
        gameColor: gameObj?.color ?? "#3b82f6",
        gameLogoUrl: gameObj?.logo_url ?? null,
        drawDate,
        drawTime: drawTime + ":00",
        animalNumber,
        animalName,
        animalLabel: displayLabel,
        animalImageUrl,
        animalEmoji: getEmojiForNumber(animalNumber, animalName),
      };

      try {
        await fetch("/api/public/results/sync", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ result: resultPayload, alert: alertItem }),
        });
      } catch {
        // ignore
      }

      if (typeof window !== "undefined") {
        try {
          const list = JSON.parse(localStorage.getItem("pizarra_pending_result_alerts") || "[]");
          list.push(alertItem);
          localStorage.setItem("pizarra_pending_result_alerts", JSON.stringify(list));
          const bc = new BroadcastChannel("pizarra_lottery_channel");
          bc.postMessage({ type: "NEW_RESULT_ALERT", alert: alertItem });
          setTimeout(() => bc.close(), 1000);
        } catch {
          // ignore
        }
      }
    }
    setSaving(false);
    setTimeout(() => setMessage(null), 3000);
  }

  async function handleDeleteResult(id: string) {
    const { error } = await supabase.from("results").delete().eq("id", id);
    if (!error) fetchResults();
  }

  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<string | null>(null);

  async function handleTriggerSync() {
    setSyncing(true);
    setSyncResult(null);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      const res = await fetch("/api/public/results/sync", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.details || data.error || `HTTP ${res.status}`);
      }
      if (Array.isArray(data.results)) {
        const { mockStore } = await import("@/lib/mock-db");
        mockStore.results = data.results;
      }
      const reports = (data.reports || []) as Array<{ written?: number; preserved?: number }>;
      const totalWritten = reports.reduce((acc, r) => acc + (r.written || 0), 0);
      const totalPreserved = reports.reduce((acc, r) => acc + (r.preserved || 0), 0);
      setSyncResult(
        `Sincronización completada: ${totalWritten} resultados actualizados, ${totalPreserved} manuales preservados.`,
      );
      fetchResults();
    } catch (err) {
      setSyncResult(`Error al sincronizar: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setSyncing(false);
    }
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* TuAzar Automatic Sync Panel */}
      <div className="bg-slate-900 rounded-2xl border border-slate-800 p-6 flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-600/20 text-blue-400 flex items-center justify-center">
              <RefreshCw className={`w-5 h-5 ${syncing ? "animate-spin" : ""}`} />
            </div>
            <div>
              <h2 className="text-base font-semibold text-white">
                Sincronización Automática (LoteriaDeHoy + TuAzar)
              </h2>
              <p className="text-xs text-slate-400">
                Principal: loteriadehoy.com/animalitos/resultados/ • Respaldo: TuAzar
              </p>
            </div>
          </div>
          <Button
            onClick={handleTriggerSync}
            disabled={syncing}
            className="bg-blue-600 hover:bg-blue-500 text-white font-medium flex items-center gap-2"
          >
            {syncing ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <RefreshCw className="w-4 h-4" />
            )}
            {syncing ? "Sincronizando..." : "Sincronizar Ahora"}
          </Button>
        </div>

        {syncResult && (
          <div
            className={`text-xs px-4 py-2.5 rounded-lg ${
              syncResult.startsWith("Error")
                ? "bg-red-950/40 text-red-300 border border-red-800/50"
                : "bg-emerald-950/40 text-emerald-300 border border-emerald-800/50"
            }`}
          >
            {syncResult}
          </div>
        )}
      </div>

      {/* Add result form */}
      <div className="bg-slate-900 rounded-2xl border border-slate-800 p-6">
        <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <Plus className="w-5 h-5 text-blue-500" /> Agregar Resultado
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div>
            <label className="block text-xs text-slate-400 mb-1.5">Juego</label>
            <select
              value={selectedGame}
              onChange={(e) => setSelectedGame(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-blue-500"
            >
              {games.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs text-slate-400 mb-1.5">Fecha</label>
            <div className="relative">
              <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
              <input
                type="date"
                value={drawDate}
                onChange={(e) => setDrawDate(e.target.value)}
                className="w-full pl-9 pr-3 py-2.5 bg-slate-800 border border-slate-700 rounded-lg text-sm focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-xs text-slate-400">Hora</label>
              {games.find((g) => g.id === selectedGame) && (
                <span className="text-[10px] text-blue-400 font-mono">
                  {getGameScheduleTimes(games.find((g) => g.id === selectedGame)).length} horas
                  configuradas
                </span>
              )}
            </div>
            <div className="relative">
              <Clock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
              <input
                type="time"
                value={drawTime}
                onChange={(e) => setDrawTime(e.target.value)}
                className="w-full pl-9 pr-3 py-2.5 bg-slate-800 border border-slate-700 rounded-lg text-sm focus:outline-none focus:border-blue-500"
              />
            </div>
            {games.find((g) => g.id === selectedGame) && (
              <div className="flex flex-wrap gap-1 mt-2 max-h-24 overflow-y-auto">
                {getGameScheduleTimes(games.find((g) => g.id === selectedGame)).map((time) => (
                  <button
                    key={time}
                    type="button"
                    onClick={() => setDrawTime(time)}
                    className={`text-[10px] font-mono px-2 py-0.5 rounded transition ${
                      drawTime === time
                        ? "bg-blue-600 text-white font-bold"
                        : "bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    {time}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div>
            <label className="block text-xs text-slate-400 mb-1.5">Animal</label>
            <div className="relative">
              <PawPrint className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
              <select
                value={animalNumber}
                onChange={(e) => setAnimalNumber(parseInt(e.target.value, 10))}
                className="w-full pl-9 pr-3 py-2.5 bg-slate-800 border border-slate-700 rounded-lg text-sm focus:outline-none focus:border-blue-500"
              >
                {animalList.map((a) => (
                  <option key={a.number} value={a.number}>
                    {animalDisplayLabel(a)} - {a.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {message && (
          <div
            className={`mt-4 text-sm rounded-lg px-4 py-2.5 ${
              message.type === "ok"
                ? "text-green-400 bg-green-950/40 border border-green-800/50"
                : "text-red-400 bg-red-950/40 border border-red-800/50"
            }`}
          >
            {message.text}
          </div>
        )}

        <button
          onClick={handleAddResult}
          disabled={saving}
          className="mt-4 px-6 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 rounded-lg text-sm font-medium transition flex items-center gap-2"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
          Guardar Resultado
        </button>
      </div>

      {/* Results table */}
      <div className="bg-slate-900 rounded-2xl border border-slate-800 p-6">
        <h2 className="text-lg font-semibold mb-4">
          Resultados de {games.find((g) => g.id === selectedGame)?.name ?? ""}
        </h2>

        {loadingResults ? (
          <div className="text-slate-400 text-sm">Cargando...</div>
        ) : results.length === 0 ? (
          <div className="text-slate-500 text-sm py-6 text-center">
            No hay resultados registrados
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-slate-400 border-b border-slate-800">
                  <th className="pb-2 pr-4 font-medium">Fecha</th>
                  <th className="pb-2 pr-4 font-medium">Hora</th>
                  <th className="pb-2 pr-4 font-medium">N°</th>
                  <th className="pb-2 pr-4 font-medium">Animal</th>
                  <th className="pb-2 pr-4 font-medium">Origen</th>
                  <th className="pb-2 font-medium w-10"></th>
                </tr>
              </thead>
              <tbody>
                {results.map((r) => (
                  <tr key={r.id} className="border-b border-slate-800/50 hover:bg-slate-800/30">
                    <td className="py-2.5 pr-4 text-slate-300">
                      {new Date(r.draw_date + "T00:00:00").toLocaleDateString("es-VE", {
                        day: "2-digit",
                        month: "short",
                        year: "numeric",
                      })}
                    </td>
                    <td className="py-2.5 pr-4 text-slate-300">{r.draw_time.slice(0, 5)}</td>
                    <td className="py-2.5 pr-4 font-bold tabular-nums text-blue-400">
                      {(() => {
                        const animal = animalList.find((a) => a.number === r.animal_number);
                        return animal
                          ? animalDisplayLabel(animal)
                          : String(r.animal_number).padStart(2, "0");
                      })()}
                    </td>
                    <td className="py-2.5 pr-4 text-slate-300">{r.animal_name}</td>
                    <td className="py-2.5 pr-4">
                      {r.source === "automatic" ? "Automático" : "Manual"}
                    </td>
                    <td className="py-2.5">
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Corregir resultado ${r.draw_time.slice(0, 5)}`}
                        title="Corregir resultado"
                        onClick={() => {
                          setDrawDate(r.draw_date);
                          setDrawTime(r.draw_time.slice(0, 5));
                          setAnimalNumber(r.animal_number);
                          window.scrollTo({ top: 0, behavior: "smooth" });
                        }}
                      >
                        <Pencil />
                      </Button>
                      <button
                        onClick={() => handleDeleteResult(r.id)}
                        className="p-1.5 rounded-lg text-red-400 hover:bg-red-950/40 transition"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------- Games Manager ----------

function GamesManager({ games, onRefresh }: { games: Game[]; onRefresh: () => void }) {
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [color, setColor] = useState("#1a56db");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [orderingGame, setOrderingGame] = useState<string | null>(null);
  const [editingColor, setEditingColor] = useState<string | null>(null);
  const [uploadingLogo, setUploadingLogo] = useState<string | null>(null);
  const [savingMode, setSavingMode] = useState<string | null>(null);
  const [expandedScheduleGameId, setExpandedScheduleGameId] = useState<string | null>(null);
  const [newScheduleTimes, setNewScheduleTimes] = useState<Record<string, string>>({});
  const [scheduleMessage, setScheduleMessage] = useState<{ id: string; text: string } | null>(null);

  async function saveGameSchedules(game: Game, updatedTimes: string[]) {
    try {
      // 1. Update in Supabase
      try {
        await supabase.from("games").update({ schedule_times: updatedTimes }).eq("id", game.id);
      } catch {
        // ignore if column not present yet
      }

      // 2. Persist in localStorage
      if (typeof window !== "undefined") {
        try {
          const raw = localStorage.getItem("pizarra_persisted_games");
          const storedGames = raw ? JSON.parse(raw) : [];
          const idx = storedGames.findIndex((g: Game) => g.id === game.id);
          if (idx >= 0) {
            storedGames[idx] = { ...storedGames[idx], schedule_times: updatedTimes };
          } else {
            storedGames.push({ ...game, schedule_times: updatedTimes });
          }
          localStorage.setItem("pizarra_persisted_games", JSON.stringify(storedGames));
          localStorage.setItem(`pizarra_game_schedules_${game.id}`, JSON.stringify(updatedTimes));
        } catch {
          // ignore
        }
      }

      // 3. Persist to server backend immediately
      try {
        await fetch("/api/public/results/sync", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            gameUpdate: { id: game.id, schedule_times: updatedTimes },
          }),
        });
      } catch {
        // ignore
      }

      setScheduleMessage({ id: game.id, text: "Horarios guardados correctamente" });
      setTimeout(() => setScheduleMessage(null), 3000);
      onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al guardar horarios");
    }
  }

  async function handleAddScheduleTime(game: Game, timeStr: string) {
    const norm = normalizeScheduleTime(timeStr);
    if (!norm) return;
    const current = getGameScheduleTimes(game);
    if (current.includes(norm)) return;
    const updated = [...current, norm].sort((a, b) => a.localeCompare(b));
    await saveGameSchedules(game, updated);
    setNewScheduleTimes((prev) => ({ ...prev, [game.id]: "" }));
  }

  async function handleRemoveScheduleTime(game: Game, timeStr: string) {
    const current = getGameScheduleTimes(game);
    const updated = current.filter((t) => t !== timeStr);
    await saveGameSchedules(game, updated);
  }

  async function handleResetGameSchedules(game: Game) {
    const defaults = getDefaultGameScheduleTimes(game.slug);
    await saveGameSchedules(game, defaults);
  }

  async function handleModeChange(game: Game, mode: LoadingMode) {
    setSavingMode(game.id);
    setError(null);
    try {
      // 1. Update in Supabase / database
      const { error: modeError } = await supabase
        .from("games")
        .update({ loading_mode: mode })
        .eq("id", game.id);

      if (modeError) throw modeError;

      // 2. Persist to localStorage immediately
      if (typeof window !== "undefined") {
        try {
          const raw = localStorage.getItem("pizarra_persisted_games");
          const storedGames = raw ? JSON.parse(raw) : [];
          const idx = storedGames.findIndex((g: Game) => g.id === game.id);
          if (idx >= 0) {
            storedGames[idx] = { ...storedGames[idx], loading_mode: mode, mode };
          } else {
            storedGames.push({ ...game, loading_mode: mode, mode });
          }
          localStorage.setItem("pizarra_persisted_games", JSON.stringify(storedGames));
        } catch {
          // ignore
        }
      }

      // 3. Persist to server backend immediately so TuAzar synchronization skips it
      try {
        await fetch("/api/public/results/sync", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            gameUpdate: { id: game.id, loading_mode: mode, mode },
          }),
        });
      } catch {
        // ignore
      }

      onRefresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar el modo");
    } finally {
      setSavingMode(null);
    }
  }

  function slugify(text: string): string {
    return text
      .toLowerCase()
      .trim()
      .replace(/[áàäâ]/g, "a")
      .replace(/[éèëê]/g, "e")
      .replace(/[íìïî]/g, "i")
      .replace(/[óòöô]/g, "o")
      .replace(/[úùüû]/g, "u")
      .replace(/ñ/g, "n")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
  }

  async function handleAddGame() {
    if (!name.trim()) return;
    setSaving(true);
    setError(null);
    const { error: insertError } = await supabase.from("games").insert({
      name: name.trim().toUpperCase(),
      slug: slugify(name),
      color,
      display_order: games.length + 1,
      is_active: true,
    });
    if (insertError) {
      setError(insertError.message);
    } else {
      setName("");
      setColor("#1a56db");
      setShowForm(false);
      onRefresh();
    }
    setSaving(false);
  }

  async function handleToggleActive(game: Game) {
    await supabase.from("games").update({ is_active: !game.is_active }).eq("id", game.id);
    onRefresh();
  }

  async function handleDeleteGame(id: string) {
    await supabase.from("games").delete().eq("id", id);
    if (typeof window !== "undefined") {
      try {
        const saved = localStorage.getItem("pizarra_persisted_games");
        if (saved) {
          const list = JSON.parse(saved).filter((g: Game) => g.id !== id);
          localStorage.setItem("pizarra_persisted_games", JSON.stringify(list));
        }
      } catch {
        // ignore
      }
    }
    onRefresh();
  }

  async function handleReorder(game: Game, direction: "up" | "down") {
    setOrderingGame(game.id);
    const sorted = [...games].sort((a, b) => a.display_order - b.display_order);
    const idx = sorted.findIndex((g) => g.id === game.id);
    const swapIdx = direction === "up" ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= sorted.length) {
      setOrderingGame(null);
      return;
    }
    const swapGame = sorted[swapIdx];
    await Promise.all([
      supabase.from("games").update({ display_order: swapGame!.display_order }).eq("id", game.id),
      supabase.from("games").update({ display_order: game.display_order }).eq("id", swapGame!.id),
    ]);
    onRefresh();
    setOrderingGame(null);
  }

  async function handleColorChange(game: Game, newColor: string) {
    await supabase.from("games").update({ color: newColor }).eq("id", game.id);
    onRefresh();
  }

  async function handleLogoUpload(game: Game, file: File) {
    setUploadingLogo(game.id);
    setError(null);
    try {
      const ext = file.name.split(".").pop() ?? "png";
      const fileName = `logos/${game.id}-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("animal-images")
        .upload(fileName, file, { upsert: true });
      if (upErr) throw upErr;
      const url = await getMediaUrl("animal-images", fileName);
      const { error: updErr } = await supabase
        .from("games")
        .update({ logo_url: url })
        .eq("id", game.id);
      if (updErr) throw updErr;
      onRefresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo subir el logo");
    }
    setUploadingLogo(null);
  }

  async function handleLogoRemove(game: Game) {
    await supabase.from("games").update({ logo_url: null }).eq("id", game.id);
    onRefresh();
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Juegos Configurados ({games.length})</h2>
        <button
          onClick={() => setShowForm(!showForm)}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg text-sm font-medium flex items-center gap-2 transition"
        >
          <Plus className="w-4 h-4" /> Agregar Juego
        </button>
      </div>

      {showForm && (
        <div className="bg-slate-900 rounded-2xl border border-slate-800 p-6 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-slate-400 mb-1.5">Nombre del juego</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ej: LOTTO ACTIVO"
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1.5">Color</label>
              <div className="flex items-center gap-3">
                <input
                  type="color"
                  value={color}
                  onChange={(e) => setColor(e.target.value)}
                  className="w-12 h-10 rounded-lg cursor-pointer bg-slate-800 border border-slate-700"
                />
                <input
                  type="text"
                  value={color}
                  onChange={(e) => setColor(e.target.value)}
                  className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 text-sm font-mono focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>
          </div>
          {error && (
            <div className="text-sm text-red-400 bg-red-950/40 border border-red-800/50 rounded-lg px-4 py-2.5">
              {error}
            </div>
          )}
          <div className="flex gap-3">
            <button
              onClick={handleAddGame}
              disabled={saving}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 rounded-lg text-sm font-medium flex items-center gap-2"
            >
              {saving ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Check className="w-4 h-4" />
              )}
              Guardar
            </button>
            <button
              onClick={() => {
                setShowForm(false);
                setError(null);
              }}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 rounded-lg text-sm font-medium flex items-center gap-2"
            >
              <X className="w-4 h-4" /> Cancelar
            </button>
          </div>
        </div>
      )}

      {error && !showForm && (
        <p role="alert" className="text-destructive">
          {error}
        </p>
      )}
      <div className="space-y-3">
        {[...games]
          .sort((a, b) => a.display_order - b.display_order)
          .map((game, idx, arr) => (
            <div
              key={game.id}
              className="flex flex-wrap items-center gap-4 bg-slate-900 rounded-xl border border-slate-800 p-4"
            >
              <div className="flex flex-col gap-1">
                <button
                  onClick={() => handleReorder(game, "up")}
                  disabled={idx === 0 || orderingGame !== null}
                  className="p-1 rounded text-slate-400 hover:text-white disabled:opacity-30 transition"
                >
                  <ChevronUp className="w-4 h-4" />
                </button>
                <button
                  onClick={() => handleReorder(game, "down")}
                  disabled={idx === arr.length - 1 || orderingGame !== null}
                  className="p-1 rounded text-slate-400 hover:text-white disabled:opacity-30 transition"
                >
                  <ChevronDown className="w-4 h-4" />
                </button>
              </div>

              <div className="relative flex-shrink-0">
                <button
                  onClick={() => setEditingColor(editingColor === game.id ? null : game.id)}
                  className="w-10 h-10 rounded-lg ring-2 ring-slate-700 hover:ring-slate-500 transition"
                  style={{ backgroundColor: game.color }}
                  title="Cambiar color"
                />
                {editingColor === game.id && (
                  <div className="absolute left-0 top-12 z-20 bg-slate-800 rounded-xl border border-slate-700 p-3 shadow-2xl">
                    <div className="flex items-center gap-3">
                      <input
                        type="color"
                        value={game.color}
                        onChange={(e) => handleColorChange(game, e.target.value)}
                        className="w-12 h-10 rounded-lg cursor-pointer bg-slate-800 border border-slate-700"
                      />
                      <input
                        type="text"
                        value={game.color}
                        onChange={(e) => handleColorChange(game, e.target.value)}
                        className="w-24 bg-slate-900 border border-slate-700 rounded-lg px-2 py-2 text-xs font-mono focus:outline-none focus:border-blue-500"
                      />
                      <button
                        onClick={() => setEditingColor(null)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-700 transition"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                )}
              </div>
              <label
                className="relative flex-shrink-0 w-12 h-12 rounded-lg bg-slate-800 border border-dashed border-slate-600 hover:border-blue-500 cursor-pointer flex items-center justify-center overflow-hidden"
                title="Subir logo"
              >
                {uploadingLogo === game.id ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : game.logo_url ? (
                  <img
                    src={game.logo_url}
                    alt={`Logo ${game.name}`}
                    className="w-full h-full object-contain"
                  />
                ) : (
                  <span className="text-[10px] text-slate-400 text-center leading-tight">
                    Subir
                    <br />
                    logo
                  </span>
                )}
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleLogoUpload(game, f);
                    e.target.value = "";
                  }}
                />
              </label>
              <div className="flex-1 min-w-32">
                <div className="font-medium text-sm">{game.name}</div>
                <div className="text-xs text-slate-500">Orden: {game.display_order}</div>
                {game.logo_url && (
                  <button
                    onClick={() => handleLogoRemove(game)}
                    className="text-xs text-red-400 hover:text-red-300"
                  >
                    Quitar logo
                  </button>
                )}
              </div>

              <div className="w-40 shrink-0 space-y-1">
                <Select
                  value={(game.mode ?? game.loading_mode ?? "automatic").toLowerCase()}
                  disabled={savingMode !== null}
                  onValueChange={(value) => {
                    if (value === "manual" || value === "automatic") handleModeChange(game, value);
                  }}
                >
                  <SelectTrigger aria-label={`Modo de carga de ${game.name}`}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="manual">Manual</SelectItem>
                    <SelectItem value="automatic">Automático</SelectItem>
                  </SelectContent>
                </Select>
                {(game.mode ?? game.loading_mode ?? "automatic").toLowerCase() === "automatic" ? (
                  <p
                    className="text-xs text-emerald-400 font-medium truncate"
                    title={
                      (
                        {
                          "lotto-activo": "LoteriaDeHoy (Principal) / TuAzar (Respaldo)",
                          guacharo: "LoteriaDeHoy (Principal) / TuAzar (Respaldo)",
                          guacharito: "LoteriaDeHoy (Principal) / TuAzar (Respaldo)",
                          "selva-plus": "LoteriaDeHoy (Principal) / TuAzar (Respaldo)",
                          "loto-chaim-a": "LoteriaDeHoy (Principal) / TuAzar (Respaldo)",
                          granjita: "LoteriaDeHoy (Principal) / TuAzar (Respaldo)",
                          "monje-millonario": "LoteriaDeHoy (Principal) / TuAzar (Respaldo)",
                          "lotto-activo-internacional":
                            "LoteriaDeHoy (Principal) / TuAzar (Respaldo)",
                        } as Record<string, string>
                      )[game.slug] ?? "Sin fuente configurada"
                    }
                  >
                    {(
                      {
                        "lotto-activo": "LoteriaDeHoy (LOTTO ACTIVO)",
                        guacharo: "LoteriaDeHoy (GUACHARO)",
                        guacharito: "LoteriaDeHoy (GUACHARITO)",
                        "selva-plus": "LoteriaDeHoy (SELVA PLUS)",
                        "loto-chaim-a": "LoteriaDeHoy (LOTO CHAIMA)",
                        granjita: "LoteriaDeHoy (GRANJITA)",
                        "monje-millonario": "LoteriaDeHoy (MONJE MILL.)",
                        "lotto-activo-internacional": "LoteriaDeHoy (LOTTO INT.)",
                      } as Record<string, string>
                    )[game.slug] ?? "Fuente pendiente"}
                  </p>
                ) : (
                  <p
                    className="text-xs text-amber-400 font-medium truncate"
                    title="Carga manual activa: los resultados se ingresan desde el panel y la sincronización automática no los modificará"
                  >
                    Modo manual activo
                  </p>
                )}
              </div>

              <span
                className={`text-xs px-2 py-1 rounded-full ${
                  game.is_active
                    ? "bg-green-950/40 text-green-400 border border-green-800/50"
                    : "bg-slate-800 text-slate-500"
                }`}
              >
                {game.is_active ? "Activo" : "Inactivo"}
              </span>

              <button
                onClick={() => handleToggleActive(game)}
                className="text-xs px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 transition"
              >
                {game.is_active ? "Desactivar" : "Activar"}
              </button>

              <button
                type="button"
                onClick={() =>
                  setExpandedScheduleGameId(expandedScheduleGameId === game.id ? null : game.id)
                }
                className={`text-xs px-3 py-1.5 rounded-lg border flex items-center gap-1.5 transition ${
                  expandedScheduleGameId === game.id
                    ? "bg-blue-600 text-white border-blue-500 shadow-sm"
                    : "bg-slate-800 hover:bg-slate-700 text-blue-400 border-slate-700"
                }`}
                title="Configurar y crear las horas de sorteo de este juego"
              >
                <Clock className="w-3.5 h-3.5" />
                Horarios ({getGameScheduleTimes(game).length})
                {expandedScheduleGameId === game.id ? (
                  <ChevronUp className="w-3.5 h-3.5" />
                ) : (
                  <ChevronDown className="w-3.5 h-3.5" />
                )}
              </button>

              <button
                onClick={() => handleDeleteGame(game.id)}
                className="p-2 rounded-lg text-red-400 hover:bg-red-950/40 transition"
              >
                <Trash2 className="w-4 h-4" />
              </button>

              {expandedScheduleGameId === game.id && (
                <div className="w-full bg-slate-950/90 rounded-xl border border-blue-900/50 p-4 mt-2 space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800/80 pb-3">
                    <div>
                      <h4 className="text-sm font-semibold text-white flex items-center gap-2">
                        <Clock className="w-4 h-4 text-blue-400" />
                        Horas de sorteo de {game.name}
                      </h4>
                      <p className="text-xs text-slate-400 mt-0.5">
                        Configura las horas exactas de este juego. Solo estas horas se mostrarán en
                        la pizarra diaria.
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {scheduleMessage?.id === game.id && (
                        <span className="text-xs text-green-400 font-medium">
                          {scheduleMessage.text}
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={() => handleResetGameSchedules(game)}
                        className="text-xs px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition"
                        title="Volver a las horas predeterminadas de este juego"
                      >
                        Restablecer Horas Oficiales
                      </button>
                    </div>
                  </div>

                  {/* Form to add new hour */}
                  <div className="flex flex-wrap items-center gap-2 bg-slate-900/60 p-3 rounded-lg border border-slate-800">
                    <label className="text-xs text-slate-300 font-medium">
                      Nueva hora de sorteo:
                    </label>
                    <input
                      type="time"
                      value={newScheduleTimes[game.id] || ""}
                      onChange={(e) =>
                        setNewScheduleTimes((prev) => ({ ...prev, [game.id]: e.target.value }))
                      }
                      className="bg-slate-950 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-blue-500 font-mono"
                    />
                    <button
                      type="button"
                      onClick={() => handleAddScheduleTime(game, newScheduleTimes[game.id] || "")}
                      disabled={!newScheduleTimes[game.id]}
                      className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white rounded-lg text-xs font-medium flex items-center gap-1.5 transition"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      Agregar Hora
                    </button>
                  </div>

                  {/* Configured hours list */}
                  <div className="space-y-2">
                    <div className="text-xs font-semibold text-slate-400 flex items-center justify-between">
                      <span>Horas activas ({getGameScheduleTimes(game).length} sorteos):</span>
                      <span className="text-[10px] text-slate-500">
                        Pulsa la X en cualquier hora que no deba estar
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {getGameScheduleTimes(game).map((time) => (
                        <div
                          key={time}
                          className="flex items-center gap-2 bg-slate-900 border border-slate-700 hover:border-slate-500 rounded-lg px-2.5 py-1 text-xs text-slate-200 transition"
                        >
                          <span className="font-mono font-bold text-blue-300">
                            {formatScheduleTime(time)}
                          </span>
                          <span className="text-[10px] text-slate-500 font-mono">({time})</span>
                          <button
                            type="button"
                            onClick={() => handleRemoveScheduleTime(game, time)}
                            className="text-slate-400 hover:text-red-400 hover:bg-red-950/30 p-0.5 rounded transition"
                            title={`Eliminar hora ${time}`}
                            aria-label={`Eliminar hora ${time}`}
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))}
      </div>
    </div>
  );
}

// ---------- Animals Manager ----------

function AnimalsManager({ games }: { games: Game[] }) {
  const [selectedGame, setSelectedGame] = useState<string>(games[0]?.id ?? "");
  const [images, setImages] = useState<Record<number, string>>({});
  const [animalList, setAnimalList] = useState<AnimalListItem[]>(
    DEFAULT_ANIMALS.map((a) => ({ number: a.number, name: a.name, label: null })),
  );
  const [animalCount, setAnimalCount] = useState<number>(38);
  const [loading, setLoading] = useState(true);
  const [uploadingFor, setUploadingFor] = useState<number | null>(null);
  const [bulkUploading, setBulkUploading] = useState(false);
  const [bulkProgress, setBulkProgress] = useState<{
    done: number;
    total: number;
    current: string;
  } | null>(null);
  const [savingList, setSavingList] = useState(false);
  const [listMessage, setListMessage] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [showListConfig, setShowListConfig] = useState(false);
  const [editingNames, setEditingNames] = useState<Record<number, string>>({});
  const fileRefs = useRef<Record<number, HTMLInputElement | null>>({});
  const bulkInputRef = useRef<HTMLInputElement | null>(null);

  const fetchAll = useCallback(async (gameId: string) => {
    if (!gameId) return;
    setLoading(true);

    const [imgRes, entriesRes] = await Promise.all([
      supabase.from("animal_images").select("*").eq("game_id", gameId),
      supabase
        .from("animal_entries")
        .select("*")
        .eq("game_id", gameId)
        .order("number", { ascending: true }),
    ]);

    const imgMap: Record<number, string> = {};
    for (const img of (imgRes.data ?? []) as AnimalImage[]) {
      imgMap[img.animal_number] = img.image_url;
    }
    setImages(imgMap);

    const entries = (entriesRes.data ?? []) as AnimalEntry[];
    if (entries.length > 0) {
      const list = entries.map((e) => ({ number: e.number, name: e.name, label: e.label }));
      setAnimalList(list);
      setAnimalCount(list.length);
      const namesMap: Record<number, string> = {};
      for (const e of entries) namesMap[e.number] = e.name;
      setEditingNames(namesMap);
    } else {
      const defaultList = DEFAULT_ANIMALS.map((a) => ({
        number: a.number,
        name: a.name,
        label: null,
      }));
      setAnimalList(defaultList);
      setAnimalCount(38);
      const namesMap: Record<number, string> = {};
      for (const a of DEFAULT_ANIMALS) namesMap[a.number] = a.name;
      setEditingNames(namesMap);
    }

    setLoading(false);
  }, []);

  useEffect(() => {
    if (games.length > 0 && !selectedGame) {
      setSelectedGame(games[0]!.id);
    }
  }, [games, selectedGame]);

  useEffect(() => {
    if (selectedGame) fetchAll(selectedGame);
  }, [selectedGame, fetchAll]);

  function normalizeText(text: string): string {
    return text
      .toLowerCase()
      .trim()
      .replace(/[áàäâ]/g, "a")
      .replace(/[éèëê]/g, "e")
      .replace(/[íìïî]/g, "i")
      .replace(/[óòöô]/g, "o")
      .replace(/[úùüû]/g, "u")
      .replace(/ñ/g, "n")
      .replace(/[^a-z0-9]+/g, "");
  }

  function parseAnimalNumberFromFileName(fileName: string): number | null {
    const base = fileName.replace(/\.[^.]+$/, "");
    const normalizedFile = normalizeText(base);

    // Special check for "00" or "ballena"
    if (base === "00" || normalizedFile === "00" || normalizedFile.includes("ballena")) {
      const ballena = animalList.find(
        (a) => a.label === "00" || normalizeText(a.name) === "ballena",
      );
      if (ballena) return ballena.number;
    }

    // Special check for "0" or "delfin"
    if (base === "0" || normalizedFile === "0" || normalizedFile.includes("delfin")) {
      const delfin = animalList.find(
        (a) => a.label === "0" || a.number === 0 || normalizeText(a.name) === "delfin",
      );
      if (delfin) return delfin.number;
    }

    // 1. Try matching by animal name first
    for (const animal of animalList) {
      const normalizedAnimal = normalizeText(animal.name);
      if (normalizedAnimal.length >= 3 && normalizedFile.includes(normalizedAnimal)) {
        return animal.number;
      }
    }

    // 2. Fall back to number extraction
    const match = base.match(/(\d+)/);
    if (!match) return null;
    const num = parseInt(match[1]!, 10);
    if (num >= 0 && num < animalCount) return num;
    return null;
  }

  async function handleBulkUpload(files: FileList) {
    if (!selectedGame || files.length === 0) return;
    setBulkUploading(true);
    const valid: { animalNumber: number; file: File }[] = [];
    const skipped: string[] = [];

    for (const file of Array.from(files)) {
      const num = parseAnimalNumberFromFileName(file.name);
      if (num !== null) {
        valid.push({ animalNumber: num, file });
      } else {
        skipped.push(file.name);
      }
    }

    const total = valid.length;
    for (let i = 0; i < valid.length; i++) {
      const { animalNumber, file } = valid[i]!;
      const animal = animalList.find((a) => a.number === animalNumber);
      const displayName = animal
        ? `${animalDisplayLabel(animal)} - ${animal.name}`
        : String(animalNumber);
      setBulkProgress({ done: i, total, current: displayName });
      await handleUpload(animalNumber, file);
    }

    setBulkProgress({ done: total, total, current: "" });
    setTimeout(() => {
      setBulkProgress(null);
      setBulkUploading(false);
    }, 1500);
  }

  async function handleUpload(animalNumber: number, file: File) {
    if (!selectedGame) return;
    if (!bulkUploading) setUploadingFor(animalNumber);
    try {
      let finalUrl = "";
      try {
        const formData = new FormData();
        formData.append("file", file);
        const res = await fetch("/api/media", {
          method: "POST",
          body: formData,
        });
        if (res.ok) {
          const resData = await res.json();
          if (resData.url) {
            finalUrl = resData.url;
          }
        }
      } catch (err) {
        console.warn("Upload to /api/media error, using dataUrl fallback:", err);
      }

      if (!finalUrl) {
        finalUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });
      }

      await supabase.from("animal_images").upsert(
        {
          game_id: selectedGame,
          animal_number: animalNumber,
          image_url: finalUrl,
        },
        { onConflict: "game_id,animal_number" },
      );

      // Sync to server disk storage so all TVs and devices have it
      try {
        await fetch("/api/public/results/sync", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            animalImage: {
              game_id: selectedGame,
              animal_number: animalNumber,
              image_url: finalUrl,
            },
          }),
        });
        const bc = new BroadcastChannel("pizarra_lottery_channel");
        bc.postMessage({
          type: "ANIMAL_MEDIA_UPDATED",
          gameId: selectedGame,
          animalNumber,
          imageUrl: finalUrl,
        });
        setTimeout(() => bc.close(), 1000);
      } catch {
        // ignore
      }

      setImages((prev) => ({ ...prev, [animalNumber]: finalUrl }));
    } catch (err) {
      console.error("Error al subir archivo:", err);
    } finally {
      if (!bulkUploading) setUploadingFor(null);
    }
  }

  async function handleSetImageUrl(animalNumber: number, url: string) {
    if (!selectedGame || !url.trim()) return;
    const finalUrl = url.trim();
    await supabase.from("animal_images").upsert(
      {
        game_id: selectedGame,
        animal_number: animalNumber,
        image_url: finalUrl,
      },
      { onConflict: "game_id,animal_number" },
    );

    try {
      await fetch("/api/public/results/sync", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          animalImage: {
            game_id: selectedGame,
            animal_number: animalNumber,
            image_url: finalUrl,
          },
        }),
      });
      const bc = new BroadcastChannel("pizarra_lottery_channel");
      bc.postMessage({
        type: "ANIMAL_MEDIA_UPDATED",
        gameId: selectedGame,
        animalNumber,
        imageUrl: finalUrl,
      });
      setTimeout(() => bc.close(), 1000);
    } catch {
      // ignore
    }

    setImages((prev) => ({ ...prev, [animalNumber]: finalUrl }));
  }

  async function handleDeleteImage(animalNumber: number) {
    if (!selectedGame) return;
    const ext = "png";
    const fileName = `${selectedGame}/animal-${animalNumber}.${ext}`;
    await supabase.storage.from("animal-images").remove([fileName]);
    await supabase
      .from("animal_images")
      .delete()
      .eq("game_id", selectedGame)
      .eq("animal_number", animalNumber);
    setImages((prev) => {
      const next = { ...prev };
      delete next[animalNumber];
      return next;
    });
  }

  function handleCountChange(newCount: number) {
    if (newCount < 1 || newCount > 200) return;
    setAnimalCount(newCount);
    const newList: AnimalListItem[] = [];
    for (let i = 0; i < newCount; i++) {
      const existing = animalList.find((a) => a.number === i);
      if (existing) {
        newList.push(existing);
      } else {
        const defaultAnimal = DEFAULT_ANIMALS[i % DEFAULT_ANIMALS.length]!;
        const name =
          i < DEFAULT_ANIMALS.length ? defaultAnimal.name : `${defaultAnimal.name} (${i})`;
        newList.push({ number: i, name, label: null });
        setEditingNames((prev) => ({ ...prev, [i]: name }));
      }
    }
    setAnimalList(newList);
  }

  function handleNameChange(number: number, name: string) {
    setEditingNames((prev) => ({ ...prev, [number]: name }));
  }

  async function handleSaveList() {
    if (!selectedGame) return;
    setSavingList(true);
    setListMessage(null);

    await supabase.from("animal_entries").delete().eq("game_id", selectedGame);

    const rows = [];
    for (let i = 0; i < animalCount; i++) {
      const name = editingNames[i]?.trim() || `Animal ${i}`;
      const existing = animalList.find((a) => a.number === i);
      rows.push({ game_id: selectedGame, number: i, name, label: existing?.label ?? null });
    }

    const { error } = await supabase.from("animal_entries").insert(rows);

    if (error) {
      setListMessage({ type: "err", text: error.message });
    } else {
      setAnimalList(rows.map((r) => ({ number: r.number, name: r.name, label: r.label })));
      setListMessage({
        type: "ok",
        text: `Lista de ${animalCount} animales guardada correctamente`,
      });
      setShowListConfig(false);
    }
    setSavingList(false);
    setTimeout(() => setListMessage(null), 3000);
  }

  const selectedGameObj = games.find((g) => g.id === selectedGame);

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div>
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <ImageIcon className="w-5 h-5 text-blue-500" /> Animales por Juego
        </h2>
        <p className="text-sm text-slate-400 mt-1">
          Cada juego tiene su propia lista de animales con sus imagenes y nombres.
        </p>
      </div>

      {/* Game selector */}
      <div className="bg-slate-900 rounded-2xl border border-slate-800 p-4">
        <label className="block text-xs text-slate-400 mb-2">Seleccionar Juego</label>
        <div className="flex flex-wrap gap-2">
          {games.map((g) => (
            <button
              key={g.id}
              onClick={() => setSelectedGame(g.id)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition flex items-center gap-2 ${
                selectedGame === g.id
                  ? "text-white"
                  : "bg-slate-800 text-slate-400 hover:text-white"
              }`}
              style={selectedGame === g.id ? { backgroundColor: g.color } : undefined}
            >
              <span className="w-3 h-3 rounded-full" style={{ backgroundColor: g.color }} />
              {g.name}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12 text-slate-400">
          <Loader2 className="w-6 h-6 animate-spin" /> <span className="ml-2">Cargando...</span>
        </div>
      ) : (
        <>
          {selectedGameObj && (
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div className="text-sm text-slate-400">
                <span className="font-medium" style={{ color: selectedGameObj.color }}>
                  {selectedGameObj.name}
                </span>{" "}
                - {animalList.length} animales
              </div>

              <div className="flex items-center gap-3">
                {bulkProgress && (
                  <div className="text-xs text-slate-400 flex items-center gap-2">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>
                      Subiendo {bulkProgress.done + 1}/{bulkProgress.total}: {bulkProgress.current}
                    </span>
                  </div>
                )}
                <button
                  onClick={() => setShowListConfig(!showListConfig)}
                  className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-sm font-medium flex items-center gap-2 transition"
                >
                  <ListPlus className="w-4 h-4" />
                  Configurar lista
                </button>
                <input
                  ref={bulkInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif,video/mp4,video/webm,video/ogg,video/quicktime"
                  multiple
                  className="hidden"
                  onChange={(e) => {
                    if (e.target.files && e.target.files.length > 0) {
                      handleBulkUpload(e.target.files);
                      e.target.value = "";
                    }
                  }}
                />
                <button
                  onClick={() => bulkInputRef.current?.click()}
                  disabled={bulkUploading}
                  className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-sm font-medium flex items-center gap-2 transition"
                >
                  {bulkUploading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Upload className="w-4 h-4" />
                  )}
                  Subir todas
                </button>
              </div>
            </div>
          )}

          {showListConfig && (
            <div className="bg-slate-900 rounded-2xl border border-slate-800 p-6 space-y-4">
              <div className="flex items-center gap-4 flex-wrap">
                <label className="text-sm text-slate-400">Cantidad de animales:</label>
                <input
                  type="number"
                  min={1}
                  max={200}
                  value={animalCount}
                  onChange={(e) => handleCountChange(parseInt(e.target.value, 10) || 1)}
                  className="w-24 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
                />
                <span className="text-xs text-slate-500">
                  (Guacharo: 77, Guacharito: 99, Selva Plus: 101)
                </span>
              </div>

              <div className="text-xs text-slate-500">
                Edita los nombres de los animales si lo deseas. Los animales del 0 al 37 usan los
                nombres estandar por defecto. Los demas se generan automaticamente.
              </div>

              <div className="max-h-80 overflow-y-auto rounded-lg border border-slate-800">
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 p-3">
                  {Array.from({ length: animalCount }, (_, i) => i).map((num) => {
                    const animal = animalList.find((a) => a.number === num);
                    return (
                      <div key={num} className="flex items-center gap-2">
                        <span className="text-xs font-mono text-slate-500 w-8 flex-shrink-0">
                          {animal ? animalDisplayLabel(animal) : String(num).padStart(2, "0")}
                        </span>
                        <input
                          type="text"
                          value={editingNames[num] ?? ""}
                          onChange={(e) => handleNameChange(num, e.target.value)}
                          className="flex-1 bg-slate-800 border border-slate-700 rounded px-2 py-1 text-xs focus:outline-none focus:border-blue-500"
                        />
                      </div>
                    );
                  })}
                </div>
              </div>

              {listMessage && (
                <div
                  className={`text-sm rounded-lg px-4 py-2.5 ${
                    listMessage.type === "ok"
                      ? "text-green-400 bg-green-950/40 border border-green-800/50"
                      : "text-red-400 bg-red-950/40 border border-red-800/50"
                  }`}
                >
                  {listMessage.text}
                </div>
              )}

              <div className="flex gap-3">
                <button
                  onClick={handleSaveList}
                  disabled={savingList}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 rounded-lg text-sm font-medium flex items-center gap-2 transition"
                >
                  {savingList ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Save className="w-4 h-4" />
                  )}
                  Guardar lista
                </button>
                <button
                  onClick={() => setShowListConfig(false)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 rounded-lg text-sm font-medium flex items-center gap-2"
                >
                  <X className="w-4 h-4" /> Cancelar
                </button>
              </div>
            </div>
          )}

          <div className="text-xs text-slate-400 bg-slate-900/70 rounded-xl p-3 border border-slate-800 flex items-start gap-2.5">
            <Video className="w-4 h-4 text-purple-400 flex-shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p>
                <strong className="text-white">Imágenes y Videos Animados:</strong> Ahora puedes
                subir tanto imágenes (.png, .jpg, .webp, .gif) como{" "}
                <strong>pequeños videos animados (.mp4, .webm, .ogg)</strong> para cada animalito.
                Se reproducirán en bucle continuo y sin sonido en la pizarra en vivo.
              </p>
              <p className="text-slate-500">
                Al subir por lote, el sistema reconoce el animal por número (ej:{" "}
                <span className="font-mono text-slate-300">05.mp4</span> o{" "}
                <span className="font-mono text-slate-300">animal-12.webm</span>) o por nombre (ej:{" "}
                <span className="font-mono text-slate-300">delfin.mp4</span> o{" "}
                <span className="font-mono text-slate-300">leon.gif</span>).
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {animalList.map((animal) => {
              const imgUrl = images[animal.number];
              const isVideo = isVideoMedia(imgUrl);
              return (
                <div
                  key={animal.number}
                  className="bg-slate-900 rounded-xl border border-slate-800 p-4 flex flex-col items-center gap-3 relative"
                >
                  <div className="text-xs text-slate-500 font-mono">
                    {animalDisplayLabel(animal)} · {animal.name}
                  </div>

                  <div className="w-20 h-20 rounded-lg bg-slate-800 flex items-center justify-center overflow-hidden relative">
                    <AnimalMedia
                      mediaUrl={imgUrl}
                      name={animal.name}
                      number={animal.number}
                      className="w-full h-full object-contain"
                      emojiClassName="text-3xl select-none"
                    />
                    {isVideo && (
                      <span className="absolute top-1 right-1 px-1.5 py-0.5 rounded bg-purple-600/95 text-[9px] font-bold text-white flex items-center gap-0.5 shadow-sm">
                        <Video className="w-2.5 h-2.5" /> VIDEO
                      </span>
                    )}
                  </div>

                  <input
                    ref={(el) => {
                      fileRefs.current[animal.number] = el;
                    }}
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/gif,video/mp4,video/webm,video/ogg,video/quicktime"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleUpload(animal.number, file);
                    }}
                  />

                  <div className="flex items-center gap-1.5 flex-wrap justify-center">
                    <button
                      onClick={() => fileRefs.current[animal.number]?.click()}
                      disabled={uploadingFor === animal.number}
                      className="px-2.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-xs font-medium flex items-center gap-1 transition"
                      title="Subir imagen o video animado desde este dispositivo"
                    >
                      {uploadingFor === animal.number ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Upload className="w-3.5 h-3.5" />
                      )}
                      <span>{imgUrl ? "Cambiar" : "Subir"}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const url = window.prompt(
                          `Pegar URL directa de imagen o video para ${animal.name} (.mp4, .webm, .gif, .png):`,
                          imgUrl || "",
                        );
                        if (url) handleSetImageUrl(animal.number, url);
                      }}
                      className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition"
                      title="Pegar enlace URL directo de imagen o video"
                    >
                      <Link2 className="w-3.5 h-3.5" />
                    </button>
                    {imgUrl && (
                      <button
                        onClick={() => handleDeleteImage(animal.number)}
                        className="p-1.5 rounded-lg text-red-400 hover:bg-red-950/40 transition"
                        title="Eliminar imagen o video"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

// ---------- Ads Manager ----------

const PLACEMENT_LABELS: Record<AdPlacement, string> = {
  top: "Arriba",
  bottom: "Abajo",
  sidebar: "Lateral",
  fullwidth: "Ancho completo",
};

function AdsManager() {
  const [ads, setAds] = useState<Ad[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Ad | null>(null);
  const [title, setTitle] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [placement, setPlacement] = useState<AdPlacement>("top");
  const [imageUrl, setImageUrl] = useState("");
  const [mediaType, setMediaType] = useState<AdMediaType>("image");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const fetchAds = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("ads")
      .select("*")
      .order("display_order", { ascending: true });
    setAds((data ?? []) as Ad[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchAds();
  }, [fetchAds]);

  function resetForm() {
    setTitle("");
    setLinkUrl("");
    setPlacement("top");
    setImageUrl("");
    setMediaType("image");
    setStartsAt("");
    setEndsAt("");
    setEditing(null);
    setError(null);
  }

  function startEdit(ad: Ad) {
    setEditing(ad);
    setTitle(ad.title);
    setLinkUrl(ad.link_url ?? "");
    setPlacement(ad.placement);
    setImageUrl(ad.image_url);
    setMediaType(ad.media_type ?? "image");
    setStartsAt(ad.starts_at ? ad.starts_at.slice(0, 10) : "");
    setEndsAt(ad.ends_at ? ad.ends_at.slice(0, 10) : "");
    setShowForm(true);
  }

  async function handleUpload(file: File) {
    setUploading(true);
    setError(null);
    const ext = file.name.split(".").pop()?.toLowerCase() ?? "png";
    const fileName = `ad-${Date.now()}.${ext}`;
    const { error: uploadError } = await supabase.storage
      .from("ads")
      .upload(fileName, file, { upsert: true });
    if (uploadError) {
      setError(uploadError.message);
      setUploading(false);
      return;
    }
    setImageUrl(await getMediaUrl("ads", fileName));
    setMediaType(file.type.startsWith("video/") ? "video" : "image");
    setUploading(false);
  }

  async function handleSave() {
    if (!imageUrl) {
      setError("Debes subir una imagen para el anuncio");
      return;
    }
    setSaving(true);
    setError(null);

    const payload = {
      title: title.trim(),
      image_url: imageUrl,
      media_type: mediaType,
      link_url: linkUrl.trim() || null,
      placement,
      is_active: true,
      starts_at: startsAt ? new Date(startsAt + "T00:00:00").toISOString() : null,
      ends_at: endsAt ? new Date(endsAt + "T23:59:59").toISOString() : null,
      display_order: editing ? editing.display_order : ads.length + 1,
    };

    let err;
    if (editing) {
      const res = await supabase.from("ads").update(payload).eq("id", editing.id);
      err = res.error;
    } else {
      const res = await supabase.from("ads").insert(payload);
      err = res.error;
    }

    if (err) {
      setError(err.message);
    } else {
      resetForm();
      setShowForm(false);
      fetchAds();
    }
    setSaving(false);
  }

  async function toggleActive(ad: Ad) {
    await supabase.from("ads").update({ is_active: !ad.is_active }).eq("id", ad.id);
    fetchAds();
  }

  async function handleDelete(ad: Ad) {
    await supabase.from("ads").delete().eq("id", ad.id);
    fetchAds();
  }

  async function handleReorder(ad: Ad, direction: "up" | "down") {
    const sorted = [...ads].sort((a, b) => a.display_order - b.display_order);
    const idx = sorted.findIndex((a) => a.id === ad.id);
    const swapIdx = direction === "up" ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= sorted.length) return;
    const swapAd = sorted[swapIdx];
    await Promise.all([
      supabase.from("ads").update({ display_order: swapAd!.display_order }).eq("id", ad.id),
      supabase.from("ads").update({ display_order: ad.display_order }).eq("id", swapAd!.id),
    ]);
    fetchAds();
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Megaphone className="w-5 h-5 text-blue-500" /> Paneles de Publicidad
          </h2>
          <p className="text-sm text-slate-400 mt-1">
            Sube imágenes publicitarias que aparecerán en la pizarra. Elige donde se muestran y
            opcionalmente un enlace.
          </p>
        </div>
        <button
          onClick={() => {
            resetForm();
            setShowForm(!showForm);
          }}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg text-sm font-medium flex items-center gap-2 transition"
        >
          <Plus className="w-4 h-4" /> Nuevo anuncio
        </button>
      </div>

      {showForm && (
        <div className="bg-slate-900 rounded-2xl border border-slate-800 p-6 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-slate-400 mb-1.5">Titulo (opcional)</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Ej: Promoción de octubre"
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1.5">Posicion</label>
              <select
                value={placement}
                onChange={(e) => setPlacement(e.target.value as AdPlacement)}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-blue-500"
              >
                {(Object.keys(PLACEMENT_LABELS) as AdPlacement[]).map((p) => (
                  <option key={p} value={p}>
                    {PLACEMENT_LABELS[p]}
                  </option>
                ))}
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs text-slate-400 mb-1.5">
                Enlace al hacer clic (opcional)
              </label>
              <div className="relative">
                <Link2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                <input
                  type="url"
                  value={linkUrl}
                  onChange={(e) => setLinkUrl(e.target.value)}
                  placeholder="https://..."
                  className="w-full pl-9 pr-3 py-2.5 bg-slate-800 border border-slate-700 rounded-lg text-sm focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1.5">
                Mostrar desde (opcional)
              </label>
              <input
                type="date"
                value={startsAt}
                onChange={(e) => setStartsAt(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1.5">
                Mostrar hasta (opcional)
              </label>
              <input
                type="date"
                value={endsAt}
                onChange={(e) => setEndsAt(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs text-slate-400 mb-1.5">
              Archivo multimedia (imagen o video)
            </label>
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif,video/mp4,video/webm,video/ogg"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleUpload(file);
              }}
            />
            {imageUrl ? (
              <div className="relative rounded-lg overflow-hidden border border-slate-700 max-w-md">
                {mediaType === "video" ? (
                  <video src={imageUrl} className="w-full h-32 object-cover" muted controls />
                ) : (
                  <img src={imageUrl} alt="Vista previa" className="w-full h-32 object-cover" />
                )}
                <button
                  onClick={() => fileRef.current?.click()}
                  className="absolute bottom-2 right-2 px-3 py-1.5 rounded-lg bg-slate-900/80 hover:bg-slate-800 text-xs font-medium flex items-center gap-1.5 transition"
                >
                  <Upload className="w-3.5 h-3.5" /> Cambiar
                </button>
              </div>
            ) : (
              <button
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
                className="w-full max-w-md h-32 rounded-lg border-2 border-dashed border-slate-700 hover:border-blue-500 flex items-center justify-center text-slate-500 hover:text-blue-400 transition"
              >
                {uploading ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin mr-2" /> Subiendo...
                  </>
                ) : (
                  <>
                    <Upload className="w-5 h-5 mr-2" /> Subir imagen o video
                  </>
                )}
              </button>
            )}
          </div>

          {error && (
            <div className="text-sm text-red-400 bg-red-950/40 border border-red-800/50 rounded-lg px-4 py-2.5">
              {error}
            </div>
          )}

          <div className="flex gap-3">
            <button
              onClick={handleSave}
              disabled={saving || uploading}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 rounded-lg text-sm font-medium flex items-center gap-2"
            >
              {saving ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Check className="w-4 h-4" />
              )}
              {editing ? "Guardar cambios" : "Publicar anuncio"}
            </button>
            <button
              onClick={() => {
                setShowForm(false);
                resetForm();
              }}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 rounded-lg text-sm font-medium flex items-center gap-2"
            >
              <X className="w-4 h-4" /> Cancelar
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-12 text-slate-400">
          <Loader2 className="w-6 h-6 animate-spin" /> <span className="ml-2">Cargando...</span>
        </div>
      ) : ads.length === 0 ? (
        <div className="text-center text-slate-500 py-12">
          No hay anuncios configurados. Crea el primero con el boton de arriba.
        </div>
      ) : (
        <div className="space-y-3">
          {[...ads]
            .sort((a, b) => a.display_order - b.display_order)
            .map((ad, idx, arr) => (
              <div
                key={ad.id}
                className="flex items-center gap-4 bg-slate-900 rounded-xl border border-slate-800 p-4 flex-wrap"
              >
                <div className="flex flex-col gap-1">
                  <button
                    onClick={() => handleReorder(ad, "up")}
                    disabled={idx === 0}
                    className="p-1 rounded text-slate-400 hover:text-white disabled:opacity-30 transition"
                  >
                    <ChevronUp className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleReorder(ad, "down")}
                    disabled={idx === arr.length - 1}
                    className="p-1 rounded text-slate-400 hover:text-white disabled:opacity-30 transition"
                  >
                    <ChevronDown className="w-4 h-4" />
                  </button>
                </div>

                <div className="w-24 h-14 rounded-lg bg-slate-800 overflow-hidden flex-shrink-0">
                  {ad.media_type === "video" ? (
                    <video src={ad.image_url} className="w-full h-full object-cover" muted />
                  ) : (
                    <img src={ad.image_url} alt={ad.title} className="w-full h-full object-cover" />
                  )}
                </div>

                <div className="flex-1 min-w-[160px]">
                  <div className="font-medium text-sm">{ad.title || "Sin titulo"}</div>
                  <div className="text-xs text-slate-500 mt-0.5">
                    {PLACEMENT_LABELS[ad.placement]}
                    {ad.link_url && (
                      <span className="ml-2 flex items-center gap-1 inline-flex">
                        <Link2 className="w-3 h-3" /> Enlace
                      </span>
                    )}
                  </div>
                </div>

                <span
                  className={`text-xs px-2 py-1 rounded-full ${
                    ad.is_active
                      ? "bg-green-950/40 text-green-400 border border-green-800/50"
                      : "bg-slate-800 text-slate-500 border border-slate-700"
                  }`}
                >
                  {ad.is_active ? "Activo" : "Pausado"}
                </span>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => toggleActive(ad)}
                    className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
                    title={ad.is_active ? "Pausar" : "Activar"}
                  >
                    {ad.is_active ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                  <button
                    onClick={() => startEdit(ad)}
                    className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-medium transition"
                  >
                    Editar
                  </button>
                  <button
                    onClick={() => handleDelete(ad)}
                    className="p-2 rounded-lg text-red-400 hover:bg-red-950/40 transition"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
        </div>
      )}
    </div>
  );
}
