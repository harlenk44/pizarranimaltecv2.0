import {
  parseLoteriaDeHoyTriplesHtml,
  parseTuazarTriplesHtml,
  mergeTriplesResults,
} from "@/lib/triples-parser";
import type { TripleResult } from "@/lib/triples";
import { lotteryDate } from "@/lib/lottery-date";

export const LOTERIADEHOY_TRIPLES_URL = "https://loteriadehoy.com/loterias/resultados/";
export const TUAZAR_TRIPLES_PRIMARY_URL = "https://tuazar.com/loteria/resultados/";
export const TUAZAR_TRIPLES_FALLBACK_URL = "https://www.tuazar.com/loteria/resultados/";

const FETCH_TIMEOUT_MS = 10_000;

const BROWSER_HEADERS: Record<string, string> = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "es-VE,es;q=0.9,en;q=0.8",
  "Cache-Control": "no-cache",
};

async function fetchHtmlWithTimeout(url: string): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
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

export async function fetchLoteriaDeHoyTriples(drawDate: string): Promise<TripleResult[]> {
  try {
    const html = await fetchHtmlWithTimeout(LOTERIADEHOY_TRIPLES_URL);
    return parseLoteriaDeHoyTriplesHtml(html, drawDate);
  } catch (err) {
    console.warn("[triples-sync] LoteriaDeHoy fetch failed:", err);
    return [];
  }
}

export async function fetchTuAzarTriples(drawDate: string): Promise<TripleResult[]> {
  try {
    const html = await fetchHtmlWithTimeout(TUAZAR_TRIPLES_PRIMARY_URL);
    return parseTuazarTriplesHtml(html, drawDate);
  } catch (primaryErr) {
    try {
      const fallbackHtml = await fetchHtmlWithTimeout(TUAZAR_TRIPLES_FALLBACK_URL);
      return parseTuazarTriplesHtml(fallbackHtml, drawDate);
    } catch (fallbackErr) {
      console.warn("[triples-sync] TuAzar fetch failed:", primaryErr, fallbackErr);
      return [];
    }
  }
}

export async function synchronizeAutomaticTriplesResults(
  existingResults: TripleResult[],
): Promise<{ merged: TripleResult[]; newlyAdded: TripleResult[] }> {
  const today = lotteryDate();
  const todaysExisting = existingResults.filter((r) => r.draw_date === today);

  const [fromLdh, fromTuAzar] = await Promise.all([
    fetchLoteriaDeHoyTriples(today),
    fetchTuAzarTriples(today),
  ]);

  return mergeTriplesResults(todaysExisting, fromLdh, fromTuAzar);
}
