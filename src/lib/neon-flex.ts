// Configuración y generador del efecto Tubo LED Neon Flex y Estilo Clásico Sólido para tarjetas de loterías

export type BoardCardVisualStyle = "neon" | "solid";

export interface ColorPaletteOption {
  label: string;
  value: string;
  name: string;
  hex: string;
}

/**
 * 🎨 Paleta de Colores Normales / Clásicos
 */
export const CLASSIC_COLOR_PALETTE: readonly ColorPaletteOption[] = [
  { label: "Verde Esmeralda", value: "#16a34a", name: "Verde Esmeralda", hex: "#16a34a" },
  { label: "Rojo Clásico", value: "#dc2626", name: "Rojo Clásico", hex: "#dc2626" },
  { label: "Azul Rey", value: "#2563eb", name: "Azul Rey", hex: "#2563eb" },
  { label: "Amarillo Oro", value: "#ca8a04", name: "Amarillo Oro", hex: "#ca8a04" },
  { label: "Morado Real", value: "#7c3aed", name: "Morado Real", hex: "#7c3aed" },
  { label: "Naranja Estándar", value: "#ea580c", name: "Naranja Estándar", hex: "#ea580c" },
  { label: "Turquesa Clásico", value: "#0891b2", name: "Turquesa Clásico", hex: "#0891b2" },
  { label: "Rosa / Magenta", value: "#db2777", name: "Rosa / Magenta", hex: "#db2777" },
  { label: "Gris Pizarra", value: "#475569", name: "Gris Pizarra", hex: "#475569" },
  { label: "Blanco / Plata", value: "#e2e8f0", name: "Blanco / Plata", hex: "#e2e8f0" },
];

/**
 * ⚡ Paleta de Colores Fosforescentes / Neón
 */
export const NEON_COLOR_PALETTE: readonly ColorPaletteOption[] = [
  { label: "Verde Láser", value: "#00FF66", name: "Verde Láser", hex: "#00FF66" },
  { label: "Verde Eléctrico", value: "#39FF14", name: "Verde Eléctrico", hex: "#39FF14" },
  { label: "Amarillo Láser", value: "#FFEE00", name: "Amarillo Láser", hex: "#FFEE00" },
  { label: "Ámbar Fluorescente", value: "#FFB300", name: "Ámbar Fluorescente", hex: "#FFB300" },
  { label: "Fucsia Neón", value: "#FF00AA", name: "Fucsia Neón", hex: "#FF00AA" },
  { label: "Rosa Fluorescente", value: "#FF007F", name: "Rosa Fluorescente", hex: "#FF007F" },
  { label: "Violeta Eléctrico", value: "#BF00FF", name: "Violeta Eléctrico", hex: "#BF00FF" },
  { label: "Cian Eléctrico", value: "#00F0FF", name: "Cian Eléctrico", hex: "#00F0FF" },
  { label: "Azul Láser", value: "#00A6FF", name: "Azul Láser", hex: "#00A6FF" },
  { label: "Rojo Neón", value: "#FF1744", name: "Rojo Neón", hex: "#FF1744" },
  { label: "Carmesí Eléctrico", value: "#FF2A55", name: "Carmesí Eléctrico", hex: "#FF2A55" },
  { label: "Naranja Fluorescente", value: "#FF6600", name: "Naranja Fluorescente", hex: "#FF6600" },
];

// Colores semilla iniciales en mock-db para distinguir cuándo un admin cambió manualmente game.color
const INITIAL_SEED_GAME_COLORS: Readonly<Record<string, string>> = {
  "lotto-activo": "#16a34a",
  "7d21a00b-0dfa-4bdc-9edf-8115802df1d6": "#16a34a",
  guacharo: "#dc2626",
  "01da9c54-392a-45e3-ab66-9a08befe7694": "#dc2626",
  guacharito: "#eab308",
  "0519825d-e7ea-4e59-bf7d-cef2c832edd3": "#eab308",
  "selva-plus": "#22c55e",
  "8f3aa087-6a0c-41a1-9ed3-5f6d5ed6918e": "#22c55e",
  "loto-chaim-a": "#7c3aed",
  "1efc5373-a547-4f7f-9955-845b5ede5ce2": "#7c3aed",
  granjita: "#ca8a04",
  "ca8a0400-0000-4000-8000-000000000006": "#ca8a04",
  "monje-millonario": "#0f766e",
  "0f766e00-0000-4000-8000-000000000007": "#0f766e",
  "lotto-activo-internacional": "#1e40af",
  "1e40af00-0000-4000-8000-000000000008": "#1e40af",
  lotoanimalito: "#2563eb",
  "d953f80c-4335-4bc9-9f78-9b56193286fe": "#2563eb",
  lottopantera: "#ea580c",
  "61580ccf-5a2d-4d10-877e-4883515135e4": "#ea580c",
  "la-ricachona": "#eab308",
  "3b92f700-0000-4000-8000-000000000011": "#eab308",
};

