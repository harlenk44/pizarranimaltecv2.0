import {
  MASTER_PRODUCTS_CATALOG,
  getMasterAnimalProducts,
  getMasterTripleProducts,
} from "@/lib/master-products";

export interface LotteryGameOption {
  id: string;
  slug: string;
  name: string;
  category: "animalitos" | "triples";
}

export const DEFAULT_ANIMAL_LOTTERIES: LotteryGameOption[] = getMasterAnimalProducts().map((p) => ({
  id: p.id,
  slug: p.slug,
  name: p.name,
  category: "animalitos",
}));

export const ALL_TRIPLE_LOTTERIES: LotteryGameOption[] = getMasterTripleProducts().map((p) => ({
  id: p.id,
  slug: p.slug,
  name: p.name,
  category: "triples",
}));

export const ALL_AVAILABLE_LOTTERIES: LotteryGameOption[] = MASTER_PRODUCTS_CATALOG.map((p) => ({
  id: p.id,
  slug: p.slug,
  name: p.name,
  category: p.category,
}));

const KNOWN_UUID_TO_SLUG: Record<string, string> = MASTER_PRODUCTS_CATALOG.reduce(
  (acc, p) => {
    if (p.uuid) {
      acc[p.uuid] = p.slug;
    }
    return acc;
  },
  {} as Record<string, string>,
);

export const DEFAULT_TARJETAS_POR_PANTALLA = 8;
export const DEFAULT_TIEMPO_TRANSICION_SEGUNDOS = 25;
export const MIN_TIEMPO_TRANSICION_SEGUNDOS = 5;
export const MIN_TARJETAS_POR_PANTALLA = 2;

export const OPCIONES_TARJETAS_POR_PANTALLA: Array<{
  value: number | "TODAS";
  label: string;
}> = [
  { value: 2, label: "2 productos (Grilla 2x1)" },
  { value: 3, label: "3 productos (Grilla 3x1)" },
  { value: 4, label: "4 productos (Grilla 2x2)" },
  { value: 6, label: "6 productos (Grilla 3x2)" },
  { value: 8, label: "8 productos (Grilla 4x2 · Por defecto)" },
  { value: 9, label: "9 productos (Grilla 3x3)" },
  { value: 10, label: "10 productos (Grilla 5x2)" },
  { value: 12, label: "12 productos (Grilla 4x3)" },
  { value: "TODAS", label: "Todas en una ventana" },
];

export const OPCIONES_TIEMPO_TRANSICION: Array<{
  value: number;
  label: string;
}> = [
  { value: 10, label: "10 segundos" },
  { value: 15, label: "15 segundos" },
  { value: 20, label: "20 segundos" },
  { value: 25, label: "25 segundos (Por defecto)" },
  { value: 30, label: "30 segundos" },
  { value: 45, label: "45 segundos" },
  { value: 60, label: "60 segundos" },
];

export interface ConfigClienteObj {
  loterias: string[] | "TODAS";
  tarjetasPorPantalla: number | "TODAS";
  tiempoTransicion: number;
}

export interface ConfigClienteDeserializada extends ConfigClienteObj {
  nombre: string;
  cleanName: string;
  allowedLotteries: string[] | null;
}

/**
 * Empaqueta de forma segura el nombre limpio del cliente junto con su configuración
 * estructurada después del separador "||".
 */
export function serializarConfigCliente(
  nombre: string,
  configObj?: Partial<ConfigClienteObj> | null,
): string {
  try {
    const baseName = String(nombre ?? "")
      .split("||")[0]
      ?.trim();
    const cleanName = baseName || "Cliente";

    let loterias: string[] | "TODAS" = "TODAS";
    if (configObj && Array.isArray(configObj.loterias)) {
      const sanitized = configObj.loterias.map((item) => String(item).trim()).filter(Boolean);
      if (sanitized.length > 0 && sanitized.length < ALL_AVAILABLE_LOTTERIES.length) {
        loterias = sanitized;
      } else {
        loterias = "TODAS";
      }
    } else if (configObj?.loterias === "TODAS") {
      loterias = "TODAS";
    }

    let tarjetasPorPantalla: number | "TODAS" = DEFAULT_TARJETAS_POR_PANTALLA;
    if (
      configObj?.tarjetasPorPantalla === "TODAS" ||
      String(configObj?.tarjetasPorPantalla).toUpperCase() === "TODAS"
    ) {
      tarjetasPorPantalla = "TODAS";
    } else if (configObj?.tarjetasPorPantalla !== undefined) {
      const parsedCards = Number(configObj.tarjetasPorPantalla);
      if (Number.isFinite(parsedCards) && parsedCards >= MIN_TARJETAS_POR_PANTALLA) {
        tarjetasPorPantalla = Math.floor(parsedCards);
      }
    }

    let tiempoTransicion = DEFAULT_TIEMPO_TRANSICION_SEGUNDOS;
    if (configObj?.tiempoTransicion !== undefined) {
      const parsedTime = Number(configObj.tiempoTransicion);
      if (Number.isFinite(parsedTime) && parsedTime >= MIN_TIEMPO_TRANSICION_SEGUNDOS) {
        tiempoTransicion = Math.floor(parsedTime);
      }
    }

    const payload: ConfigClienteObj = {
      loterias,
      tarjetasPorPantalla,
      tiempoTransicion,
    };

    return `${cleanName}||${JSON.stringify(payload)}`;
  } catch {
    const fallbackName =
      String(nombre ?? "Cliente")
        .split("||")[0]
        ?.trim() || "Cliente";
    return `${fallbackName}||${JSON.stringify({
      loterias: "TODAS",
      tarjetasPorPantalla: DEFAULT_TARJETAS_POR_PANTALLA,
      tiempoTransicion: DEFAULT_TIEMPO_TRANSICION_SEGUNDOS,
    })}`;
  }
}

