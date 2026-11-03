import { useState } from "react";
import { Hash } from "lucide-react";
import { useBoardSettings } from "@/context/BoardSettingsContext";
import {
  TRIPLE_GAMES,
  formatZodiacSign,
  type TripleGameConfig,
  type TripleResult,
} from "@/lib/triples";

interface TriplesBoardProps {
  results: TripleResult[];
  loading?: boolean;
}

function formatTime(timeStr: string): string {
  const [h, m] = timeStr.split(":");
  const hour = parseInt(h ?? "0", 10);
  const ampm = hour >= 12 ? "PM" : "AM";
  const displayHour = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
  return `${displayHour}:${m || "00"} ${ampm}`;
}

function findTripleForTimeSlot(results: TripleResult[], timeSlot: string): TripleResult | undefined {
  const normSlot = timeSlot.substring(0, 5).replace(/^0/, "");
  return results.find((r) => {
    const rShort = r.draw_time.substring(0, 5).replace(/^0/, "");
    return rShort === normSlot;
  });
}

function getDynamicGridStyle(count: number): React.CSSProperties {
  const cols = count <= 4 ? 2 : 4;
  const rows = Math.ceil(count / cols);
  return {
    gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
    gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))`,
  };
}

export default function TriplesBoard({ results, loading = false }: TriplesBoardProps) {
  const { settings } = useBoardSettings();

  if (loading && results.length === 0) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-pulse text-slate-400 font-medium">
          Cargando resultados de Triples...
        </div>
      </div>
    );
  }

  return (
    <div
      className="board-fluid-grid grid h-full w-full min-h-0 min-w-0 auto-rows-fr overflow-hidden"
      style={getDynamicGridStyle(TRIPLE_GAMES.length)}
    >
      {TRIPLE_GAMES.map((game) => {
        const gameResults = results
          .filter((r) => r.game_id === game.id || r.game_slug === game.slug)
          .sort((a, b) => a.draw_time.localeCompare(b.draw_time));

        return (
          <TripleGameCard
            key={game.id}
            game={game}
            results={gameResults}
            settings={settings}
          />
        );
      })}
    </div>
  );
}

function TripleGameCard({
  game,
  results,
  settings,
}: {
  game: TripleGameConfig;
  results: TripleResult[];
  settings: ReturnType<typeof useBoardSettings>["settings"];
}) {
  const [imgError, setImgError] = useState(false);
  const scheduleTimes = game.schedule_times;
  const validSlots = new Set(scheduleTimes.map((t) => t.substring(0, 5).replace(/^0/, "")));
  const validResults = results
    .filter((r) => {
      const slot = r.draw_time.substring(0, 5).replace(/^0/, "");
      return validSlots.has(slot) && Boolean(r.triple_a);
    })
    .sort((a, b) => a.draw_time.localeCompare(b.draw_time));

  const latestResult = validResults.length > 0 ? validResults[validResults.length - 1] : null;
  const isSingleColumn = game.columns.length === 1;

  // Choose optimal columns for the bottom schedule matrix based on number of daily draws
  const matrixColsClass =
    scheduleTimes.length <= 3
      ? "grid-cols-3"
      : scheduleTimes.length <= 6
        ? "grid-cols-3"
        : "grid-cols-4";

  return (
    <div
      className="fluid-game-card h-full w-full min-h-0 min-w-0 overflow-hidden flex flex-col justify-between"
      style={{
        backgroundColor: settings.card_color || "#000000",
        borderColor: game.color,
        boxShadow: `0 0 15px ${game.color}15`,
      }}
    >
      {/* Top Header */}
      <div className="fluid-card-header shrink-0">
        {game.logo_url && !imgError ? (
          <div
            className="rounded-full border border-slate-800 bg-slate-900 flex items-center justify-center overflow-hidden shrink-0 fluid-logo-wrapper"
            style={{ width: "var(--display-logo)", height: "var(--display-logo)" }}
          >
            <img
              src={game.logo_url}
              alt={game.name}
              onError={() => setImgError(true)}
              className="w-full h-full object-contain max-h-full max-w-full p-0.5"
            />
          </div>
        ) : (
          <div
            className="rounded-full flex items-center justify-center text-xs font-black shrink-0 fluid-logo-wrapper border border-slate-700/80"
            style={{
              backgroundColor: `${game.color}25`,
              color: game.color,
              width: "var(--display-logo)",
              height: "var(--display-logo)",
            }}
          >
            777
          </div>
        )}
        <div className="flex-1 min-w-0">
          <h2 className="fluid-game-title truncate" style={{ color: game.color }}>
            {game.name}
          </h2>
          <p className="fluid-game-subtitle font-mono truncate">
            {validResults.length >= scheduleTimes.length
              ? "Sorteos de hoy completos"
              : "Resultados de Triples"}
          </p>
        </div>
      </div>

      {/* Hero Center Display (Latest Triple Result) */}
      <div
        className="fluid-hero-banner shrink-0 min-h-0 overflow-hidden"
        style={{
          backgroundColor: settings.result_row_color || "rgba(15, 23, 42, 0.8)",
        }}
      >
        <div
          className="fluid-hero-avatar rounded-xl bg-slate-950/90 border flex flex-col items-center justify-center shrink-0 overflow-hidden shadow-inner px-1.5"
          style={{
            borderColor: latestResult ? game.color : "rgba(51, 65, 85, 0.8)",
            width: "calc(clamp(2.2rem, min(5.5vh, 4vw), 4.8rem) * var(--display-animal-scale, 1))",
            height: "calc(clamp(2.2rem, min(5.5vh, 4vw), 4.8rem) * var(--display-animal-scale, 1))",
          }}
        >
          {latestResult ? (
            <>
              <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400 leading-none">
                {isSingleColumn ? "TRIPLE" : "A"}
              </span>
              <span
                className="font-mono font-black tracking-tight tabular-nums leading-none mt-0.5 text-[clamp(0.95rem,1.6vw,1.6rem)]"
                style={{ color: game.color }}
              >
                {latestResult.triple_a}
              </span>
            </>
          ) : (
            <Hash className="w-5 h-5 sm:w-6 sm:h-6 text-slate-500" />
          )}
        </div>

        <div className="flex-1 text-right min-w-0 overflow-hidden">
          <div
            className="h-1.5 w-10 sm:w-14 rounded-full ml-auto mb-1 shadow-sm"
            style={{ backgroundColor: game.color }}
          />
          {latestResult ? (
            <div className="truncate">
              {isSingleColumn ? (
                <div className="fluid-hero-text font-black text-white tracking-wide truncate font-mono tabular-nums">
                  TRIPLE: {latestResult.triple_a}
                </div>
              ) : (
                <div className="fluid-hero-text font-black text-white tracking-tight truncate font-mono tabular-nums flex items-center justify-end gap-1.5 flex-wrap">
                  <span>A:{latestResult.triple_a}</span>
                  {latestResult.triple_b && (
                    <span className="text-slate-200">B:{latestResult.triple_b}</span>
                  )}
                  {(latestResult.triple_c || latestResult.zodiac_sign) && (
                    <span style={{ color: game.color }}>
                      {latestResult.triple_c ? `${latestResult.triple_c} ` : ""}
                      {formatZodiacSign(latestResult.zodiac_sign)}
                    </span>
                  )}
                </div>
              )}
              <div className="fluid-hero-time font-mono font-semibold text-slate-300 mt-0.5 truncate">
                {formatTime(latestResult.draw_time)}
              </div>
            </div>
          ) : (
            <div className="fluid-hero-text font-bold text-slate-400 tracking-wide truncate">
              Esperando sorteo
            </div>
          )}
        </div>
      </div>

      {/* Bottom Schedule Matrix Grid */}
      <div
        className={`fluid-schedule-matrix grid flex-1 h-full w-full min-h-0 min-w-0 ${matrixColsClass} auto-rows-fr overflow-hidden`}
      >
        {scheduleTimes.map((timeSlot) => {
          const res = findTripleForTimeSlot(validResults, timeSlot);

          return (
            <div
              key={timeSlot}
              className={`fluid-schedule-cell h-full w-full min-h-0 min-w-0 overflow-hidden transition flex flex-col items-center justify-center px-0.5 ${
                res ? "border-slate-700/90 shadow-sm" : "border-slate-800/80 opacity-80"
              }`}
              style={{
                backgroundColor: res
                  ? settings.result_row_color || "rgba(15, 23, 42, 0.9)"
                  : "rgba(2, 6, 23, 0.6)",
              }}
            >
              <div className="fluid-cell-time truncate w-full text-center">
                {formatTime(timeSlot)}
              </div>
              <div className="fluid-cell-result truncate w-full text-center font-mono tabular-nums">
                {res ? (
                  isSingleColumn ? (
                    <span style={{ color: game.color }} className="font-black">
                      {res.triple_a}
                    </span>
                  ) : (
                    <div className="flex flex-col items-center justify-center leading-tight">
                      <span style={{ color: game.color }} className="font-black text-[0.82em]">
                        {res.triple_a}
                        {res.triple_b ? ` · ${res.triple_b}` : ""}
                      </span>
                      {(res.triple_c || res.zodiac_sign) && (
                        <span className="text-[0.68em] text-amber-300 font-bold leading-none mt-0.5">
                          {res.triple_c ?? ""}
                          {res.zodiac_sign ? ` ${formatZodiacSign(res.zodiac_sign)}` : ""}
                        </span>
                      )}
                    </div>
                  )
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