export const NEON_PRODUCT_COLORS: Readonly<Record<string, string>> = {
  // Verde Neón Eléctrico (#00FF66 / #39FF14): Lotto Activo, Selva Plus, Guácharo Activo y Triple Zulia
  "lotto-activo": "#00FF66",
  "lotto activo": "#00FF66",
  "7d21a00b-0dfa-4bdc-9edf-8115802df1d6": "#00FF66",
  "selva-plus": "#00FF66",
  "selva plus": "#00FF66",
  "8f3aa087-6a0c-41a1-9ed3-5f6d5ed6918e": "#00FF66",
  guacharo: "#39FF14",
  "guacharo activo": "#39FF14",
  "guacharo-activo": "#39FF14",
  "guácharo activo": "#39FF14",
  "01da9c54-392a-45e3-ab66-9a08befe7694": "#39FF14",
  "triple-zulia": "#00FF66",
  "triple zulia": "#00FF66",
  zulia: "#00FF66",

  // Amarillo / Ámbar Láser (#FFEE00 / #FFB300 / #FFD600): La Granjita, Lotto Rey, El Ruco, Lotería del Táchira y Chance
  granjita: "#FFEE00",
  "la-granjita": "#FFEE00",
  "la granjita": "#FFEE00",
  "ca8a0400-0000-4000-8000-000000000006": "#FFEE00",
  "triple-chance": "#FFD600",
  "triple chance": "#FFD600",
  chance: "#FFD600",
  "monje-millonario": "#FFB300",
  "0f766e00-0000-4000-8000-000000000007": "#FFB300",
  "triple-tachira": "#FFB300",
  "triple tachira": "#FFB300",
  "loteria del tachira": "#FFB300",
  "lotería del táchira": "#FFB300",
  tachira: "#FFB300",
  "lotto-rey": "#FFEE00",
  "lotto rey": "#FFEE00",
  "el-ruco": "#FFB300",
  "el ruco": "#FFB300",
  ruco: "#FFB300",

  // Rojo / Carmesí Neón (#FF1744 / #FF2A55 / #FF1E38): Loto Chaima, Cazaloton y Triple Caracas
  "loto-chaima": "#FF1744",
  "loto-chaim-a": "#FF1744",
  "loto chaima": "#FF1744",
  "1efc5373-a547-4f7f-9955-845b5ede5ce2": "#FF1744",
  "triple-caracas": "#FF1744",
  "triple caracas": "#FF1744",
  caracas: "#FF1744",
  cazaloton: "#FF2A55",
  "caza loton": "#FF2A55",

  // Fucsia / Magenta Neón (#FF00AA / #BF00FF / #FF007F): Granja Millonaria, La Ricachona y Triple Zamorano
  "la-ricachona": "#FF00AA",
  "la ricachona": "#FF00AA",
  ricachona: "#FF00AA",
  "3b92f700-0000-4000-8000-000000000011": "#FF00AA",
  "triple-ricachona": "#FF00AA",
  "triple-zamorano": "#BF00FF",
  "triple zamorano": "#BF00FF",
  zamorano: "#BF00FF",
  "granja-millonaria": "#FF00AA",
  "granja millonaria": "#FF00AA",

  // Cian / Azul Eléctrico (#00F0FF / #00A6FF / #00FFFF): Lotto Activo Internacional, Jungla Millonaria, Triple León y Triple Caliente
  "lotto-activo-internacional": "#00F0FF",
  "lotto activo internacional": "#00F0FF",
  "lotto internacional": "#00F0FF",
  "1e40af00-0000-4000-8000-000000000008": "#00F0FF",
  lotoanimalito: "#00F0FF",
  "loto animalito": "#00F0FF",
  "d953f80c-4335-4bc9-9f78-9b56193286fe": "#00F0FF",
  "triple-caliente": "#00F0FF",
  "triple caliente": "#00F0FF",
  "triple-leon": "#00FFFF",
  "triple leon": "#00FFFF",
  leon: "#00FFFF",
  "triple-facil": "#00A6FF",
  "trio-activo": "#00F0FF",
  "jungla-millonaria": "#00F0FF",
  "jungla millonaria": "#00F0FF",

  // Naranja Fluorescente (#FF6600 / #FF9100 / #FF7700): Cóndor Gana, Guacharito Millonario y Triple Centena
  guacharito: "#FF6600",
  "guacharito millonario": "#FF6600",
  "0519825d-e7ea-4e59-bf7d-cef2c832edd3": "#FF6600",
  lottopantera: "#FF7700",
  "lotto pantera": "#FF7700",
  "61580ccf-5a2d-4d10-877e-4883515135e4": "#FF7700",
  "triple-centena": "#FF9100",
  "triple centena": "#FF9100",
  centena: "#FF9100",
  "condor-gana": "#FF6600",
  "condor gana": "#FF6600",
  "cóndor gana": "#FF6600",
};

/**
 * Obtiene el color neón predeterminado de fábrica para un producto.
 */
export function getDefaultProductNeonColor(
  gameIdOrSlug?: string | null,
  fallback = "#00FF66",
): string {
  if (!gameIdOrSlug) return fallback;
  const clean = gameIdOrSlug.trim().toLowerCase();
  if (NEON_PRODUCT_COLORS[clean]) return NEON_PRODUCT_COLORS[clean];
  const slugified = clean.replace(/[\s_]+/g, "-");
  return NEON_PRODUCT_COLORS[slugified] ?? fallback;
}

