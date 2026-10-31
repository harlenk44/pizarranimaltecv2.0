// Pure HTML parser for loteriadehoy.com/animalitos/resultados/. No network, no server-only imports.
import { normalizeName, normalizeHour, hourTo24h } from "@/lib/tuazar-parser";

export interface LoteriaDeHoyResult {
  game: string; // e.g. "LOTTO ACTIVO", "LA GRANJITA"
  gameClass: string; // e.g. "lottoactivo", "lagranjita"
  hour: string; // "08:00 AM"
  drawTime: string; // "08:00:00"
  number: string; // "25", "00", "0"
  animal: string; // "GALLINA"
  imageUrl?: string;
}

export interface LoteriaDeHoyPage {
  date: string | null; // YYYY-MM-DD
  results: LoteriaDeHoyResult[];
}

export class LoteriaDeHoyParseError extends Error {}

export const LOTERIADEHOY_GAME_MAPPINGS: Readonly<
  Record<string, { className: string; title: string }>
> = {
  "lotto-activo": { className: "lottoactivo", title: "LOTTO ACTIVO" },
  guacharo: { className: "guacharoactivo", title: "GUACHARO ACTIVO" },
  guacharito: { className: "elguacharitomillonario", title: "EL GUACHARITO MILLONARIO" },
  "selva-plus": { className: "selvaplus", title: "SELVA PLUS" },
  "loto-chaim-a": { className: "lotochaima", title: "LOTO CHAIMA" },
  granjita: { className: "lagranjita", title: "LA GRANJITA" },
  "monje-millonario": { className: "lottoactivo2(monjemillonario)", title: "MONJE MILLONARIO" },
  "lotto-activo-internacional": {
    className: "lottoactivordint",
    title: "LOTTO ACTIVO RD INTERNACIONAL",
  },
};

export function matchGameClass(rawClass: string, targetClass: string): boolean {
  if (!rawClass || !targetClass) return false;
  const cleanRaw = rawClass.toLowerCase().replace(/[^a-z0-9]/g, "");
  const cleanTarget = targetClass.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (cleanRaw === cleanTarget) return true;
  if (cleanRaw.includes(cleanTarget) || cleanTarget.includes(cleanRaw)) return true;

  if (
    cleanTarget.includes("monje") &&
    (cleanRaw.includes("monje") || cleanRaw.includes("lottoactivo2"))
  )
    return true;
  if (cleanTarget.includes("guacharo") && cleanRaw.includes("guacharo")) return true;
  if (cleanTarget.includes("granjita") && cleanRaw.includes("granjita")) return true;
  if (cleanTarget.includes("chaima") && cleanRaw.includes("chaima")) return true;
  if (cleanTarget.includes("selva") && cleanRaw.includes("selva")) return true;
  if (cleanTarget === "lottoactivo" && (cleanRaw === "lottoactivo" || cleanRaw === "lottoactivo1"))
    return true;
  if (
    cleanTarget.includes("lottoactivord") &&
    (cleanRaw.includes("rd") || cleanRaw.includes("internacional"))
  )
    return true;

  return false;
}

