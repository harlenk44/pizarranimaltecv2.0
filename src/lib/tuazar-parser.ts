// Pure HTML parser for the tuazar.com animalitos results page. No network, no server-only imports.
//
// Expected source structure, for each result and in this order:
//   - a text node with the hour           "10:00 AM"
//   - a text node with number + animal    "38BÚFALO" (or "38 Búfalo")
//   - an image whose alt is               "El Arrejuntao — 38 Búfalo"
// The game name comes from the image alt; without it, from the last h2-h4 heading seen.

export interface TuazarResult {
  game: string; // upper case, e.g. "LOTTO ACTIVO"
  hour: string; // "09:00 AM"
  number: string; // as printed by the source, e.g. "0" or "00"
  animal: string; // upper case, e.g. "BÚFALO"
  imageUrl?: string;
  gameLogoUrl?: string;
}

export interface TuazarPage {
  date: string | null; // YYYY-MM-DD when the page states it
  results: TuazarResult[];
}

export class TuazarParseError extends Error {}

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  aacute: "á",
  eacute: "é",
  iacute: "í",
  oacute: "ó",
  uacute: "ú",
  Aacute: "Á",
  Eacute: "É",
  Iacute: "Í",
  Oacute: "Ó",
  Uacute: "Ú",
  ntilde: "ñ",
  Ntilde: "Ñ",
  uuml: "ü",
  Uuml: "Ü",
  mdash: "—",
  ndash: "–",
};

function decodeEntities(input: string): string {
  return input.replace(/&(#x[0-9a-fA-F]+|#\d+|[a-zA-Z]+);/g, (whole, body: string) => {
    if (body.startsWith("#")) {
      const code =
        body[1] === "x" || body[1] === "X"
          ? parseInt(body.slice(2), 16)
          : parseInt(body.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff
        ? String.fromCodePoint(code)
        : whole;
    }
    return NAMED_ENTITIES[body] ?? whole;
  });
}

/** Accent-free, upper-case, single-spaced key for comparing names with common lottery phonetic variants. */
export function normalizeName(input: string): string {
  const norm = input.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/\s+/g, " ").trim();
  if (norm === "CHUGUIRE") return "CHIGUIRE";
  if (norm === "CIENPIES") return "CIEMPIES";
  if (norm === "EL PATRONUS") return "PATRONUS";
  if (norm === "EL GUACHARO") return "GUACHARO";
  if (norm === "EL GUACHARITO") return "GUACHARITO";
  if (norm === "HORMIGUERO") return "OSO HORMIGUERO";
  if (norm === "PAVOREAL") return "PAVO REAL";
  if (norm === "PUERCO ESPIN") return "PUERCOESPIN";
  return norm;
}

/** "9:00 am" or "9:00 a.m." -> "09:00 AM"; null when it is not a valid hour. */
export function normalizeHour(raw: string): string | null {
  const m = /^(\d{1,2}):(\d{2})\s*([AaPp])\.?\s?[Mm]\.?$/.exec(raw.trim());
  if (!m) return null;
  const hour = Number(m[1]);
  const minute = Number(m[2]);
  if (hour < 1 || hour > 12 || minute > 59) return null;
  return `${String(hour).padStart(2, "0")}:${m[2]} ${(m[3] ?? "A").toUpperCase()}M`;
}

/** "09:00 AM" -> "09:00:00", "12:30 PM" -> "12:30:00", "12:05 AM" -> "00:05:00". */
export function hourTo24h(hour: string): string | null {
  const m = /^(\d{2}):(\d{2}) (AM|PM)$/.exec(hour);
  if (!m) return null;
  let h = Number(m[1]) % 12;
  if (m[3] === "PM") h += 12;
  return `${String(h).padStart(2, "0")}:${m[2]}:00`;
}

function readAttribute(tag: string, name: string): string | null {
  const m = new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, "i").exec(tag);
  return m ? decodeEntities(m[1] ?? m[2] ?? "") : null;
}