/**
 * Deserializa de forma 100% retrocompatible el campo guardado de la licencia.
 * Soporta:
 * 1) Licencias antiguas sin "||"
 * 2) Licencias con arreglo JSON simple después de "||" (ej: 'Cliente||["lotto-activo"]')
 * 3) Licencias con el nuevo objeto JSON estructurado (ej: 'Cliente||{"loterias":...}')
 * Nunca lanza excepciones: ante cualquier error devuelve valores seguros por defecto.
 */
export function deserializarConfigCliente(
  textoGuardado?: string | null,
): ConfigClienteDeserializada {
  const defaultResult: ConfigClienteDeserializada = {
    nombre: "Cliente",
    cleanName: "Cliente",
    loterias: "TODAS",
    allowedLotteries: null,
    tarjetasPorPantalla: DEFAULT_TARJETAS_POR_PANTALLA,
    tiempoTransicion: DEFAULT_TIEMPO_TRANSICION_SEGUNDOS,
  };

  try {
    if (!textoGuardado || typeof textoGuardado !== "string") {
      return defaultResult;
    }

    const str = textoGuardado.trim();
    if (!str) {
      return defaultResult;
    }

    if (!str.includes("||")) {
      return {
        ...defaultResult,
        nombre: str,
        cleanName: str,
      };
    }

    const parts = str.split("||");
    const cleanName = parts[0]?.trim() || "Cliente";
    const rawConfig = parts.slice(1).join("||").trim();

    if (!rawConfig) {
      return {
        ...defaultResult,
        nombre: cleanName,
        cleanName,
      };
    }

    try {
      const parsed = JSON.parse(rawConfig);

      // Caso 1: Formato anterior de arreglo JSON: ["lotto-activo", "granjita"]
      if (Array.isArray(parsed)) {
        const sanitized = parsed.map((item) => String(item).trim()).filter(Boolean);
        const hasSubset = sanitized.length > 0;
        return {
          nombre: cleanName,
          cleanName,
          loterias: hasSubset ? sanitized : "TODAS",
          allowedLotteries: hasSubset ? sanitized : null,
          tarjetasPorPantalla: DEFAULT_TARJETAS_POR_PANTALLA,
          tiempoTransicion: DEFAULT_TIEMPO_TRANSICION_SEGUNDOS,
        };
      }

      // Caso 2: Nuevo formato de objeto JSON estructurado
      if (parsed && typeof parsed === "object") {
        const obj = parsed as Record<string, unknown>;

        let loterias: string[] | "TODAS" = "TODAS";
        let allowedLotteries: string[] | null = null;

        if (Array.isArray(obj.loterias)) {
          const sanitized = obj.loterias.map((item) => String(item).trim()).filter(Boolean);
          if (sanitized.length > 0 && sanitized.length < ALL_AVAILABLE_LOTTERIES.length) {
            loterias = sanitized;
            allowedLotteries = sanitized;
          } else if (sanitized.length >= ALL_AVAILABLE_LOTTERIES.length) {
            loterias = "TODAS";
            allowedLotteries = null;
          }
        } else if (typeof obj.loterias === "string" && obj.loterias.toUpperCase() !== "TODAS") {
          const splitItems = obj.loterias
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean);
          if (splitItems.length > 0) {
            loterias = splitItems;
            allowedLotteries = splitItems;
          }
        }

        let tarjetasPorPantalla: number | "TODAS" = DEFAULT_TARJETAS_POR_PANTALLA;
        if (
          obj.tarjetasPorPantalla === "TODAS" ||
          String(obj.tarjetasPorPantalla).toUpperCase() === "TODAS"
        ) {
          tarjetasPorPantalla = "TODAS";
        } else if (obj.tarjetasPorPantalla !== undefined) {
          const numCards = Number(obj.tarjetasPorPantalla);
          if (Number.isFinite(numCards) && numCards >= MIN_TARJETAS_POR_PANTALLA) {
            tarjetasPorPantalla = Math.floor(numCards);
          }
        }

        let tiempoTransicion = DEFAULT_TIEMPO_TRANSICION_SEGUNDOS;
        if (obj.tiempoTransicion !== undefined) {
          const numTime = Number(obj.tiempoTransicion);
          if (Number.isFinite(numTime) && numTime >= MIN_TIEMPO_TRANSICION_SEGUNDOS) {
            tiempoTransicion = Math.floor(numTime);
          }
        }

        return {
          nombre: cleanName,
          cleanName,
          loterias,
          allowedLotteries,
          tarjetasPorPantalla,
          tiempoTransicion,
        };
      }
    } catch {
      // Fallback: si no era JSON sino texto separado por comas sin llaves de objeto roto
      if (!rawConfig.includes("{") && !rawConfig.includes("}")) {
        const items = rawConfig
          .replace(/[[\]"']/g, "")
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);
        if (items.length > 0) {
          return {
            nombre: cleanName,
            cleanName,
            loterias: items,
            allowedLotteries: items,
            tarjetasPorPantalla: DEFAULT_TARJETAS_POR_PANTALLA,
            tiempoTransicion: DEFAULT_TIEMPO_TRANSICION_SEGUNDOS,
          };
        }
      }
    }

    return {
      ...defaultResult,
      nombre: cleanName,
      cleanName,
    };
  } catch {
    return defaultResult;
  }
}

