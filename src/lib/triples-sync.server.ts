import {
  parseLoteriaDeHoyTriplesHtml,
  parseTuazarTriplesHtml,
  mergeTriplesResults,
} from "@/lib/triples-parser";
import { fetchArrejuntaoDirectTriples } from "@/lib/arrejuntao-provider.server";
import type { TripleResult } from "@/lib/triples";
import { isFutureLotteryDrawTime, lotteryDate } from "@/lib/lottery-date";

function filterStaleTripleResults(items: TripleResult[], drawDate: string): TripleResult[] {
  const todayVe = lotteryDate();
  if (drawDate !== todayVe || items.length === 0) return items;
  const now = new Date();
  const staleGames = new Set<string>();
  for (const item of items) {
    if (isFutureLotteryDrawTime(item.draw_date, item.draw_time, now, 15)) {
      staleGames.add((item.game_slug || item.game_id || "").toLowerCase());
    }
  }
  return items.filter((item) => {
    const key = (item.game_slug || item.game_id || "").toLowerCase();
    if (staleGames.has(key)) return false;
    return !isFutureLotteryDrawTime(item.draw_date, item.draw_time, now);
  });
}

export const LOTERIADEHOY_TRIPLES_URL = "https://loteriadehoy.com/loterias/resultados/";
export const TUAZAR_TRIPLES_PRIMARY_URL = "https://tuazar.com/loteria/resultados/";
export const TUAZAR_TRIPLES_FALLBACK_URL = "https://casino.tuazar.com/loteria/resultados";

// Fast bounded timeouts so a slow upstream site never blocks triples for 30-60s
const FETCH_TIMEOUT_MS = 5_500;
const FALLBACK_TIMEOUT_MS = 4_500;
const SNAPSHOT_TTL_MS = 20_000;

const BROWSER_HEADERS: Record<string, string> = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "es-VE,es;q=0.9,en;q=0.8",
  "Cache-Control": "no-cache",
};

interface CachedSourceResult {
  at: number;
  date: string;
  promise: Promise<TripleResult[]>;
}

let ldhTriplesCache: CachedSourceResult | null = null;
let tuazarTriplesCache: CachedSourceResult | null = null;

function isTransientFetchError(err: unknown): boolean {
  let current: unknown = err;
  for (let depth = 0; depth < 4 && current && typeof current === "object"; depth++) {
    const e = current as { name?: unknown; message?: unknown; code?: unknown; cause?: unknown };
    const name = typeof e.name === "string" ? e.name : "";
    const msg = typeof e.message === "string" ? e.message.toLowerCase() : "";
    const code = typeof e.code === "string" ? e.code.toUpperCase() : "";
    if (
      name === "AbortError" ||
      name === "ConnectTimeoutError" ||
      name === "HeadersTimeoutError" ||
      name === "BodyTimeoutError" ||
      name === "SocketError" ||
      code.startsWith("UND_ERR_") ||
      code === "ETIMEDOUT" ||
      code === "ECONNRESET" ||
      code === "ECONNREFUSED" ||
      code === "EAI_AGAIN" ||
      code === "ENETUNREACH" ||
      code === "EHOSTUNREACH" ||
      code === "EPIPE" ||
      msg.includes("operation was aborted") ||
      msg.includes("connect timeout") ||
      msg.includes("http 50") ||
      msg.includes("http 52") ||
      msg.includes("http 429") ||
      msg.includes("http 403") ||
      msg === "fetch failed"
    ) {
      return true;
    }
    current = e.cause;
  }
  return false;
}

async function fetchHtmlOnce(url: string, timeoutMs = FETCH_TIMEOUT_MS): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      headers: BROWSER_HEADERS,
      signal: controller.signal,
      redirect: "follow",
    });
    if (!response.ok) throw new Error(`HTTP ${response.status} from ${url}`);
    return await response.text();
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchLoteriaDeHoyTriples(
  drawDate: string,
  forceRefresh = false,
): Promise<TripleResult[]> {
  const now = Date.now();
  if (
    !forceRefresh &&
    ldhTriplesCache &&
    ldhTriplesCache.date === drawDate &&
    now - ldhTriplesCache.at < SNAPSHOT_TTL_MS
  ) {
    return ldhTriplesCache.promise;
  }

  const run = (async () => {
    try {
      const html = await fetchHtmlOnce(LOTERIADEHOY_TRIPLES_URL, FETCH_TIMEOUT_MS);
      const parsed = filterStaleTripleResults(
        parseLoteriaDeHoyTriplesHtml(html, drawDate),
        drawDate,
      );
      if (parsed.length === 0 && ldhTriplesCache?.promise === run) {
        ldhTriplesCache = null;
      }
      return parsed;
    } catch (err) {
      if (ldhTriplesCache?.promise === run) ldhTriplesCache = null;
      if (!isTransientFetchError(err)) {
        console.warn("[triples-sync] LoteriaDeHoy fetch failed:", err);
      }
      return [];
    }
  })();

  ldhTriplesCache = { at: now, date: drawDate, promise: run };
  return run;
}

