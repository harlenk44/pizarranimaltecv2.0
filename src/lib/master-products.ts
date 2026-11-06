/**
 * CATÁLOGO MAESTRO DE PRODUCTOS DE LOTERÍA (Animalitos y Triples)
 *
 * Para agregar una NUEVA lotería al sistema, simplemente añade un nuevo objeto
 * a MASTER_PRODUCTS_CATALOG abajo. Automáticamente se incluirá en:
 *  1. Paginación y rotación (máx. 8 tarjetas por ventana).
 *  2. Checkboxes de licencias para activarlo/desactivarlo por agencia.
 *  3. Ingestión y mapeo de resultados desde TuAzar y LoteríaDeHoy.
 */

export interface MasterProduct {
  id: string; // Identificador único interno (ej: 'lotto-activo', 'triple-ricachona')
  uuid?: string; // UUID de base de datos para retrocompatibilidad con Supabase
  slug: string; // Slug estándar usado en almacenamiento y URLs
  name: string; // Nombre visible en pantalla
  category: "animalitos" | "triples";
  color: string; // Color de acento para la tarjeta y alertas
  logo_url: string; // URL del logotipo oficial
  schedule_times: string[]; // Horarios de sorteos diarios (HH:mm:ss)
  display_order: number;
  extraction?: {
    tuazar_name?: string; // Nombre en tuazar.com
    loteriadehoy_class?: string; // Clase / identificador en loteriadehoy.com
  };
  // Configuración de columnas (para triples)
  columns?: ("A" | "B" | "C" | "SIGN")[];
  columnLabels?: {
    A: string;
    B?: string;
    C?: string;
    SIGN?: string;
  };
}

export const HOURLY_8_TO_7 = [
  "08:00:00",
  "09:00:00",
  "10:00:00",
  "11:00:00",
  "12:00:00",
  "13:00:00",
  "14:00:00",
  "15:00:00",
  "16:00:00",
  "17:00:00",
  "18:00:00",
  "19:00:00",
];

export const HOURLY_9_TO_7 = [
  "09:00:00",
  "10:00:00",
  "11:00:00",
  "12:00:00",
  "13:00:00",
  "14:00:00",
  "15:00:00",
  "16:00:00",
  "17:00:00",
  "18:00:00",
  "19:00:00",
];

export const RICACHONA_HOURLY = [
  "08:05:00",
  "09:05:00",
  "10:05:00",
  "11:05:00",
  "12:05:00",
  "13:05:00",
  "14:05:00",
  "15:05:00",
  "16:05:00",
  "17:05:00",
  "18:05:00",
  "19:05:00",
];