/**
 * Calcula las propiedades CSS del Grid de TV según la cantidad de tarjetas por pantalla
 * (2 -> 2x1, 3 -> 3x1, 4 -> 2x2, 6 -> 3x2, 8 -> 4x2, 9 -> 3x3, 10 -> 5x2, 12 -> 4x3).
 */
export function calcularGrillaTV(
  cantidadPorPantalla?: number | "TODAS" | null,
  totalTarjetasEnVentana?: number,
): { gridTemplateColumns: string; gridTemplateRows: string } {
  try {
    let n = DEFAULT_TARJETAS_POR_PANTALLA;
    if (cantidadPorPantalla === "TODAS" || String(cantidadPorPantalla).toUpperCase() === "TODAS") {
      n = Math.max(1, Number(totalTarjetasEnVentana) || DEFAULT_TARJETAS_POR_PANTALLA);
    } else if (cantidadPorPantalla !== undefined && cantidadPorPantalla !== null) {
      const parsed = Number(cantidadPorPantalla);
      if (Number.isFinite(parsed) && parsed >= 1) {
        n = Math.floor(parsed);
      }
    }

    let cols = 4;
    let rows = 2;

    if (n <= 1) {
      cols = 1;
      rows = 1;
    } else if (n === 2) {
      cols = 2;
      rows = 1;
    } else if (n === 3) {
      cols = 3;
      rows = 1;
    } else if (n === 4) {
      cols = 2;
      rows = 2;
    } else if (n <= 6) {
      cols = 3;
      rows = 2;
    } else if (n <= 8) {
      cols = 4;
      rows = 2;
    } else if (n === 9) {
      cols = 3;
      rows = 3;
    } else if (n === 10) {
      cols = 5;
      rows = 2;
    } else if (n <= 12) {
      cols = 4;
      rows = 3;
    } else {
      cols = 4;
      rows = Math.ceil(n / 4);
    }

    return {
      gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
      gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))`,
    };
  } catch {
    return {
      gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
      gridTemplateRows: "repeat(2, minmax(0, 1fr))",
    };
  }
}

/**
 * Divide una lista de productos en páginas/ventanas según la cantidad configurada por pantalla.
 */
export function dividirEnVentanas<T>(
  listaProductos: T[],
  cantidadPorPantalla?: number | "TODAS" | null,
): T[][] {
  try {
    if (!Array.isArray(listaProductos) || listaProductos.length === 0) {
      return [];
    }

    if (cantidadPorPantalla === "TODAS" || String(cantidadPorPantalla).toUpperCase() === "TODAS") {
      return [listaProductos];
    }

    const parsed = Number(cantidadPorPantalla);
    const tamanoPagina =
      Number.isFinite(parsed) && parsed >= MIN_TARJETAS_POR_PANTALLA
        ? Math.floor(parsed)
        : DEFAULT_TARJETAS_POR_PANTALLA;

    const ventanas: T[][] = [];
    for (let i = 0; i < listaProductos.length; i += tamanoPagina) {
      ventanas.push(listaProductos.slice(i, i + tamanoPagina));
    }
    return ventanas;
  } catch {
    return Array.isArray(listaProductos) && listaProductos.length > 0 ? [listaProductos] : [];
  }
}

let activeCarouselTimerId: ReturnType<typeof setInterval> | null = null;

/**
 * Inicia el temporizador del carrusel limpiando siempre cualquier setInterval previo
 * para evitar acumulación de temporizadores en memoria. Aplica un mínimo de seguridad de 5s.
 */
export function iniciarCarruselVentanas(
  tiempoSegundos: number,
  callbackCambio: () => void,
  onProgress?: (porcentaje: number) => void,
): () => void {
  try {
    if (activeCarouselTimerId !== null) {
      clearInterval(activeCarouselTimerId);
      activeCarouselTimerId = null;
    }

    const parsedSec = Number(tiempoSegundos);
    const segundosSeguros =
      Number.isFinite(parsedSec) && parsedSec > 0
        ? Math.max(MIN_TIEMPO_TRANSICION_SEGUNDOS, parsedSec)
        : DEFAULT_TIEMPO_TRANSICION_SEGUNDOS;
    const duracionMs = segundosSeguros * 1000;

    if (typeof onProgress === "function") {
      const tickMs = 500;
      let transcurrido = 0;
      activeCarouselTimerId = setInterval(() => {
        try {
          transcurrido += tickMs;
          onProgress(Math.min(100, (transcurrido / duracionMs) * 100));
          if (transcurrido >= duracionMs) {
            transcurrido = 0;
            onProgress(0);
            callbackCambio();
          }
        } catch {
          // ignore callback errors
        }
      }, tickMs);
    } else {
      activeCarouselTimerId = setInterval(() => {
        try {
          callbackCambio();
        } catch {
          // ignore callback errors
        }
      }, duracionMs);
    }

    const currentTimer = activeCarouselTimerId;
    return () => {
      if (currentTimer !== null) {
        clearInterval(currentTimer);
      }
      if (activeCarouselTimerId === currentTimer) {
        activeCarouselTimerId = null;
      }
    };
  } catch {
    return () => {};
  }
}

/**
 * Parses client_name to extract clean display name, allowed lotteries array,
 * and custom screen parameters.
 */
export function parseClientLicenseName(rawName?: string | null): {
  cleanName: string;
  allowedLotteries: string[] | null;
  tarjetasPorPantalla: number | "TODAS";
  tiempoTransicion: number;
} {
  const deserialized = deserializarConfigCliente(rawName);
  return {
    cleanName: deserialized.cleanName,
    allowedLotteries: deserialized.allowedLotteries,
    tarjetasPorPantalla: deserialized.tarjetasPorPantalla,
    tiempoTransicion: deserialized.tiempoTransicion,
  };
}

/**
 * Formats clean client name with selected allowed lotteries.
 * If allowedLotteries is null or contains all available lotteries, returns just the clean name.
 */
export function formatClientLicenseName(
  cleanName: string,
  allowedLotteries: string[] | null,
  totalAvailableCount?: number,
): string {
  const name = cleanName.trim() || "Cliente";
  if (!allowedLotteries || allowedLotteries.length === 0) {
    return name;
  }

  if (totalAvailableCount && allowedLotteries.length >= totalAvailableCount) {
    return name;
  }

  return `${name}||${JSON.stringify(allowedLotteries)}`;
}

/**
 * Checks whether a given lottery (by ID, UUID, or slug) is permitted.
 * If allowedLotteries is null, all lotteries are permitted.
 */
export function isLotteryPermitted(
  gameIdOrSlug?: string | null,
  allowedLotteries?: string[] | null,
): boolean {
  if (!allowedLotteries || allowedLotteries.length === 0) {
    return true;
  }
  if (!gameIdOrSlug) {
    return true;
  }

  const raw = String(gameIdOrSlug).trim().toLowerCase();
  const slugFromUuid = KNOWN_UUID_TO_SLUG[raw] || raw;

  return allowedLotteries.some((al) => {
    const target = String(al).trim().toLowerCase();
    if (target === raw || target === slugFromUuid) return true;

    // Handle aliases like "granjita" vs "la-granjita"
    if (
      (slugFromUuid === "granjita" && target === "la-granjita") ||
      (slugFromUuid === "la-granjita" && target === "granjita")
    ) {
      return true;
    }

    if (target.length >= 4 && slugFromUuid.includes(target)) return true;
    if (slugFromUuid.length >= 4 && target.includes(slugFromUuid)) return true;

    return false;
  });
}