export async function fetchTuAzarTriples(
  drawDate: string,
  forceRefresh = false,
): Promise<TripleResult[]> {
  const now = Date.now();
  if (
    !forceRefresh &&
    tuazarTriplesCache &&
    tuazarTriplesCache.date === drawDate &&
    now - tuazarTriplesCache.at < SNAPSHOT_TTL_MS
  ) {
    return tuazarTriplesCache.promise;
  }

  const run = (async () => {
    try {
      const html = await fetchHtmlOnce(TUAZAR_TRIPLES_PRIMARY_URL, FETCH_TIMEOUT_MS);
      const parsed = filterStaleTripleResults(parseTuazarTriplesHtml(html, drawDate), drawDate);
      if (parsed.length > 0) return parsed;
    } catch (primaryErr) {
      try {
        const fallbackHtml = await fetchHtmlOnce(TUAZAR_TRIPLES_FALLBACK_URL, FALLBACK_TIMEOUT_MS);
        const parsed = filterStaleTripleResults(
          parseTuazarTriplesHtml(fallbackHtml, drawDate),
          drawDate,
        );
        if (parsed.length > 0) return parsed;
      } catch (fallbackErr) {
        if (!isTransientFetchError(primaryErr) && !isTransientFetchError(fallbackErr)) {
          // Both primary and fallback failed with non-transient errors; silently fall back to LoteriaDeHoy & Multiloterias
        }
      }
    }
    if (tuazarTriplesCache?.promise === run) tuazarTriplesCache = null;
    return [];
  })();

  tuazarTriplesCache = { at: now, date: drawDate, promise: run };
  return run;
}

export async function synchronizeAutomaticTriplesResults(
  existingResults: TripleResult[],
  options?: {
    forceRefresh?: boolean;
    onPartialResults?: (partial: TripleResult[]) => void;
  },
): Promise<{ merged: TripleResult[]; newlyAdded: TripleResult[] }> {
  const today = lotteryDate();
  const todaysExisting = existingResults.filter((r) => r.draw_date === today);
  const forceRefresh = Boolean(options?.forceRefresh);

  // El Arrejuntao (arrejuntao) uses exclusively its official direct JSON API endpoint (never HTML scraping)
  const arrejuntaoPromise = fetchArrejuntaoDirectTriples(today, forceRefresh).then((res) => {
    if (res.length > 0 && options?.onPartialResults) {
      options.onPartialResults(res);
    }
    return res;
  });

  const ldhPromise = fetchLoteriaDeHoyTriples(today, forceRefresh).then((res) => {
    const withoutArrejuntao = res.filter(
      (r) => r.game_id !== "arrejuntao" && r.game_slug !== "arrejuntao",
    );
    if (withoutArrejuntao.length > 0 && options?.onPartialResults) {
      options.onPartialResults(withoutArrejuntao);
    }
    return withoutArrejuntao;
  });

  const tuazarPromise = fetchTuAzarTriples(today, forceRefresh).then((res) => {
    const withoutArrejuntao = res.filter(
      (r) => r.game_id !== "arrejuntao" && r.game_slug !== "arrejuntao",
    );
    if (withoutArrejuntao.length > 0 && options?.onPartialResults) {
      options.onPartialResults(withoutArrejuntao);
    }
    return withoutArrejuntao;
  });

  const [ldhSettled, tuazarSettled, arrejuntaoSettled] = await Promise.allSettled([
    ldhPromise,
    tuazarPromise,
    arrejuntaoPromise,
  ]);

  const fromLdh = ldhSettled.status === "fulfilled" ? ldhSettled.value : [];
  const fromTuAzar = tuazarSettled.status === "fulfilled" ? tuazarSettled.value : [];
  const fromArrejuntao = arrejuntaoSettled.status === "fulfilled" ? arrejuntaoSettled.value : [];

  return mergeTriplesResults(todaysExisting, [...fromLdh, ...fromArrejuntao], fromTuAzar);
}
