import { useState, useMemo } from "react";
import { Hash } from "lucide-react";
import { useBoardSettings } from "@/context/BoardSettingsContext";
import { useLicenseContext } from "@/components/LicenseGate";
import {
  TRIPLE_GAMES,
  formatZodiacSign,
  type TripleGameConfig,
  type TripleResult,
} from "@/lib/triples";

interface TriplesBoardProps {
  results: TripleResult[];
  loading?: boolean;
  games?: TripleGameConfig[];
}

function formatTime(timeStr: string): string {
  const [h, m] = timeStr.split(":");
  const hour = parseInt(h ?? "0", 10);
  const ampm = hour >= 12 ? "PM" : "AM";
  const displayHour = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
  return `${displayHour}:${m || "00"} ${ampm}`;
}

function findTripleForTimeSlot(
  results: TripleResult[],
  timeSlot: string,
): TripleResult | undefined {
  const normSlot = timeSlot.substring(0, 5).replace(/^0/, "");
  return results.find((r) => {
    const rShort = r.draw_time.substring(0, 5).replace(/^0/, "");
    return rShort === normSlot;
  });
}

function getDynamicGridStyle(count: number): React.CSSProperties {
  if (count <= 1) {
    return {
      gridTemplateColumns: "repeat(1, minmax(0, 1fr))",
      gridTemplateRows: "repeat(1, minmax(0, 1fr))",
    };
  }
  if (count <= 2) {
    return {
      gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
      gridTemplateRows: "repeat(1, minmax(0, 1fr))",
    };
  }
  if (count <= 4) {
    return {
      gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
      gridTemplateRows: "repeat(2, minmax(0, 1fr))",
    };
  }
  if (count <= 6) {
    return {
      gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
      gridTemplateRows: "repeat(2, minmax(0, 1fr))",
    };
  }
  // Up to 8 items -> 4 columns x 2 rows
  const cols = 4;
  const rows = Math.ceil(count / cols);
  return {
    gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
    gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))`,
  };
}

export default function TriplesBoard({ results, loading = false, games }: TriplesBoardProps) {
  const { settings } = useBoardSettings();
  const { isGameAllowed } = useLicenseContext();

  const visibleTriples = useMemo(() => {
    if (games && games.length > 0) return games;
    return TRIPLE_GAMES.filter((g) => isGameAllowed(g.id) || isGameAllowed(g.slug));
  }, [games, isGameAllowed]);

  if (loading && results.length === 0) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-pulse text-slate-400 font-medium">
          Cargando resultados de Triples...
        </div>
      </div>
    );
  }

  if (visibleTriples.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-slate-400 text-sm">
        No hay loterías de Triples contratadas para esta licencia.
      </div>
    );
  }

  return (
    <div
      className="board-fluid-grid grid h-full w-full min-h-0 min-w-0 auto-rows-fr overflow-hidden"
      style={getDynamicGridStyle(visibleTriples.length)}
    >
      {visibleTriples.map((game) => {
        const gameResults = results
          .filter((r) => r.game_id === game.id || r.game_slug === game.slug)
          .sort((a, b) => a.draw_time.localeCompare(b.draw_time));

        return (
          <TripleGameCard key={game.id} game={game} results={gameResults} settings={settings} />
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
  const primaryLabel = (
    game.columnLabels?.A || (game.slug.includes("terminal") ? "Terminal" : "Triple")
  ).toUpperCase();
  const isHorizontalRowLayout = scheduleTimes.length <= 6;

  const matrixGridStyle: React.CSSProperties = isHorizontalRowLayout
    ? {
        gridTemplateColumns: "minmax(0, 1fr)",
        gridTemplateRows: `repeat(${Math.max(1, scheduleTimes.length)}, minmax(0, 1fr))`,
      }
    : {
        gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
      };

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
              : primaryLabel === "TERMINAL"
                ? "Resultados de Terminales"
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
                {isSingleColumn ? primaryLabel : "A"}
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
            <div className="min-w-0">
              {isSingleColumn ? (
                <div className="fluid-hero-text font-black text-white tracking-wide truncate font-mono tabular-nums">
                  {primaryLabel}: {latestResult.triple_a}
                </div>
              ) : (
                <div className="font-black text-white tracking-tight font-mono tabular-nums flex flex-col items-end leading-tight">
                  <div className="flex items-center justify-end gap-2 text-[clamp(0.8rem,min(2vh,1.2vw),1.35rem)]">
                    <span>A:{latestResult.triple_a}</span>
                    {latestResult.triple_b && (
                      <span className="text-slate-200">B:{latestResult.triple_b}</span>
                    )}
                  </div>
                  {(latestResult.triple_c || latestResult.zodiac_sign) && (
                    <div
                      className="text-[clamp(0.75rem,min(1.8vh,1.05vw),1.15rem)] font-extrabold"
                      style={{ color: game.color }}
                    >
                      {latestResult.triple_c ? `${latestResult.triple_c} ` : ""}
                      {formatZodiacSign(latestResult.zodiac_sign)}
                    </div>
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
        className="fluid-schedule-matrix grid flex-1 h-full w-full min-h-0 min-w-0 auto-rows-fr overflow-hidden"
        style={matrixGridStyle}
      >
        {scheduleTimes.map((timeSlot) => {
          const res = findTripleForTimeSlot(validResults, timeSlot);

          if (isHorizontalRowLayout) {
            return (
              <div
                key={timeSlot}
                className={`fluid-schedule-cell h-full w-full min-h-0 min-w-0 overflow-hidden transition !flex-row items-center justify-between !px-2.5 ${
                  res ? "border-slate-700/90 shadow-sm" : "border-slate-800/80 opacity-80"
                }`}
                style={{
                  backgroundColor: res
                    ? settings.result_row_color || "rgba(15, 23, 42, 0.9)"
                    : "rgba(2, 6, 23, 0.6)",
                }}
              >
                <div className="fluid-cell-time whitespace-nowrap font-bold text-slate-300 shrink-0">
                  {formatTime(timeSlot)}
                </div>
                <div className="font-mono tabular-nums flex items-center justify-end gap-1.5 sm:gap-2 min-w-0">
                  {res ? (
                    isSingleColumn ? (
                      <span
                        style={{ color: game.color }}
                        className="font-black text-[clamp(0.85rem,min(2vh,1.2vw),1.3rem)]"
                      >
                        {res.triple_a}
                      </span>
                    ) : (
                      <div className="flex items-center justify-end gap-1.5 sm:gap-2 flex-wrap">
                        <span
                          style={{ color: game.color }}
                          className="font-black text-[clamp(0.72rem,min(1.8vh,1.05vw),1.15rem)] whitespace-nowrap"
                        >
                          <span className="text-[0.8em] opacity-75 mr-0.5">A:</span>
                          {res.triple_a}
                        </span>
                        {res.triple_b && (
                          <span className="font-black text-white text-[clamp(0.72rem,min(1.8vh,1.05vw),1.15rem)] whitespace-nowrap">
                            <span className="text-[0.8em] text-slate-400 mr-0.5">B:</span>
                            {res.triple_b}
                          </span>
                        )}
                        {(res.triple_c || res.zodiac_sign) && (
                          <span className="font-extrabold text-amber-300 text-[clamp(0.68rem,min(1.7vh,0.98vw),1.05rem)] whitespace-nowrap bg-amber-500/10 border border-amber-500/30 rounded px-1.5 py-0.5 leading-none">
                            {res.triple_c ?? ""}
                            {res.zodiac_sign ? ` ${formatZodiacSign(res.zodiac_sign)}` : ""}
                          </span>
                        )}
                      </div>
                    )
                  ) : (
                    <span className="text-slate-600 font-normal text-sm">—</span>
                  )}
                </div>
              </div>
            );
          }

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
              <div className="fluid-cell-result w-full text-center font-mono tabular-nums">
                {res ? (
                  isSingleColumn ? (
                    <span style={{ color: game.color }} className="font-black">
                      {res.triple_a}
                    </span>
                  ) : (
                    <div className="flex flex-col items-center justify-center leading-none">
                      <span
                        style={{ color: game.color }}
                        className="font-black text-[0.76em] tracking-tighter whitespace-nowrap"
                      >
                        {res.triple_a}
                        {res.triple_b ? `-${res.triple_b}` : ""}
                      </span>
                      {(res.triple_c || res.zodiac_sign) && (
                        <span className="text-[0.65em] text-amber-300 font-bold leading-none mt-0.5 tracking-tighter whitespace-nowrap">
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
