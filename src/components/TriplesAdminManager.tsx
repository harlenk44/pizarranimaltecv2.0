import { useState, useEffect, useCallback } from "react";
import {
  TRIPLE_GAMES,
  ZODIAC_SIGNS,
  buildTripleAlertItem,
  formatZodiacSign,
  type TripleResult,
} from "@/lib/triples";
import { lotteryDate } from "@/lib/lottery-date";
import { formatScheduleTime } from "@/lib/game-schedules";
import {
  Hash,
  Plus,
  RefreshCw,
  Trash2,
  Check,
  Loader2,
  Pencil,
  Calendar,
  Clock,
} from "lucide-react";

const TRIPLE_STORAGE_KEY = "pizarra_triple_results";

export default function TriplesAdminManager() {
  const [results, setResults] = useState<TripleResult[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [syncing, setSyncing] = useState<boolean>(false);
  const [saving, setSaving] = useState<boolean>(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  const [selectedDate, setSelectedDate] = useState<string>(() => lotteryDate());
  const [selectedGameId, setSelectedGameId] = useState<string>(
    TRIPLE_GAMES[0]?.id ?? "triple-facil",
  );
  const selectedGame = TRIPLE_GAMES.find((g) => g.id === selectedGameId) ?? TRIPLE_GAMES[0]!;

  const [drawTime, setDrawTime] = useState<string>(selectedGame.schedule_times[0] ?? "08:00:00");
  const [tripleA, setTripleA] = useState<string>("");
  const [tripleB, setTripleB] = useState<string>("");
  const [tripleC, setTripleC] = useState<string>("");
  const [zodiacSign, setZodiacSign] = useState<string>("ARI");

  const showToast = (msg: string) => {
    setFeedback(msg);
    setTimeout(() => {
      setFeedback((prev) => (prev === msg ? null : prev));
    }, 3500);
  };

  // Update default draw time when game changes
  useEffect(() => {
    if (!selectedGame.schedule_times.includes(drawTime)) {
      setDrawTime(selectedGame.schedule_times[0] ?? "08:00:00");
    }
  }, [selectedGame, drawTime]);

  const fetchTriples = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/public/results/sync");
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.tripleResults)) {
          setResults(data.tripleResults);
          try {
            localStorage.setItem(TRIPLE_STORAGE_KEY, JSON.stringify(data.tripleResults));
          } catch {
            // ignore
          }
          setLoading(false);
          return;
        }
      }
    } catch {
      // fallback to localStorage
    }

    try {
      const raw = localStorage.getItem(TRIPLE_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) setResults(parsed);
      }
    } catch {
      // ignore
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchTriples();
  }, [fetchTriples]);

  const handleSyncNow = async () => {
    setSyncing(true);
    try {
      const res = await fetch("/api/public/results/sync", { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.tripleResults)) {
          setResults(data.tripleResults);
          try {
            localStorage.setItem(TRIPLE_STORAGE_KEY, JSON.stringify(data.tripleResults));
          } catch {
            // ignore
          }
          showToast(
            `Sincronización completada (${data.tripleResults.length} sorteos de Triples activos hoy).`,
          );
        }
      }
    } catch {
      showToast("Error al conectar con el sincronizador de Triples.");
    } finally {
      setSyncing(false);
    }
  };

  const handleSaveManual = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanA = tripleA.replace(/[^0-9]/g, "").slice(0, 4);
    if (cleanA.length < 2) {
      showToast("Ingrese un número válido para el Triple principal.");
      return;
    }

    const hasB = selectedGame.columns.includes("B");
    const hasC = selectedGame.columns.includes("C");
    const hasSign = selectedGame.columns.includes("SIGN");

    const cleanB = hasB ? tripleB.replace(/[^0-9]/g, "").slice(0, 4) || null : null;
    const cleanC = hasC ? tripleC.replace(/[^0-9]/g, "").slice(0, 4) || null : null;
    const cleanSign = hasSign ? formatZodiacSign(zodiacSign) || null : null;

    const newEntry: TripleResult = {
      id: `triple-${selectedGame.id}-${selectedDate}-${drawTime}`,
      game_id: selectedGame.id,
      game_slug: selectedGame.slug,
      draw_date: selectedDate,
      draw_time: drawTime,
      triple_a: cleanA,
      triple_b: cleanB,
      triple_c: cleanC,
      zodiac_sign: cleanSign,
      source: "manual",
      created_at: new Date().toISOString(),
    };

    const alertPayload = buildTripleAlertItem(newEntry, selectedGame);

    setSaving(true);
    try {
      const res = await fetch("/api/public/results/sync", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tripleResult: newEntry,
          alert: alertPayload,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.tripleResults)) {
          setResults(data.tripleResults);
          try {
            localStorage.setItem(TRIPLE_STORAGE_KEY, JSON.stringify(data.tripleResults));
          } catch {
            // ignore
          }
        }
      }

      // Broadcast to open tabs/TVs
      try {
        const bc = new BroadcastChannel("pizarra_lottery_channel");
        bc.postMessage({ type: "NEW_RESULT_ALERT", alert: alertPayload });
        bc.close();
      } catch {
        // ignore
      }

      setTripleA("");
      setTripleB("");
      setTripleC("");
      showToast(`Resultado de ${selectedGame.name} (${formatScheduleTime(drawTime)}) publicado.`);
    } catch {
      showToast("Error al guardar el resultado de Triple.");
    } finally {
      setSaving(false);
    }
  };

  const handleEditRow = (row: TripleResult) => {
    setSelectedGameId(row.game_id);
    setSelectedDate(row.draw_date);
    setDrawTime(row.draw_time);
    setTripleA(row.triple_a);
    setTripleB(row.triple_b ?? "");
    setTripleC(row.triple_c ?? "");
    if (row.zodiac_sign) setZodiacSign(row.zodiac_sign);
  };

  const handleDeleteRow = async (id: string) => {
    try {
      const res = await fetch("/api/public/results/sync", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deleteTripleId: id }),
      });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.tripleResults)) {
          setResults(data.tripleResults);
          try {
            localStorage.setItem(TRIPLE_STORAGE_KEY, JSON.stringify(data.tripleResults));
          } catch {
            // ignore
          }
        }
      } else {
        setResults((prev) => prev.filter((r) => r.id !== id));
      }
      showToast("Resultado de Triple eliminado.");
    } catch {
      showToast("No se pudo eliminar el resultado.");
    }
  };

  const dateFilteredResults = results.filter((r) => r.draw_date === selectedDate);

  return (
    <div className="space-y-6">
      {/* Header & Sync Action */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <Hash className="w-5 h-5 text-amber-400" />
            Gestión y Sincronización de Resultados de Triples
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Sincroniza automáticamente desde <strong className="text-slate-200">tuazar.com</strong>{" "}
            y <strong className="text-slate-200">loteriadehoy.com</strong> o carga resultados
            manualmente.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 bg-slate-950 border border-slate-800 rounded-xl px-3 py-2">
            <Calendar className="w-4 h-4 text-slate-400" />
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="bg-transparent text-xs font-mono text-white focus:outline-none"
            />
          </div>

          <button
            type="button"
            onClick={handleSyncNow}
            disabled={syncing}
            className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-bold flex items-center gap-2 shadow-lg shadow-emerald-600/20 transition cursor-pointer"
          >
            <RefreshCw className={`w-4 h-4 ${syncing ? "animate-spin" : ""}`} />
            <span>{syncing ? "Sincronizando..." : "Sincronizar Triples Ahora"}</span>
          </button>
        </div>
      </div>

      {feedback && (
        <div className="p-3.5 rounded-xl bg-blue-950/70 border border-blue-700/80 text-blue-200 text-xs font-semibold flex items-center gap-2">
          <Check className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{feedback}</span>
        </div>
      )}

      {/* Manual Entry / Override Form */}
      <form
        onSubmit={handleSaveManual}
        className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 space-y-4"
      >
        <h3 className="text-sm font-bold text-white flex items-center gap-2">
          <Plus className="w-4 h-4 text-blue-400" />
          Cargar o Corregir Resultado Manual de Triple
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3 items-end">
          {/* Lottery Selector */}
          <div className="lg:col-span-2">
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
              Lotería de Triple
            </label>
            <select
              value={selectedGameId}
              onChange={(e) => setSelectedGameId(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2.5 text-sm text-white font-semibold focus:outline-none focus:border-blue-500"
            >
              {TRIPLE_GAMES.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
          </div>

          {/* Schedule Time Selector */}
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
              Hora de Sorteo
            </label>
            <select
              value={drawTime}
              onChange={(e) => setDrawTime(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2.5 text-sm font-mono text-white focus:outline-none focus:border-blue-500"
            >
              {selectedGame.schedule_times.map((t) => (
                <option key={t} value={t}>
                  {formatScheduleTime(t)}
                </option>
              ))}
            </select>
          </div>

          {/* Triple A */}
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
              {selectedGame.columnLabels.A}
            </label>
            <input
              type="text"
              required
              maxLength={4}
              placeholder="Ej: 154"
              value={tripleA}
              onChange={(e) => setTripleA(e.target.value.replace(/[^0-9]/g, ""))}
              className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2.5 text-sm font-mono font-bold text-white text-center focus:outline-none focus:border-blue-500"
            />
          </div>

          {/* Triple B (if applicable) */}
          {selectedGame.columns.includes("B") && (
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                {selectedGame.columnLabels.B ?? "Triple B"}
              </label>
              <input
                type="text"
                maxLength={4}
                placeholder="Ej: 923"
                value={tripleB}
                onChange={(e) => setTripleB(e.target.value.replace(/[^0-9]/g, ""))}
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2.5 text-sm font-mono font-bold text-white text-center focus:outline-none focus:border-blue-500"
              />
            </div>
          )}

          {/* Triple C & Signo */}
          {selectedGame.columns.includes("C") && (
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1.5 truncate">
                  {selectedGame.columnLabels.C ?? "Triple C"}
                </label>
                <input
                  type="text"
                  maxLength={4}
                  placeholder="581"
                  value={tripleC}
                  onChange={(e) => setTripleC(e.target.value.replace(/[^0-9]/g, ""))}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-2.5 py-2.5 text-sm font-mono font-bold text-white text-center focus:outline-none focus:border-blue-500"
                />
              </div>
              {selectedGame.columns.includes("SIGN") && (
                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                    Signo
                  </label>
                  <select
                    value={zodiacSign}
                    onChange={(e) => setZodiacSign(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-2 py-2.5 text-xs font-mono font-bold text-amber-300 focus:outline-none focus:border-blue-500"
                  >
                    {ZODIAC_SIGNS.map((s) => (
                      <option key={s.code} value={s.code}>
                        {s.code} - {s.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex justify-end pt-2">
          <button
            type="submit"
            disabled={saving || !tripleA}
            className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs font-bold flex items-center gap-2 shadow-lg shadow-blue-600/20 transition cursor-pointer"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
            <span>Publicar y Anunciar Triple</span>
          </button>
        </div>
      </form>

      {/* Grid of the 8 Triples Lotteries with Today's Results */}
      {loading ? (
        <div className="py-12 flex items-center justify-center text-slate-400 gap-2 text-sm">
          <Loader2 className="w-5 h-5 animate-spin text-blue-500" />
          <span>Cargando sorteos de Triples...</span>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {TRIPLE_GAMES.map((game) => {
            const gResults = dateFilteredResults
              .filter((r) => r.game_id === game.id)
              .sort((a, b) => a.draw_time.localeCompare(b.draw_time));

            return (
              <div
                key={game.id}
                className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 space-y-3"
              >
                <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
                  <div className="flex items-center gap-2.5">
                    <span
                      className="w-3 h-3 rounded-full shrink-0"
                      style={{ backgroundColor: game.color }}
                    />
                    <h4 className="font-bold text-sm text-white">{game.name}</h4>
                  </div>
                  <span className="text-xs font-mono text-slate-400">
                    {gResults.length} / {game.schedule_times.length} sorteos
                  </span>
                </div>

                {gResults.length === 0 ? (
                  <p className="text-xs text-slate-500 py-3 text-center">
                    Sin resultados registrados para esta fecha.
                  </p>
                ) : (
                  <div className="divide-y divide-slate-800/70 max-h-60 overflow-y-auto pr-1">
                    {gResults.map((row) => (
                      <div
                        key={row.id}
                        className="py-2 flex items-center justify-between gap-2 text-xs"
                      >
                        <div className="flex items-center gap-2 font-mono text-slate-300">
                          <Clock className="w-3.5 h-3.5 text-slate-500" />
                          <span>{formatScheduleTime(row.draw_time)}</span>
                          <span className="text-[10px] text-slate-500">
                            · {row.source === "manual" ? "Manual" : "Auto"}
                          </span>
                        </div>

                        <div className="flex items-center gap-3 font-mono font-bold">
                          <span style={{ color: game.color }}>A: {row.triple_a}</span>
                          {row.triple_b && (
                            <span className="text-slate-200">B: {row.triple_b}</span>
                          )}
                          {(row.triple_c || row.zodiac_sign) && (
                            <span className="text-amber-300">
                              {row.triple_c ? `C: ${row.triple_c} ` : ""}
                              {row.zodiac_sign ?? ""}
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => handleEditRow(row)}
                            className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition cursor-pointer"
                            title="Editar sorteo"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteRow(row.id)}
                            className="p-1.5 rounded-lg hover:bg-red-950/60 text-slate-400 hover:text-red-400 transition cursor-pointer"
                            title="Eliminar sorteo"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