/** Turns the first "26/10/2026" in the text into "2026-10-26" (null if absent or impossible). */
function extractDate(text: string): string | null {
  const m = /\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/.exec(text);
  if (!m) return null;
  const day = Number(m[1]);
  const month = Number(m[2]);
  const year = Number(m[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  const valid =
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
  return valid ? `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}` : null;
}

const TOKEN_RE = /<!--[\s\S]*?-->|<[^>]+>|[^<]+/g;
const HEADING_TAGS = new Set(["h1", "h2", "h3", "h4"]);
const ANIMAL = "[A-Za-zÁÉÍÓÚÜÑáéíóúüñ][A-Za-zÁÉÍÓÚÜÑáéíóúüñ .'-]{1,40}?";
const NUMBER_ANIMAL_RE = new RegExp(`^(\\d{1,3})\\s*(${ANIMAL})$`);
const TIME_NUMBER_ANIMAL_RE = new RegExp(
  `^(\\d{1,2}:\\d{2}\\s*[AaPp]\\.?\\s?[Mm]\\.?)\\s*[-–:|]?\\s*(\\d{1,3})\\s*(${ANIMAL})$`,
);
// The game name may itself contain a hyphen ("Granja Millonaria - Granjazo — 38 Búfalo").
const ALT_RE = new RegExp(`^(.+?)\\s+[—–-]\\s+(\\d{1,3}|00)\\s+(${ANIMAL})$`);

function parseTuazarTiles(html: string): TuazarResult[] {
  const results: TuazarResult[] = [];
  const found = new Set<string>();

  const cardChunks = html.split(/<div[^>]*class=["'][^"']*lc-card[^"']*["']/i);
  for (let i = 1; i < cardChunks.length; i++) {
    const card = cardChunks[i]!;
    const cardTitleMatch =
      /<(?:h\d|div)[^>]*class=["'][^"']*lc-title[^"']*["'][^>]*>([^<]+)<\//i.exec(card);
    const cardGame = cardTitleMatch ? cardTitleMatch[1]!.replace(/\s+/g, " ").trim() : "";

    const cardLogoMatch =
      /<img[^>]*class=["'][^"']*lc-logo[^"']*["'][^>]*src=["']([^"']+)["']/i.exec(card);
    let gameLogoUrl: string | undefined;
    if (cardLogoMatch) {
      const rawLogo = cardLogoMatch[1]!.trim();
      gameLogoUrl = rawLogo.startsWith("http") ? rawLogo : `https://tuazar.com${rawLogo}`;
    }

    const tileChunks = card.split(/<div[^>]*class=["'][^"']*lc-tile(?:\s|["'])/i);
    for (let j = 1; j < tileChunks.length; j++) {
      const tile = tileChunks[j]!;

      // Extract time strictly from this tile
      const timeMatch = /class=["'][^"']*lc-tile-time[^"']*["'][^>]*>([^<]+)<\//i.exec(tile);
      const rawHour = timeMatch ? timeMatch[1]!.trim() : null;
      const hour = rawHour ? normalizeHour(rawHour) : null;
      if (!hour) continue;

      // Extract number & animal from tile labels or image alt
      const numMatch = /class=["'][^"']*lc-tile-num[^"']*["'][^>]*>([^<]+)<\//i.exec(tile);
      const animalMatch = /class=["'][^"']*lc-tile-animal[^"']*["'][^>]*>([^<]+)<\//i.exec(tile);

      const altMatch = /alt=["']([^"']+)["']/i.exec(tile);
      const altParsed = altMatch
        ? ALT_RE.exec(decodeEntities(altMatch[1]!).replace(/\s+/g, " ").trim())
        : null;

      const gameRaw = altParsed ? altParsed[1] : cardGame;
      const numberRaw = numMatch ? numMatch[1]!.trim() : altParsed ? altParsed[2] : null;
      const animalRaw = animalMatch ? animalMatch[1]!.trim() : altParsed ? altParsed[3] : null;

      if (!gameRaw || !numberRaw || !animalRaw) continue;
      if (!/^\d{1,3}$/.test(numberRaw)) continue;
      if (/pendiente/i.test(animalRaw)) continue;

      // Extract tile image if present
      const tileImgMatch =
        /<img[^>]*class=["'][^"']*lc-tile-img[^"']*["'][^>]*src=["']([^"']+)["']/i.exec(tile);
      let imageUrl: string | undefined;
      if (tileImgMatch) {
        const rawSrc = tileImgMatch[1]!.trim();
        if (rawSrc && !rawSrc.includes("espera") && !rawSrc.includes("logo_")) {
          imageUrl = rawSrc.startsWith("http") ? rawSrc : `https://tuazar.com${rawSrc}`;
        }
      }

      const game = gameRaw.replace(/\s+/g, " ").trim().toUpperCase();
      const animal = decodeEntities(animalRaw).replace(/\s+/g, " ").trim().toUpperCase();
      const number = numberRaw.replace(/\s+/g, " ").trim();

      if (animal.length < 2) continue;

      const key = `${normalizeName(game)}|${hour}|${Number(number)}`;
      if (!found.has(key)) {
        found.add(key);
        results.push({ game, hour, number, animal, imageUrl, gameLogoUrl });
      }
    }
  }
  return results;
}

export function parseTuazarResults(html: string): TuazarPage {
  const cleaned = html.replace(/<(script|style|noscript)\b[\s\S]*?<\/\1>/gi, " ");
  const pageDate = extractDate(cleaned);

  // Modern structured TuAzar layout with lc-card and lc-tile containers
  if (cleaned.includes("lc-tile") || cleaned.includes("lc-card")) {
    const tileResults = parseTuazarTiles(cleaned);
    if (tileResults.length > 0) {
      return { date: pageDate, results: tileResults };
    }
  }

  // Fallback sequential token parser for legacy/custom HTML structures
  const found = new Map<string, TuazarResult>();
  let date: string | null = null;
  let currentGame: string | null = null;
  let lastHour: string | null = null;
  let inHeading = false;
  let headingText = "";

  const push = (
    gameRaw: string | null,
    hour: string | null,
    number: string,
    animalRaw: string,
  ): void => {
    if (!gameRaw || !hour) return;
    const game = gameRaw.replace(/\s+/g, " ").trim().toUpperCase();
    const animal = animalRaw.replace(/\s+/g, " ").trim().toUpperCase();
    if (!game || animal.length < 2) return;
    const key = `${normalizeName(game)}|${hour}|${Number(number)}`;
    // The text node and the image describe the same draw: keep the first one seen.
    if (!found.has(key)) found.set(key, { game, hour, number, animal });
  };

  for (const token of cleaned.match(TOKEN_RE) ?? []) {
    if (token.startsWith("<!--")) continue;

    if (token.startsWith("<")) {
      const tagMatch = /^<\s*(\/?)\s*([a-zA-Z][a-zA-Z0-9]*)/.exec(token);
      if (!tagMatch) continue;
      const closing = tagMatch[1] === "/";
      const name = (tagMatch[2] ?? "").toLowerCase();

      if (HEADING_TAGS.has(name)) {
        if (!closing) {
          inHeading = true;
          headingText = "";
        } else {
          inHeading = false;
          const heading = headingText.replace(/\s+/g, " ").trim();
          const headingDate = extractDate(heading);
          if (headingDate && /sorteos/i.test(heading)) {
            date ??= headingDate;
          } else if (heading && !/^(?:tuazar|resultados de animalitos)/i.test(heading)) {
            currentGame = heading;
            lastHour = null; // Reset hour when switching games
          }
        }
      } else if (name === "img" && !closing) {
        const alt = readAttribute(token, "alt");
        const m = alt ? ALT_RE.exec(alt.replace(/\s+/g, " ").trim()) : null;
        if (m && lastHour) push(m[1] ?? null, lastHour, m[2] ?? "", m[3] ?? "");
      }
      continue;
    }

    const text = decodeEntities(token).replace(/\s+/g, " ").trim();
    if (!text) continue;

    if (inHeading) {
      headingText += ` ${text}`;
      continue;
    }

    if (/sorteos/i.test(text)) {
      const textDate = extractDate(text);
      if (textDate) date ??= textDate;
    }

    const combined = TIME_NUMBER_ANIMAL_RE.exec(text);
    if (combined) {
      lastHour = normalizeHour(combined[1] ?? "") ?? lastHour;
      push(currentGame, lastHour, combined[2] ?? "", combined[3] ?? "");
      continue;
    }

    const hour = normalizeHour(text);
    if (hour) {
      lastHour = hour;
      continue;
    }

    const row = NUMBER_ANIMAL_RE.exec(text);
    if (row && lastHour) push(currentGame, lastHour, row[1] ?? "", row[2] ?? "");
  }

  const results = [...found.values()];
  if (results.length === 0) {
    throw new TuazarParseError(
      "No se encontraron resultados; la estructura de la página pudo haber cambiado.",
    );
  }
  return { date: date ?? pageDate, results };
}