function extractDate(html: string): string | null {
  // 1. From input: <input type="text" name="fecha" id="datepicker" value="2026-10-30" ...>
  const inputMatch =
    /(?:name=["']fecha["']|id=["']datepicker["'])[^>]*value=["'](\d{4}-\d{2}-\d{2})["']/i.exec(
      html,
    ) || /value=["'](\d{4}-\d{2}-\d{2})["']/i.exec(html);
  if (inputMatch) return inputMatch[1];

  // 2. From text: 30 de octubre de 2026
  const monthMap: Record<string, string> = {
    enero: "01",
    febrero: "02",
    marzo: "03",
    abril: "04",
    mayo: "05",
    junio: "06",
    julio: "07",
    agosto: "08",
    septiembre: "09",
    setiembre: "09",
    octubre: "10",
    noviembre: "11",
    diciembre: "12",
  };
  const textMatch = /(\d{1,2})\s+de\s+([a-zA-Záéíóúñ]+)\s+de\s+(\d{4})/i.exec(html);
  if (textMatch) {
    const day = textMatch[1].padStart(2, "0");
    const monthKey = textMatch[2].toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
    const month = monthMap[monthKey];
    const year = textMatch[3];
    if (month) return `${year}-${month}-${day}`;
  }

  return null;
}

export function parseLoteriaDeHoyResults(html: string): LoteriaDeHoyPage {
  if (!html || typeof html !== "string" || !html.trim()) {
    throw new LoteriaDeHoyParseError("Contenido HTML vacío o inválido");
  }

  const date = extractDate(html);

  const gameSections: Array<{ start: number; className: string; title: string }> = [];

  const headerRegexes = [
    /<div[^>]*class=["'][^"']*title-center[^"']*["'][^>]*>[\s\S]*?<h[1-4][^>]*class=["']([^"']*)["'][^>]*>\s*([\s\S]*?)\s*<\/h[1-4]>/gi,
    /<h[1-4][^>]*class=["']([^"']+)["'][^>]*>\s*([\s\S]*?)\s*<\/h[1-4]>/gi,
  ];

  for (const regex of headerRegexes) {
    let match: RegExpExecArray | null;
    regex.lastIndex = 0;
    while ((match = regex.exec(html)) !== null) {
      const rawClass = match[1].trim();
      const rawTitle = match[2].replace(/<[^>]+>/g, "").trim();
      if (!rawClass) continue;

      const pos = match.index;
      if (!gameSections.some((s) => Math.abs(s.start - pos) < 50)) {
        gameSections.push({
          start: pos,
          className: rawClass,
          title: rawTitle,
        });
      }
    }
    if (gameSections.length > 0) break;
  }

  const results: LoteriaDeHoyResult[] = [];
  const processedKeys = new Set<string>();

  const cardRegex =
    /<div[^>]*class=["'][^"']*circle(?:\s+([^"']*))?["'][^>]*>[\s\S]*?<img\s+[^>]*src=["']([^"']+)["'][\s\S]*?<div[^>]*class=["'][^"']*circle-legend[^"']*["'][^>]*>[\s\S]*?<h4[^>]*>([\s\S]*?)<\/h4>\s*<h5[^>]*>([\s\S]*?)<\/h5>/gi;

  function parseCardMatch(cardMatch: RegExpExecArray, defaultClass: string, defaultTitle: string) {
    const rawCircleClasses = (cardMatch[1] || "").trim();
    const rawSrc = cardMatch[2].trim();
    const imageUrl = rawSrc.startsWith("http")
      ? rawSrc
      : `https://loteriadehoy.com${rawSrc.startsWith("/") ? "" : "/"}${rawSrc}`;

    const rawLegend = cardMatch[3]
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    const rawHour = cardMatch[4]
      .replace(/<[^>]+>/g, "")
      .replace(/\s+/g, " ")
      .trim();

    const normHour = normalizeHour(rawHour);
    if (!normHour) return;

    const drawTime = hourTo24h(normHour);
    if (!drawTime) return;

    let effectiveClass = defaultClass;
    if (rawCircleClasses) {
      const classTokens = rawCircleClasses.split(/\s+/);
      for (const token of classTokens) {
        if (token === "circle") continue;
        for (const meta of Object.values(LOTERIADEHOY_GAME_MAPPINGS)) {
          if (matchGameClass(token, meta.className)) {
            effectiveClass = token;
            break;
          }
        }
      }
      if (!effectiveClass && classTokens.length > 0) {
        const token = classTokens.find((t) => t !== "circle");
        if (token) effectiveClass = token;
      }
    }

    let effectiveTitle = defaultTitle;
    for (const meta of Object.values(LOTERIADEHOY_GAME_MAPPINGS)) {
      if (matchGameClass(effectiveClass, meta.className)) {
        effectiveTitle = meta.title;
        break;
      }
    }

    const numMatch = /^(\d{1,2}|00)\s+(.+)$/.exec(rawLegend);
    let numberStr: string;
    let animalName: string;

    if (numMatch) {
      numberStr = numMatch[1];
      animalName = normalizeName(numMatch[2]);
    } else {
      numberStr = rawLegend.replace(/[^\d]/g, "");
      animalName = normalizeName(rawLegend.replace(/^[\d\s]+/, ""));
    }

    if (!animalName) return;

    const key = `${effectiveClass.toLowerCase()}-${drawTime}-${numberStr}-${animalName}`;
    if (processedKeys.has(key)) return;
    processedKeys.add(key);

    results.push({
      game: normalizeName(effectiveTitle || defaultTitle || effectiveClass),
      gameClass: effectiveClass.toLowerCase(),
      hour: normHour,
      drawTime,
      number: numberStr,
      animal: animalName,
      imageUrl,
    });
  }

  if (gameSections.length > 0) {
    for (let i = 0; i < gameSections.length; i++) {
      const cur = gameSections[i];
      const next = gameSections[i + 1];
      const sectionHtml = html.slice(cur.start, next ? next.start : undefined);

      cardRegex.lastIndex = 0;
      let cardMatch: RegExpExecArray | null;
      while ((cardMatch = cardRegex.exec(sectionHtml)) !== null) {
        parseCardMatch(cardMatch, cur.className, cur.title);
      }
    }
  }

  cardRegex.lastIndex = 0;
  let globalCardMatch: RegExpExecArray | null;
  while ((globalCardMatch = cardRegex.exec(html)) !== null) {
    parseCardMatch(globalCardMatch, "", "");
  }

  if (gameSections.length === 0 && results.length === 0) {
    throw new LoteriaDeHoyParseError(
      "No se encontraron secciones de juegos en el HTML de loteriadehoy.com",
    );
  }

  return {
    date,
    results,
  };
}