export const MASTER_PRODUCTS_CATALOG: MasterProduct[] = [
  // ==========================================
  // 1. LOTERÍAS DE ANIMALITOS
  // ==========================================
  {
    id: "lotto-activo",
    uuid: "7d21a00b-0dfa-4bdc-9edf-8115802df1d6",
    slug: "lotto-activo",
    name: "Lotto Activo",
    category: "animalitos",
    color: "#16a34a",
    logo_url: "https://tuazar.com/in/loteria/logo_lottoactivo.png",
    schedule_times: HOURLY_8_TO_7,
    display_order: 1,
    extraction: {
      tuazar_name: "LOTTO ACTIVO",
      loteriadehoy_class: "48-Lotto_Activo",
    },
  },
  {
    id: "granjita",
    uuid: "ca8a0400-0000-4000-8000-000000000006",
    slug: "granjita",
    name: "La Granjita",
    category: "animalitos",
    color: "#eab308",
    logo_url: "https://tuazar.com/in/loteria/logo_lagranjita.png",
    schedule_times: HOURLY_8_TO_7,
    display_order: 2,
    extraction: {
      tuazar_name: "LA GRANJITA",
      loteriadehoy_class: "48-La_Granjita",
    },
  },
  {
    id: "guacharo",
    uuid: "01da9c54-392a-45e3-ab66-9a08befe7694",
    slug: "guacharo",
    name: "Guácharo Activo",
    category: "animalitos",
    color: "#dc2626",
    logo_url: "https://tuazar.com/in/loteria/logo_guacharoactivo.png",
    schedule_times: HOURLY_8_TO_7,
    display_order: 3,
    extraction: {
      tuazar_name: "GUACHARO ACTIVO",
      loteriadehoy_class: "48-Guacharo_Activo",
    },
  },
  {
    id: "guacharito",
    uuid: "0519825d-e7ea-4e59-bf7d-cef2c832edd3",
    slug: "guacharito",
    name: "El Guacharito",
    category: "animalitos",
    color: "#eab308",
    logo_url: "https://tuazar.com/in/loteria/logo_elguacharitomillonario.png",
    schedule_times: [
      "08:30:00",
      "09:30:00",
      "10:30:00",
      "11:30:00",
      "12:30:00",
      "13:30:00",
      "14:30:00",
      "15:30:00",
      "16:30:00",
      "17:30:00",
      "18:30:00",
      "19:30:00",
    ],
    display_order: 4,
    extraction: {
      tuazar_name: "EL GUACHARITO MILLONARIO",
    },
  },
  {
    id: "selva-plus",
    uuid: "8f3aa087-6a0c-41a1-9ed3-5f6d5ed6918e",
    slug: "selva-plus",
    name: "Selva Plus",
    category: "animalitos",
    color: "#22c55e",
    logo_url: "https://tuazar.com/in/loteria/logo_selvaplus.png",
    schedule_times: [
      "08:15:00",
      "09:15:00",
      "10:15:00",
      "11:15:00",
      "12:15:00",
      "13:15:00",
      "14:15:00",
      "15:15:00",
      "16:15:00",
      "17:15:00",
      "18:15:00",
      "19:15:00",
    ],
    display_order: 5,
    extraction: {
      tuazar_name: "SELVA PLUS",
      loteriadehoy_class: "48-Selva_Plus",
    },
  },
  {
    id: "monje-millonario",
    uuid: "0f766e00-0000-4000-8000-000000000007",
    slug: "monje-millonario",
    name: "Monje Millonario",
    category: "animalitos",
    color: "#9333ea",
    logo_url: "https://tuazar.com/in/loteria/logo_monjemillonario.webp",
    schedule_times: [
      "08:05:00",
      "09:05:00",
      "10:05:00",
      "11:05:00",
      "12:05:00",
      "13:05:00",
      "14:05:00",
      "15:05:00",
      "16:05:00",
      "17:05:00",
      "18:05:00",
      "19:05:00",
    ],
    display_order: 6,
    extraction: {
      tuazar_name: "MONJE MILLONARIO",
      loteriadehoy_class: "48-Monje_Millonario",
    },
  },
  {
    id: "loto-chaim-a",
    uuid: "1efc5373-a547-4f7f-9955-845b5ede5ce2",
    slug: "loto-chaim-a",
    name: "Loto Chaima",
    category: "animalitos",
    color: "#7c3aed",
    logo_url: "https://tuazar.com/in/loteria/logo_lotochaima.png",
    schedule_times: HOURLY_8_TO_7,
    display_order: 7,
    extraction: {
      tuazar_name: "LOTO CHAIMA",
    },
  },
  {
    id: "lotto-activo-internacional",
    uuid: "1e40af00-0000-4000-8000-000000000008",
    slug: "lotto-activo-internacional",
    name: "Lotto Activo RD",
    category: "animalitos",
    color: "#dc2626",
    logo_url: "https://tuazar.com/in/loteria/logo_lottoactivordinternacional.webp",
    schedule_times: [
      "08:30:00",
      "09:30:00",
      "10:30:00",
      "11:30:00",
      "12:30:00",
      "13:30:00",
      "14:30:00",
      "15:30:00",
      "16:30:00",
      "17:30:00",
      "18:30:00",
      "19:30:00",
    ],
    display_order: 8,
    extraction: {
      tuazar_name: "LOTTO ACTIVO RD INTERNACIONAL",
    },
  },
  {
    id: "lotoanimalito",
    uuid: "d953f80c-4335-4bc9-9f78-9b56193286fe",
    slug: "lotoanimalito",
    name: "Lotoanimalito",
    category: "animalitos",
    color: "#0284c7",
    logo_url: "https://toteback.atilax.io/storage/bases/1/0.png",
    schedule_times: HOURLY_8_TO_7,
    display_order: 9,
  },
  {
    id: "lottopantera",
    uuid: "61580ccf-5a2d-4d10-877e-4883515135e4",
    slug: "lottopantera",
    name: "Lotto Pantera",
    category: "animalitos",
    color: "#f97316",
    logo_url: "https://toteback.atilax.io/storage/bases/2/40.png",
    schedule_times: HOURLY_8_TO_7,
    display_order: 10,
  },

  // ==========================================
  // 2. LOTERÍAS DE TRIPLES
  // ==========================================
  {
    id: "triple-facil",
    slug: "triple-facil",
    name: "Triple Fácil",
    category: "triples",
    color: "#3b82f6",
    logo_url: "https://loteriadehoy.com/dist/files_img/48-Triple_Facil.webp",
    columns: ["A"],
    columnLabels: { A: "Triple" },
    schedule_times: HOURLY_8_TO_7,
    display_order: 9,
    extraction: {
      loteriadehoy_class: "48-Triple_Facil",
    },
  },
  {
    id: "trio-activo",
    slug: "trio-activo",
    name: "Trío Activo",
    category: "triples",
    color: "#10b981",
    logo_url: "https://loteriadehoy.com/dist/files_img/48-Trio_Activo.webp",
    columns: ["A"],
    columnLabels: { A: "Triple" },
    schedule_times: HOURLY_8_TO_7,
    display_order: 10,
    extraction: {
      loteriadehoy_class: "48-Trio_Activo",
    },
  },
  {
    id: "triple-chance",
    slug: "triple-chance",
    name: "Triple Chance",
    category: "triples",
    color: "#f59e0b",
    logo_url: "https://loteriadehoy.com/dist/files_img/48-Triple_Chance.webp",
    columns: ["A", "B", "C", "SIGN"],
    columnLabels: { A: "Triple A", B: "Triple B", C: "Astral", SIGN: "Signo" },
    schedule_times: HOURLY_9_TO_7,
    display_order: 11,
    extraction: {
      loteriadehoy_class: "48-Triple_Chance",
    },
  },
  {
    id: "triple-zulia",
    slug: "triple-zulia",
    name: "Triple Zulia",
    category: "triples",
    color: "#eab308",
    logo_url: "https://loteriadehoy.com/dist/files_img/48-Triple_Zulia.webp",
    columns: ["A", "B", "C", "SIGN"],
    columnLabels: { A: "Triple A", B: "Triple B", C: "Zodiaco", SIGN: "Signo" },
    schedule_times: ["12:45:00", "16:45:00", "19:05:00"],
    display_order: 12,
    extraction: {
      loteriadehoy_class: "48-Triple_Zulia",
    },
  },
  {
    id: "triple-caliente",
    slug: "triple-caliente",
    name: "Triple Caliente",
    category: "triples",
    color: "#ef4444",
    logo_url: "https://loteriadehoy.com/dist/files_img/48-Triple_Caliente.webp",
    columns: ["A", "B", "C", "SIGN"],
    columnLabels: { A: "Triple A", B: "Triple B", C: "Signo C", SIGN: "Signo" },
    schedule_times: ["13:00:00", "16:30:00", "19:10:00"],
    display_order: 13,
    extraction: {
      loteriadehoy_class: "48-Triple_Caliente",
    },
  },
  {
    id: "triple-caracas",
    slug: "triple-caracas",
    name: "Triple Caracas",
    category: "triples",
    color: "#ec4899",
    logo_url: "https://loteriadehoy.com/dist/files_img/48-Triple_Caracas.webp",
    columns: ["A", "B", "C", "SIGN"],
    columnLabels: { A: "Triple A", B: "Triple B", C: "Zodiacal", SIGN: "Signo" },
    schedule_times: ["13:00:00", "16:30:00", "19:00:00"],
    display_order: 14,
    extraction: {
      loteriadehoy_class: "48-Triple_Caracas",
    },
  },
  {
    id: "triple-ricachona",
    slug: "triple-ricachona",
    name: "Triple Ricachona",
    category: "triples",
    color: "#eab308",
    logo_url: "https://loteriadehoy.com/dist/files_img/48-La_Ricachona.webp",
    columns: ["A"],
    columnLabels: { A: "Triple" },
    schedule_times: RICACHONA_HOURLY,
    display_order: 15,
    extraction: {
      loteriadehoy_class: "48-La_Ricachona",
    },
  },
  {
    id: "arrejuntao",
    slug: "arrejuntao",
    name: "Arrejuntao",
    category: "triples",
    color: "#06b6d4",
    logo_url: "https://tuazar.com/in/loteria/logo_el_arrejuntao.png",
    columns: ["A", "B", "C", "SIGN"],
    columnLabels: { A: "Triple A", B: "Triple B", C: "Triple +", SIGN: "Signo" },
    schedule_times: ["10:00:00", "13:00:00", "16:00:00", "19:00:00", "23:00:00"],
    display_order: 16,
    extraction: {
      tuazar_name: "EL ARREJUNTAO",
    },
  },
  {
    id: "triple-pantera",
    uuid: "69efc4d7-52cb-41a6-951d-be299590f393",
    slug: "triple-pantera",
    name: "Triple Pantera",
    category: "triples",
    color: "#eab308",
    logo_url: "https://toteback.atilax.io/storage/bases/2/40.png",
    columns: ["A"],
    columnLabels: { A: "Triple" },
    schedule_times: HOURLY_8_TO_7,
    display_order: 17,
  },
  {
    id: "terminal-pantera",
    uuid: "741ef8e9-129b-446b-abad-d00f68323f1c",
    slug: "terminal-pantera",
    name: "Terminal Pantera",
    category: "triples",
    color: "#06b6d4",
    logo_url: "https://toteback.atilax.io/storage/bases/2/40.png",
    columns: ["A"],
    columnLabels: { A: "Terminal" },
    schedule_times: HOURLY_8_TO_7,
    display_order: 18,
  },
];

/** Obtiene todos los productos de la categoría Animalitos */
export function getMasterAnimalProducts(): MasterProduct[] {
  return MASTER_PRODUCTS_CATALOG.filter((p) => p.category === "animalitos").sort(
    (a, b) => a.display_order - b.display_order,
  );
}

/** Obtiene todos los productos de la categoría Triples */
export function getMasterTripleProducts(): MasterProduct[] {
  return MASTER_PRODUCTS_CATALOG.filter((p) => p.category === "triples").sort(
    (a, b) => a.display_order - b.display_order,
  );
}

/** Divide un arreglo en páginas de máximo `chunkSize` elementos (por defecto 8) */
export function chunkProducts<T>(items: T[], chunkSize = 8): T[][] {
  if (!items || items.length === 0) return [];
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += chunkSize) {
    chunks.push(items.slice(i, i + chunkSize));
  }
  return chunks;
}