/**
 * Resuelve el color para cualquier juego dando máxima prioridad a:
 * 1. Mapa de colores personalizados (por usuario/licencia o global en Diseño).
 * 2. Color personalizado guardado en `game.color` desde Admin -> Juegos (si difiere del color semilla inicial).
 * 3. Paleta neón predeterminada del producto.
 */
export function getGameNeonColor(
  gameIdOrSlug?: string | null,
  fallbackColor = "#00FF66",
  customColorMap?: Record<string, string> | null,
): string {
  if (!gameIdOrSlug) return fallbackColor;
  const clean = gameIdOrSlug.trim().toLowerCase();
  const slugified = clean.replace(/[\s_]+/g, "-");

  // 1. Prioridad a mapa de colores (Diseño por Usuario o Diseño Global)
  if (customColorMap) {
    const mapped =
      customColorMap[gameIdOrSlug] || customColorMap[clean] || customColorMap[slugified];
    if (mapped && mapped.trim()) {
      return mapped.trim();
    }
  }

  // 2. Si el administrador cambió `game.color` en Admin -> Juegos respecto al valor semilla inicial, respetarlo
  const initialSeed = INITIAL_SEED_GAME_COLORS[clean] ?? INITIAL_SEED_GAME_COLORS[slugified];
  if (
    fallbackColor &&
    fallbackColor.trim() &&
    initialSeed &&
    fallbackColor.trim().toLowerCase() !== initialSeed.toLowerCase()
  ) {
    return fallbackColor.trim();
  }

  // 3. Paleta neón oficial por defecto
  if (NEON_PRODUCT_COLORS[clean]) return NEON_PRODUCT_COLORS[clean];
  return NEON_PRODUCT_COLORS[slugified] ?? fallbackColor;
}

/**
 * Genera el estilo para las tarjetas principales de juego:
 * - "neon": Tubo LED Neon Flex con núcleo brillante y halo multicapa.
 * - "solid": Borde clásico sólido limpio sin resplandor fluorescente.
 */
export function getNeonFlexCardStyle(
  color: string,
  cardBg = "#000000",
  styleMode: BoardCardVisualStyle = "neon",
) {
  if (styleMode === "solid") {
    return {
      backgroundColor: cardBg,
      borderColor: color,
      borderStyle: "solid" as const,
      borderWidth: "2px",
      boxShadow: "0 4px 14px rgba(0, 0, 0, 0.65)",
    };
  }
  return {
    backgroundColor: cardBg,
    borderColor: color,
    borderStyle: "solid" as const,
    borderWidth: "clamp(2.5px, 0.28vw, 3.8px)",
    boxShadow: `0 0 6px ${color}cc, 0 0 16px ${color}66, 0 0 28px ${color}26, inset 0 0 10px ${color}26, 0 8px 24px rgba(0, 0, 0, 0.9)`,
  };
}

/**
 * Anillo del logo a juego con el color del producto (Neón o Sólido).
 */
export function getNeonLogoRingStyle(color: string, styleMode: BoardCardVisualStyle = "neon") {
  if (styleMode === "solid") {
    return {
      border: `2px solid ${color}`,
      boxShadow: "0 2px 6px rgba(0, 0, 0, 0.5)",
    };
  }
  return {
    border: `2px solid ${color}`,
    boxShadow: `0 0 8px ${color}aa, inset 0 0 6px ${color}55`,
  };
}

/**
 * Título de la lotería (con resplandor neón o color sólido limpio).
 */
export function getNeonTitleStyle(color: string, styleMode: BoardCardVisualStyle = "neon") {
  if (styleMode === "solid") {
    return {
      color,
      textShadow: "none",
    };
  }
  return {
    color,
    textShadow: `0 0 8px ${color}aa, 0 0 18px ${color}4d`,
  };
}

/**
 * Recuadro del último resultado (Hero Banner) con borde neón o borde sólido clásico.
 */
export function getNeonHeroStyle(
  color: string,
  rowBg = "rgba(10, 15, 29, 0.85)",
  styleMode: BoardCardVisualStyle = "neon",
) {
  if (styleMode === "solid") {
    return {
      backgroundColor: rowBg,
      border: `1.5px solid ${color}`,
      boxShadow: "0 2px 8px rgba(0, 0, 0, 0.45)",
    };
  }
  return {
    backgroundColor: rowBg,
    border: `1.5px solid ${color}99`,
    boxShadow: `0 0 14px ${color}40, inset 0 0 8px ${color}20`,
  };
}

/**
 * Barra o badge de resultado (con resplandor neón o color sólido clásico).
 */
export function getNeonBadgeStyle(color: string, styleMode: BoardCardVisualStyle = "neon") {
  if (styleMode === "solid") {
    return {
      backgroundColor: color,
      boxShadow: "0 2px 6px rgba(0, 0, 0, 0.4)",
    };
  }
  return {
    backgroundColor: color,
    boxShadow: `0 0 10px ${color}cc, 0 0 20px ${color}66`,
  };
}
