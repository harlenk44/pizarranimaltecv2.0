// Mock in-memory & browser storage database for preview when external Supabase is not provisioned.
import { OFFICIAL_ANIMALS } from "@/lib/official-animals";
import {
  DEFAULT_APP_SETTINGS,
  type AppSettings,
  type Game,
  type Result,
  type Profile,
  type LicenseInfo,
} from "@/lib/types";
import { parseTuazarResults, normalizeName, hourTo24h } from "@/lib/tuazar-parser";
import { TUAZAR_GAME_NAMES } from "@/lib/tuazar-provider.server";
import {
  parseLoteriaDeHoyResults,
  matchGameClass,
  LOTERIADEHOY_GAME_MAPPINGS,
} from "@/lib/loteriadehoy-parser";
import { DEFAULT_GAME_SCHEDULES } from "@/lib/game-schedules";

export interface MockStore {
  games: Game[];
  animal_entries: Array<{
    id: string;
    game_id: string;
    number: number;
    name: string;
    label: string | null;
  }>;
  animal_images: Array<{
    id: string;
    game_id: string;
    animal_number: number;
    image_url: string;
  }>;
  results: Result[];
  app_settings: AppSettings[];
  ads: unknown[];
  profiles: Profile[];
  user_roles: Array<{ user_id: string; role: string }>;
  licenses: LicenseInfo[];
}

const ADMIN_ID = "00000000-0000-0000-0000-000000000001";

export const INITIAL_GAMES: Game[] = [
  {
    id: "7d21a00b-0dfa-4bdc-9edf-8115802df1d6",
    name: "LOTTO ACTIVO",
    slug: "lotto-activo",
    color: "#16a34a",
    logo_url: "https://tuazar.com/in/loteria/logo_lottoactivo.png",
    display_order: 1,
    is_active: true,
    loading_mode: "automatic",
    schedule_times: [...DEFAULT_GAME_SCHEDULES["lotto-activo"]],
    created_at: new Date().toISOString(),
  },
  {
    id: "01da9c54-392a-45e3-ab66-9a08befe7694",
    name: "GUACHARO ACTIVO",
    slug: "guacharo",
    color: "#dc2626",
    logo_url: "https://tuazar.com/in/loteria/logo_guacharoactivo.png",
    display_order: 2,
    is_active: true,
    loading_mode: "automatic",
    schedule_times: [...DEFAULT_GAME_SCHEDULES["guacharo"]],
    created_at: new Date().toISOString(),
  },
  {
    id: "0519825d-e7ea-4e59-bf7d-cef2c832edd3",
    name: "EL GUACHARITO MILLONARIO",
    slug: "guacharito",
    color: "#eab308",
    logo_url: "https://tuazar.com/in/loteria/logo_elguacharitomillonario.png",
    display_order: 3,
    is_active: true,
    loading_mode: "automatic",
    schedule_times: [...DEFAULT_GAME_SCHEDULES["guacharito"]],
    created_at: new Date().toISOString(),
  },
  {
    id: "8f3aa087-6a0c-41a1-9ed3-5f6d5ed6918e",
    name: "SELVA PLUS",
    slug: "selva-plus",
    color: "#22c55e",
    logo_url: "https://tuazar.com/in/loteria/logo_selvaplus.png",
    display_order: 4,
    is_active: true,
    loading_mode: "automatic",
    schedule_times: [...DEFAULT_GAME_SCHEDULES["selva-plus"]],
    created_at: new Date().toISOString(),
  },
  {
    id: "1efc5373-a547-4f7f-9955-845b5ede5ce2",
    name: "LOTO CHAIMA",
    slug: "loto-chaim-a",
    color: "#7c3aed",
    logo_url: "https://tuazar.com/in/loteria/logo_lotochaima.png",
    display_order: 5,
    is_active: true,
    loading_mode: "automatic",
    schedule_times: [...DEFAULT_GAME_SCHEDULES["loto-chaim-a"]],
    created_at: new Date().toISOString(),
  },
  {
    id: "ca8a0400-0000-4000-8000-000000000006",
    name: "LA GRANJITA",
    slug: "granjita",
    color: "#eab308",
    logo_url: "https://tuazar.com/in/loteria/logo_lagranjita.png",
    display_order: 6,
    is_active: true,
    loading_mode: "automatic",
    schedule_times: [...DEFAULT_GAME_SCHEDULES["granjita"]],
    created_at: new Date().toISOString(),
  },
  {
    id: "0f766e00-0000-4000-8000-000000000007",
    name: "MONJE MILLONARIO",
    slug: "monje-millonario",
    color: "#9333ea",
    logo_url: "https://tuazar.com/in/loteria/logo_monjemillonario.webp",
    display_order: 7,
    is_active: true,
    loading_mode: "automatic",
    schedule_times: [...DEFAULT_GAME_SCHEDULES["monje-millonario"]],
    created_at: new Date().toISOString(),
  },
  {
    id: "1e40af00-0000-4000-8000-000000000008",
    name: "LOTTO ACTIVO RD INTERNACIONAL",
    slug: "lotto-activo-internacional",
    color: "#dc2626",
    logo_url: "https://tuazar.com/in/loteria/logo_lottoactivordinternacional.webp",
    display_order: 8,
    is_active: true,
    loading_mode: "automatic",
    schedule_times: [...DEFAULT_GAME_SCHEDULES["lotto-activo-internacional"]],
    created_at: new Date().toISOString(),
  },
];

function buildInitialEntries(): MockStore["animal_entries"] {
  const entries: MockStore["animal_entries"] = [];
  for (const game of INITIAL_GAMES) {
    const catalog = OFFICIAL_ANIMALS[game.slug] ?? OFFICIAL_ANIMALS["lotto-activo"] ?? [];
    for (const item of catalog) {
      let label: string | null = null;
      if (item.name.toLowerCase() === "ballena") label = "00";
      else if (item.name.toLowerCase() === "delfín" || item.name.toLowerCase() === "delfin")
        label = "0";
      entries.push({
        id: `${game.id}-${item.number}`,
        game_id: game.id,
        number: item.number,
        name: item.name,
        label,
      });
    }
  }
  return entries;
}

function buildInitialImages(): MockStore["animal_images"] {
  if (typeof window !== "undefined") {
    try {
      const saved = localStorage.getItem("pizarra_custom_animal_images");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed;
        }
      }
    } catch {
      // ignore
    }
  }

  const images: MockStore["animal_images"] = [];
  const lottoGame = INITIAL_GAMES.find((g) => g.slug === "lotto-activo");
  if (lottoGame) {
    for (let i = 0; i <= 36; i++) {
      images.push({
        id: `img-lotto-${i}`,
        game_id: lottoGame.id,
        animal_number: i,
        image_url: `https://tuazar.com/in/animalitos/lotto_activo/${i}.png`,
      });
    }
  }
  const granjitaGame = INITIAL_GAMES.find((g) => g.slug === "granjita");
  if (granjitaGame) {
    for (let i = 0; i <= 36; i++) {
      images.push({
        id: `img-granjita-${i}`,
        game_id: granjitaGame.id,
        animal_number: i,
        image_url: `https://tuazar.com/in/animalitos/la_granjita/${i}.png`,
      });
    }
  }
  const monjeGame = INITIAL_GAMES.find((g) => g.slug === "monje-millonario");
  if (monjeGame) {
    for (let i = 0; i <= 76; i++) {
      images.push({
        id: `img-monje-${i}`,
        game_id: monjeGame.id,
        animal_number: i,
        image_url: `https://tuazar.com/in/animalitos/monje_millonario/${i}.webp`,
      });
    }
  }
  return images;
}

const SUPER_ADMIN_EMAILS = ["m4rl0nh3rn4nd3z@gmail.com", "admin@pizarra.com"];

function buildInitialProfiles(): Profile[] {
  if (typeof window !== "undefined") {
    try {
      const saved = localStorage.getItem("pizarra_persisted_profiles");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {
      // ignore
    }
  }
  return [
    {
      id: "00000000-0000-0000-0000-000000000002",
      email: "m4rl0nh3rn4nd3z@gmail.com",
      role: "admin",
      subscription_status: "active",
      subscription_expires_at: "2035-01-01T00:00:00Z",
      created_at: new Date().toISOString(),
    },
    {
      id: ADMIN_ID,
      email: "admin@pizarra.com",
      role: "admin",
      subscription_status: "active",
      subscription_expires_at: "2035-01-01T00:00:00Z",
      created_at: new Date().toISOString(),
    },
  ];
}

function buildInitialRoles(): Array<{ user_id: string; role: "admin" | "viewer" }> {
  if (typeof window !== "undefined") {
    try {
      const saved = localStorage.getItem("pizarra_persisted_roles");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {
      // ignore
    }
  }
  return [
    { user_id: ADMIN_ID, role: "admin" },
    { user_id: "00000000-0000-0000-0000-000000000002", role: "admin" },
  ];
}

export function saveProfilesToStorage() {
  if (typeof window !== "undefined") {
    try {
      localStorage.setItem("pizarra_persisted_profiles", JSON.stringify(mockStore.profiles));
      localStorage.setItem("pizarra_persisted_roles", JSON.stringify(mockStore.user_roles));
    } catch {
      // ignore
    }
  }
}

function buildInitialSettings(): AppSettings[] {
  if (typeof window !== "undefined") {
    try {
      const saved = localStorage.getItem("pizarra_app_settings");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && typeof parsed === "object") {
          return [{ ...DEFAULT_APP_SETTINGS, ...parsed, id: "global" }];
        }
      }
    } catch {
      // ignore
    }
  }
  return [{ ...DEFAULT_APP_SETTINGS, id: "global" }];
}

export const GAMES_STORAGE_KEY = "pizarra_persisted_games";

function buildInitialGames(): Game[] {
  let list = [...INITIAL_GAMES];
  if (typeof window !== "undefined") {
    try {
      const saved = localStorage.getItem(GAMES_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          list = list.map((initial) => {
            const savedGame = parsed.find(
              (p: Game) => p.id === initial.id || p.slug === initial.slug,
            );
            if (savedGame) {
              const effectiveMode =
                savedGame.loading_mode ?? savedGame.mode ?? initial.loading_mode ?? "automatic";
              return {
                ...initial,
                ...savedGame,
                loading_mode: effectiveMode,
                mode: effectiveMode,
              };
            }
            return initial;
          });
          for (const p of parsed) {
            if (!list.some((g) => g.id === p.id)) {
              list.push(p);
            }
          }
        }
      }
    } catch {
      // ignore
    }
  }
  return list;
}

function buildInitialLicenses(): LicenseInfo[] {
  if (typeof window !== "undefined") {
    try {
      const saved = localStorage.getItem("pizarra_persisted_licenses");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed as LicenseInfo[];
      }
    } catch {
      // ignore
    }
  }
  return [
    {
      id: "lic-demo-1",
      username: "televisor1",
      password_hash: "123456",
      serial_number: "SERIAL-1234-5678",
      is_active: true,
      device_id: null,
      activated_at: null,
      expires_at: null,
      created_at: new Date().toISOString(),
    },
  ];
}

// Global persistent in-memory store
declare global {
  var __APPLET_MOCK_STORE__: MockStore | undefined;
}

if (!globalThis.__APPLET_MOCK_STORE__) {
  globalThis.__APPLET_MOCK_STORE__ = {
    games: buildInitialGames(),
    animal_entries: buildInitialEntries(),
    animal_images: buildInitialImages(),
    results: [],
    app_settings: buildInitialSettings(),
    ads: [],
    profiles: buildInitialProfiles(),
    user_roles: buildInitialRoles(),
    licenses: buildInitialLicenses(),
  };
}

export function ensureAllGameEntries(store: MockStore) {
  for (const game of store.games) {
    const catalog = OFFICIAL_ANIMALS[game.slug] ?? OFFICIAL_ANIMALS["lotto-activo"] ?? [];
    for (const item of catalog) {
      const exists = store.animal_entries.some(
        (e) =>
          e.game_id === game.id &&
          (e.number === item.number ||
            ((item.number === 76 || item.number === 37 || item.number === 100) &&
              e.label === "00")),
      );
      if (!exists) {
        let label: string | null = null;
        if (item.name.toLowerCase() === "ballena") label = "00";
        else if (item.name.toLowerCase() === "delfín" || item.name.toLowerCase() === "delfin")
          label = "0";
        store.animal_entries.push({
          id: `${game.id}-${item.number}`,
          game_id: game.id,
          number: item.number,
          name: item.name,
          label,
        });
      }
    }

    if (game.slug === "monje-millonario") {
      for (let i = 0; i <= 76; i++) {
        const hasImg = store.animal_images.some(
          (img) => img.game_id === game.id && img.animal_number === i,
        );
        if (!hasImg) {
          store.animal_images.push({
            id: `img-monje-${i}`,
            game_id: game.id,
            animal_number: i,
            image_url: `https://tuazar.com/in/animalitos/monje_millonario/${i}.webp`,
          });
        }
      }
    }
  }
}

export const mockStore: MockStore = globalThis.__APPLET_MOCK_STORE__;
ensureAllGameEntries(mockStore);

let syncPromise: Promise<number> | null = null;

export async function syncTuazarDirectly(): Promise<number> {
  if (syncPromise) return syncPromise;
  syncPromise = (async () => {
    try {
      // If running in browser, fetch through our TanStack server endpoint to avoid CORS
      if (
        typeof window !== "undefined" &&
        window.location?.origin &&
        window.location.origin !== "null" &&
        !window.location.href?.includes("about:blank")
      ) {
        const res = await fetch(`${window.location.origin}/api/public/results/sync`, {
          method: "POST",
        });
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data?.results)) {
            mockStore.results = data.results;
            return data.results.length;
          }
        }
        return 0;
      }

      let added = 0;
      const todayCaracas = new Intl.DateTimeFormat("en-CA", {
        timeZone: "America/Caracas",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(new Date());

      // Helper to match draw with catalog with fallback
      const matchDrawWithCatalog = (
        drawNumber: string,
        drawAnimal: string,
        catalog: typeof mockStore.animal_entries,
        gameSlug?: string,
      ) => {
        const numVal = Number(drawNumber);
        const normAnimal = normalizeName(drawAnimal);

        // 1. Direct name + number match
        let matched = catalog.find((entry) => {
          const nameMatches = normalizeName(entry.name) === normAnimal;
          if (!nameMatches) return false;
          const directNum = entry.number === numVal;
          const labelMatch = entry.label === drawNumber;
          const ballenaMatch =
            (drawNumber === "00" || drawNumber === "0") && normalizeName(entry.name) === "BALLENA";
          const delfinMatch =
            (drawNumber === "0" || drawNumber === "00") && normalizeName(entry.name) === "DELFIN";
          return directNum || labelMatch || ballenaMatch || delfinMatch;
        });
        if (matched) return matched;

        // 2. Special match for 00 Ballena or 0 Delfín
        if (drawNumber === "00" || normAnimal === "BALLENA") {
          matched = catalog.find((e) => e.label === "00" || normalizeName(e.name) === "BALLENA");
          if (matched) return matched;
        }
        if (drawNumber === "0" || normAnimal === "DELFIN") {
          matched = catalog.find((e) => e.number === 0 || normalizeName(e.name) === "DELFIN");
          if (matched) return matched;
        }

        // 3. Match by number if > 0
        if (numVal > 0) {
          matched = catalog.find((e) => e.number === numVal);
          if (matched) return matched;
        }

        // 4. Match by animal name
        matched = catalog.find((e) => normalizeName(e.name) === normAnimal);
        if (matched) return matched;

        // 5. Official animal fallback
        const officialCatalog = gameSlug ? OFFICIAL_ANIMALS[gameSlug] : undefined;
        if (officialCatalog) {
          const off = officialCatalog.find(
            (a) => a.number === numVal || normalizeName(a.name) === normAnimal,
          );
          if (off) {
            return {
              id: `fallback-${numVal}`,
              game_id: "",
              number: off.number,
              name: off.name,
              label: drawNumber,
            };
          }
        }

        // 6. Non-dropping fallback
        return {
          id: `raw-${numVal}`,
          game_id: "",
          number: Number.isNaN(numVal) ? 0 : numVal,
          name: drawAnimal,
          label: drawNumber,
        };
      };

      // 1. Try PRIMARY source: LoteriaDeHoy
      let ldhSuccess = false;
      try {
        const ldhRes = await fetch("https://loteriadehoy.com/animalitos/resultados/", {
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36",
          },
        });
        if (ldhRes.ok) {
          const ldhHtml = await ldhRes.text();
          const ldhPage = parseLoteriaDeHoyResults(ldhHtml);
          const drawDate = ldhPage.date ?? todayCaracas;

          for (const [slug, meta] of Object.entries(LOTERIADEHOY_GAME_MAPPINGS)) {
            const game = mockStore.games.find((g) => g.slug === slug);
            if (!game) continue;
            const effectiveMode = (game.mode ?? game.loading_mode ?? "automatic").toLowerCase();
            if (effectiveMode === "manual" || !game.is_active) continue;

            const catalog = mockStore.animal_entries.filter((e) => e.game_id === game.id);
            const draws = ldhPage.results.filter(
              (r) =>
                matchGameClass(r.gameClass, meta.className) ||
                r.gameClass === meta.className.toLowerCase(),
            );

            for (const draw of draws) {
              const drawTime = draw.drawTime;
              if (!drawTime) continue;

              const matched = matchDrawWithCatalog(draw.number, draw.animal, catalog, game.slug);
              if (!matched) continue;

              const existing = mockStore.results.find(
                (r) =>
                  r.game_id === game.id && r.draw_date === drawDate && r.draw_time === drawTime,
              );
              if (existing) {
                if (existing.source !== "manual") {
                  existing.animal_number = matched.number;
                  existing.animal_name = matched.name;
                  existing.source = "automatic";
                }
              } else {
                mockStore.results.push({
                  id: `res-${game.id}-${drawDate}-${drawTime}`,
                  game_id: game.id,
                  draw_date: drawDate,
                  draw_time: drawTime,
                  animal_number: matched.number,
                  animal_name: matched.name,
                  source: "automatic",
                  created_at: new Date().toISOString(),
                });
                added++;
              }

              if (draw.imageUrl) {
                const existingImg = mockStore.animal_images.find(
                  (img) => img.game_id === game.id && img.animal_number === matched.number,
                );
                if (existingImg) {
                  existingImg.image_url = draw.imageUrl;
                } else {
                  mockStore.animal_images.push({
                    id: `img-${game.id}-${matched.number}`,
                    game_id: game.id,
                    animal_number: matched.number,
                    image_url: draw.imageUrl,
                  });
                }
              }
            }
          }
          ldhSuccess = added > 0 || ldhPage.results.length > 0;
        }
      } catch (ldhErr) {
        console.warn("[mock-db] LoteriaDeHoy fetch failed, falling back to TuAzar:", ldhErr);
      }

      // 2. If LoteriaDeHoy was not available or produced 0 draws, fallback to TuAzar
      if (!ldhSuccess) {
        try {
          const response = await fetch("https://tuazar.com/loteria/animalitos/resultados/", {
            headers: {
              "User-Agent":
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36",
            },
          });
          if (response.ok) {
            const html = await response.text();
            const page = parseTuazarResults(html);
            const drawDate = page.date ?? todayCaracas;

            for (const [slug, tuazarName] of Object.entries(TUAZAR_GAME_NAMES)) {
              const game = mockStore.games.find((g) => g.slug === slug);
              if (!game) continue;
              const effectiveMode = (game.mode ?? game.loading_mode ?? "automatic").toLowerCase();
              if (effectiveMode === "manual" || !game.is_active) continue;

              const catalog = mockStore.animal_entries.filter((e) => e.game_id === game.id);
              const wanted = normalizeName(tuazarName);
              const draws = page.results.filter((r) => normalizeName(r.game) === wanted);

              for (const draw of draws) {
                const drawTime = hourTo24h(draw.hour);
                if (!drawTime) continue;

                const matched = matchDrawWithCatalog(draw.number, draw.animal, catalog, game.slug);
                if (!matched) continue;

                const existing = mockStore.results.find(
                  (r) =>
                    r.game_id === game.id && r.draw_date === drawDate && r.draw_time === drawTime,
                );
                if (existing) {
                  if (existing.source !== "manual") {
                    existing.animal_number = matched.number;
                    existing.animal_name = matched.name;
                    existing.source = "automatic";
                  }
                } else {
                  mockStore.results.push({
                    id: `res-${game.id}-${drawDate}-${drawTime}`,
                    game_id: game.id,
                    draw_date: drawDate,
                    draw_time: drawTime,
                    animal_number: matched.number,
                    animal_name: matched.name,
                    source: "automatic",
                    created_at: new Date().toISOString(),
                  });
                  added++;
                }

                if (draw.imageUrl) {
                  const existingImg = mockStore.animal_images.find(
                    (img) => img.game_id === game.id && img.animal_number === matched.number,
                  );
                  if (existingImg) {
                    existingImg.image_url = draw.imageUrl;
                  } else {
                    mockStore.animal_images.push({
                      id: `img-${game.id}-${matched.number}`,
                      game_id: game.id,
                      animal_number: matched.number,
                      image_url: draw.imageUrl,
                    });
                  }
                }
                if (draw.gameLogoUrl && !game.logo_url) {
                  game.logo_url = draw.gameLogoUrl;
                }
              }
            }
          }
        } catch (tuazarErr) {
          console.warn("[mock-db] Fallback TuAzar fetch also failed:", tuazarErr);
        }
      }

      return added;
    } catch (err) {
      console.warn("[mock-db] Error syncing lottery results directly:", err);
      return 0;
    } finally {
      syncPromise = null;
    }
  })();
  return syncPromise;
}

export const syncLotteryDirectly = syncTuazarDirectly;

// Initial sync on module load
syncTuazarDirectly();

function parsePostgrestCond(cond: string) {
  const trimmed = cond.trim();
  const firstDot = trimmed.indexOf(".");
  if (firstDot === -1) return null;
  const col = trimmed.slice(0, firstDot);
  const rest = trimmed.slice(firstDot + 1);
  const secondDot = rest.indexOf(".");
  if (secondDot === -1) return null;
  const op = rest.slice(0, secondDot);
  const valStr = rest.slice(secondDot + 1);
  return { col, op, valStr };
}

function evaluatePostgrestCond(row: Record<string, unknown>, cond: string): boolean {
  const parsed = parsePostgrestCond(cond);
  if (!parsed) return true;
  const { col, op, valStr } = parsed;
  const cell = row[col];

  if (op === "is") {
    if (valStr === "null") return cell === null || cell === undefined;
    if (valStr === "true") return cell === true;
    if (valStr === "false") return cell === false;
    return cell === valStr;
  }
  if (op === "eq") {
    return String(cell) === valStr || cell === valStr;
  }
  if (op === "neq") {
    return String(cell) !== valStr && cell !== valStr;
  }
  if (op === "gte") {
    if (cell === null || cell === undefined) return false;
    return (cell as string | number) >= valStr;
  }
  if (op === "lte") {
    if (cell === null || cell === undefined) return false;
    return (cell as string | number) <= valStr;
  }
  if (op === "gt") {
    if (cell === null || cell === undefined) return false;
    return (cell as string | number) > valStr;
  }
  if (op === "lt") {
    if (cell === null || cell === undefined) return false;
    return (cell as string | number) < valStr;
  }
  if (op === "ilike" || op === "like") {
    if (cell === null || cell === undefined) return false;
    const cleanPattern = valStr.replace(/^%|%$/g, "").toLowerCase();
    return String(cell).toLowerCase().includes(cleanPattern);
  }
  return true;
}

function createMockQueryBuilder(table: string) {
  const filters: Array<(row: Record<string, unknown>) => boolean> = [];
  const sortSpecs: Array<{ col: string; ascending: boolean }> = [];
  let isSingle = false;
  let limitCount: number | null = null;
  let rangeFrom: number | null = null;
  let rangeTo: number | null = null;
  let isDelete = false;
  let isUpdate = false;
  let updatePayload: Record<string, unknown> | null = null;

  const builder = {
    select() {
      return builder;
    },
    eq(col: string, val: unknown) {
      filters.push((row) => row[col] === val);
      return builder;
    },
    neq(col: string, val: unknown) {
      filters.push((row) => row[col] !== val);
      return builder;
    },
    gt(col: string, val: unknown) {
      filters.push((row) => (row[col] as number | string) > (val as number | string));
      return builder;
    },
    gte(col: string, val: unknown) {
      filters.push((row) => (row[col] as number | string) >= (val as number | string));
      return builder;
    },
    lt(col: string, val: unknown) {
      filters.push((row) => (row[col] as number | string) < (val as number | string));
      return builder;
    },
    lte(col: string, val: unknown) {
      filters.push((row) => (row[col] as number | string) <= (val as number | string));
      return builder;
    },
    is(col: string, val: unknown) {
      filters.push((row) => row[col] === val);
      return builder;
    },
    in(col: string, vals: unknown[]) {
      filters.push((row) => vals.includes(row[col]));
      return builder;
    },
    or(filtersString: string) {
      const parts = filtersString.split(",");
      filters.push((row) => parts.some((p) => evaluatePostgrestCond(row, p)));
      return builder;
    },
    ilike(col: string, pattern: string) {
      const clean = pattern.replace(/^%|%$/g, "").toLowerCase();
      filters.push((row) =>
        String(row[col] ?? "")
          .toLowerCase()
          .includes(clean),
      );
      return builder;
    },
    like(col: string, pattern: string) {
      const clean = pattern.replace(/^%|%$/g, "");
      filters.push((row) => String(row[col] ?? "").includes(clean));
      return builder;
    },
    order(col: string, { ascending = true }: { ascending?: boolean; nullsFirst?: boolean } = {}) {
      sortSpecs.push({ col, ascending });
      return builder;
    },
    limit(count: number) {
      limitCount = count;
      return builder;
    },
    range(from: number, to: number) {
      rangeFrom = from;
      rangeTo = to;
      return builder;
    },
    maybeSingle() {
      isSingle = true;
      return builder;
    },
    single() {
      isSingle = true;
      return builder;
    },
    insert(rows: Record<string, unknown> | Array<Record<string, unknown>>) {
      const storeList = ((mockStore as unknown as Record<string, unknown[]>)[table] ??= []);
      const toAdd = Array.isArray(rows) ? rows : [rows];
      const insertedRows: Record<string, unknown>[] = [];
      for (const r of toAdd) {
        const newRow = { id: r["id"] ?? `id-${Date.now()}-${Math.random()}`, ...r };
        storeList.push(newRow);
        insertedRows.push(newRow);
      }
      if (table === "licenses" && typeof window !== "undefined") {
        try {
          localStorage.setItem("pizarra_persisted_licenses", JSON.stringify(storeList));
        } catch {
          // ignore
        }
      }
      if ((table === "profiles" || table === "user_roles") && typeof window !== "undefined") {
        saveProfilesToStorage();
      }

      const resultData = Array.isArray(rows) ? insertedRows : insertedRows[0];
      const resPromise = Promise.resolve({ data: resultData, error: null });

      return Object.assign(resPromise, {
        select() {
          return Object.assign(Promise.resolve({ data: resultData, error: null }), {
            single() {
              return Promise.resolve({ data: insertedRows[0], error: null });
            },
          });
        },
        single() {
          return Promise.resolve({ data: insertedRows[0], error: null });
        },
      });
    },
    update(changes: Record<string, unknown>) {
      isUpdate = true;
      updatePayload = changes;
      return builder;
    },
    upsert(
      rowOrRows: Record<string, unknown> | Array<Record<string, unknown>>,
      options?: { onConflict?: string },
    ) {
      const storeList = ((mockStore as unknown as Record<string, unknown[]>)[table] ??= []);
      const toUpsert = Array.isArray(rowOrRows) ? rowOrRows : [rowOrRows];
      const conflictKeys = (options?.onConflict ?? "id").split(",");

      for (const row of toUpsert) {
        const existingIdx = storeList.findIndex((item) =>
          conflictKeys.every((k) => item[k.trim()] === row[k.trim()]),
        );
        if (existingIdx >= 0) {
          storeList[existingIdx] = { ...storeList[existingIdx], ...row };
        } else {
          storeList.push({ id: row["id"] ?? `id-${Date.now()}-${Math.random()}`, ...row });
        }
      }

      if (table === "games" && typeof window !== "undefined") {
        try {
          localStorage.setItem(GAMES_STORAGE_KEY, JSON.stringify(storeList));
        } catch {
          // ignore
        }
      }
      if (table === "animal_images" && typeof window !== "undefined") {
        try {
          localStorage.setItem("pizarra_custom_animal_images", JSON.stringify(storeList));
        } catch {
          // ignore
        }
      }
      if (table === "app_settings" && typeof window !== "undefined" && storeList.length > 0) {
        try {
          localStorage.setItem("pizarra_app_settings", JSON.stringify(storeList[0]));
        } catch {
          // ignore
        }
      }

      return Promise.resolve({ data: rowOrRows, error: null });
    },
    delete() {
      isDelete = true;
      return builder;
    },
    async then<TResult1 = { data: unknown; error: null }, TResult2 = never>(
      onFulfilled?:
        ((value: { data: unknown; error: null }) => TResult1 | PromiseLike<TResult1>) | null,
      onRejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
    ): Promise<TResult1 | TResult2> {
      if (table === "results" && mockStore.results.length === 0 && typeof window !== "undefined") {
        await syncTuazarDirectly();
      }
      const storeList = ((mockStore as unknown as Record<string, unknown[]>)[table] ??=
        []) as Record<string, unknown>[];

      if (isDelete) {
        const remaining = storeList.filter((item) => !filters.every((f) => f(item)));
        (mockStore as unknown as Record<string, unknown[]>)[table] = remaining;
        if (table === "games" && typeof window !== "undefined") {
          try {
            localStorage.setItem(GAMES_STORAGE_KEY, JSON.stringify(remaining));
          } catch {
            // ignore
          }
        }
        if (table === "animal_images" && typeof window !== "undefined") {
          try {
            localStorage.setItem("pizarra_custom_animal_images", JSON.stringify(remaining));
          } catch {
            // ignore
          }
        }
        if ((table === "profiles" || table === "user_roles") && typeof window !== "undefined") {
          saveProfilesToStorage();
        }
        if (table === "licenses" && typeof window !== "undefined") {
          try {
            localStorage.setItem("pizarra_persisted_licenses", JSON.stringify(remaining));
          } catch {
            // ignore
          }
        }
        return Promise.resolve({ data: null, error: null }).then(onFulfilled, onRejected);
      }

      if (isUpdate && updatePayload) {
        const updatedRows: Record<string, unknown>[] = [];
        for (const item of storeList) {
          if (filters.every((f) => f(item))) {
            Object.assign(item, updatePayload);
            if (updatePayload["loading_mode"] || updatePayload["mode"]) {
              const m = (updatePayload["mode"] ?? updatePayload["loading_mode"]) as string;
              item["loading_mode"] = m;
              item["mode"] = m;
            }
            updatedRows.push(item);
          }
        }
        if (table === "games" && typeof window !== "undefined") {
          try {
            localStorage.setItem(GAMES_STORAGE_KEY, JSON.stringify(storeList));
          } catch {
            // ignore
          }
        }
        if (table === "app_settings" && typeof window !== "undefined" && storeList.length > 0) {
          try {
            localStorage.setItem("pizarra_app_settings", JSON.stringify(storeList[0]));
          } catch {
            // ignore
          }
        }
        const data = isSingle ? (updatedRows[0] ?? null) : updatedRows;
        return Promise.resolve({ data, error: null }).then(onFulfilled, onRejected);
      }

      const filtered = storeList.filter((item) => filters.every((f) => f(item)));
      if (sortSpecs.length > 0) {
        filtered.sort((a, b) => {
          for (const { col, ascending } of sortSpecs) {
            const valA = a[col];
            const valB = b[col];
            if (valA === valB) continue;
            if (valA === undefined || valA === null) return ascending ? 1 : -1;
            if (valB === undefined || valB === null) return ascending ? -1 : 1;
            if (valA < valB) return ascending ? -1 : 1;
            if (valA > valB) return ascending ? 1 : -1;
          }
          return 0;
        });
      }

      let resultData = filtered;
      if (rangeFrom !== null && rangeTo !== null) {
        resultData = resultData.slice(rangeFrom, rangeTo + 1);
      } else if (limitCount !== null && limitCount >= 0) {
        resultData = resultData.slice(0, limitCount);
      }

      const data = isSingle ? (resultData[0] ?? null) : resultData;
      return Promise.resolve({ data, error: null }).then(onFulfilled, onRejected);
    },
  };
  return builder;
}

const MOCK_AUTH_STORAGE_KEY = "pizarra_mock_session";
const authSubscribers = new Set<(event: string, session: unknown) => void>();

function getPersistedSession() {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(MOCK_AUTH_STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    // ignore
  }
  return null;
}

function persistSession(session: unknown) {
  if (typeof window === "undefined") return;
  try {
    if (session) {
      localStorage.setItem(MOCK_AUTH_STORAGE_KEY, JSON.stringify(session));
    } else {
      localStorage.removeItem(MOCK_AUTH_STORAGE_KEY);
    }
  } catch {
    // ignore
  }
}

function notifySubscribers(event: string, session: unknown) {
  for (const sub of authSubscribers) {
    try {
      sub(event, session);
    } catch (err) {
      console.warn("Auth subscriber error:", err);
    }
  }
}

function createSessionForUser(email: string) {
  const normEmail = (email || "").trim().toLowerCase();
  const isSuperAdmin = SUPER_ADMIN_EMAILS.includes(normEmail);
  let profile = mockStore.profiles.find((p) => p.email.toLowerCase() === normEmail);

  if (!profile) {
    const newId = `user-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    profile = {
      id: newId,
      email: normEmail,
      role: isSuperAdmin ? "admin" : "viewer",
      subscription_status: isSuperAdmin ? "active" : "inactive",
      subscription_expires_at: isSuperAdmin ? "2035-01-01T00:00:00Z" : null,
      created_at: new Date().toISOString(),
    };
    mockStore.profiles.push(profile);
    mockStore.user_roles.push({ user_id: newId, role: isSuperAdmin ? "admin" : "viewer" });
    saveProfilesToStorage();
  } else {
    if (isSuperAdmin) {
      profile.role = "admin";
      profile.subscription_status = "active";
      if (!profile.subscription_expires_at) {
        profile.subscription_expires_at = "2035-01-01T00:00:00Z";
      }
      if (!mockStore.user_roles.some((r) => r.user_id === profile!.id && r.role === "admin")) {
        mockStore.user_roles = mockStore.user_roles.filter((r) => r.user_id !== profile!.id);
        mockStore.user_roles.push({ user_id: profile.id, role: "admin" });
      }
    }
    saveProfilesToStorage();
  }

  return {
    access_token: `mock-token-${profile.id}`,
    token_type: "bearer",
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    refresh_token: `mock-refresh-${profile.id}`,
    user: {
      id: profile.id,
      email: profile.email,
      app_metadata: {},
      user_metadata: {},
      aud: "authenticated",
      created_at: profile.created_at,
    },
  };
}

const mockStorageFiles = new Map<string, string>();

export function createMockSupabaseClient() {
  return {
    auth: {
      async getSession() {
        const stored = getPersistedSession();
        if (stored?.user?.id) {
          // Verify profile exists in mockStore
          let p = mockStore.profiles.find((prof) => prof.id === stored.user.id);
          if (!p && stored.user.email) {
            const isSuperAdmin = SUPER_ADMIN_EMAILS.includes(stored.user.email.toLowerCase());
            p = {
              id: stored.user.id,
              email: stored.user.email,
              role: isSuperAdmin ? "admin" : "viewer",
              subscription_status: isSuperAdmin ? "active" : "inactive",
              subscription_expires_at: isSuperAdmin ? "2035-01-01T00:00:00Z" : null,
              created_at: new Date().toISOString(),
            };
            mockStore.profiles.push(p);
            mockStore.user_roles.push({
              user_id: stored.user.id,
              role: isSuperAdmin ? "admin" : "viewer",
            });
            saveProfilesToStorage();
          }
          return { data: { session: stored }, error: null };
        }
        return { data: { session: null }, error: null };
      },
      onAuthStateChange(callback: (event: string, session: unknown) => void) {
        authSubscribers.add(callback);
        const current = getPersistedSession();
        setTimeout(() => {
          callback(current ? "SIGNED_IN" : "SIGNED_OUT", current);
        }, 0);
        return {
          data: {
            subscription: {
              unsubscribe: () => {
                authSubscribers.delete(callback);
              },
            },
          },
        };
      },
      async signInWithPassword({ email }: { email: string; password?: string }) {
        if (!email) {
          return {
            data: { session: null, user: null },
            error: new Error("Por favor ingresa un correo electrónico válido"),
          };
        }
        const session = createSessionForUser(email);
        persistSession(session);
        notifySubscribers("SIGNED_IN", session);
        return { data: { session, user: session.user }, error: null };
      },
      async signUp({ email }: { email: string; password?: string }) {
        if (!email) {
          return {
            data: { session: null, user: null },
            error: new Error("Por favor ingresa un correo electrónico válido"),
          };
        }
        const session = createSessionForUser(email);
        persistSession(session);
        notifySubscribers("SIGNED_IN", session);
        return { data: { user: session.user, session }, error: null };
      },
      async signOut() {
        persistSession(null);
        notifySubscribers("SIGNED_OUT", null);
        return { error: null };
      },
      async getUser() {
        const session = getPersistedSession();
        return { data: { user: session?.user ?? null }, error: null };
      },
    },
    from(tableName: string) {
      return createMockQueryBuilder(tableName);
    },
    rpc(fnName: string, args: Record<string, unknown>) {
      if (fnName === "request_tv_pairing_code") {
        const { p_device_id } = args as { p_device_id: string };
        if (!mockStore.tv_devices) mockStore.tv_devices = [];
        if (!mockStore.tv_pairing_codes) mockStore.tv_pairing_codes = [];

        const dev = mockStore.tv_devices.find((d) => d.device_id === p_device_id);
        if (dev && dev.is_active) {
          const expired = dev.expires_at && new Date(dev.expires_at) < new Date();
          if (!expired) {
            return Promise.resolve({
              data: {
                status: "already_active",
                device_name: dev.device_name,
                expires_at: dev.expires_at,
              },
              error: null,
            });
          }
        }

        let codeMatch = mockStore.tv_pairing_codes.find((p) => p.device_id === p_device_id);
        if (!codeMatch) {
          const rand1 = Math.floor(100 + Math.random() * 900);
          const rand2 = Math.floor(100 + Math.random() * 900);
          codeMatch = {
            code: `${rand1}-${rand2}`,
            device_id: p_device_id,
            created_at: new Date().toISOString(),
          };
          mockStore.tv_pairing_codes.push(codeMatch);
        }

        return Promise.resolve({
          data: { status: "code_generated", code: codeMatch.code, device_id: p_device_id },
          error: null,
        });
      }

      if (fnName === "authorize_tv_device") {
        const { p_code, p_device_name, p_days } = args as {
          p_code: string;
          p_device_name?: string;
          p_days?: number;
        };
        if (!mockStore.tv_devices) mockStore.tv_devices = [];
        if (!mockStore.tv_pairing_codes) mockStore.tv_pairing_codes = [];

        const normCode = (p_code || "").trim().replace(/[^0-9]/g, "");
        const formatted =
          normCode.length === 6 ? `${normCode.slice(0, 3)}-${normCode.slice(3)}` : normCode;

        const pairMatch = mockStore.tv_pairing_codes.find(
          (p) => p.code.replace(/[^0-9]/g, "") === normCode,
        );

        const devId = pairMatch ? pairMatch.device_id : `TV-DIRECT-${normCode}`;
        const expiresAt = p_days ? new Date(Date.now() + p_days * 86400000).toISOString() : null;

        const existing = mockStore.tv_devices.find((d) => d.device_id === devId);
        if (existing) {
          existing.device_name = p_device_name || existing.device_name || "Smart TV";
          existing.pairing_code = formatted;
          existing.is_active = true;
          existing.expires_at = expiresAt;
          existing.activated_at = new Date().toISOString();
        } else {
          mockStore.tv_devices.push({
            id: `tv-${Date.now()}`,
            device_id: devId,
            device_name: p_device_name || "Smart TV",
            pairing_code: formatted,
            is_active: true,
            expires_at: expiresAt,
            activated_at: new Date().toISOString(),
            created_at: new Date().toISOString(),
          });
        }

        return Promise.resolve({
          data: {
            success: true,
            device_id: devId,
            device_name: p_device_name,
            expires_at: expiresAt,
          },
          error: null,
        });
      }

      if (fnName === "check_tv_device_status") {
        const { p_device_id } = args as { p_device_id: string };
        if (!mockStore.tv_devices) mockStore.tv_devices = [];

        const dev = mockStore.tv_devices.find((d) => d.device_id === p_device_id);
        if (!dev) {
          return Promise.resolve({
            data: { active: false, message: "Pendiente de activación" },
            error: null,
          });
        }
        if (!dev.is_active) {
          return Promise.resolve({
            data: { active: false, message: "Televisor pausado o suspendido" },
            error: null,
          });
        }
        if (dev.expires_at && new Date(dev.expires_at) < new Date()) {
          return Promise.resolve({
            data: { active: false, message: "Servicio vencido" },
            error: null,
          });
        }

        return Promise.resolve({
          data: { active: true, device_name: dev.device_name, expires_at: dev.expires_at },
          error: null,
        });
      }

      if (fnName === "set_subscription_status") {
        const { target_user_id, new_status, new_expires_at } = args as {
          target_user_id: string;
          new_status: "active" | "inactive" | "trial";
          new_expires_at: string | null;
        };
        const prof = mockStore.profiles.find((p) => p.id === target_user_id);
        if (prof) {
          prof.subscription_status = new_status;
          prof.subscription_expires_at = new_expires_at;
          saveProfilesToStorage();
          return Promise.resolve({ data: true, error: null });
        }
        return Promise.resolve({ data: false, error: null });
      }
      if (fnName === "create_client_user") {
        const { email, days } = args as {
          email: string;
          days: number;
        };
        const normEmail = (email || "").trim().toLowerCase();
        let prof = mockStore.profiles.find((p) => p.email.toLowerCase() === normEmail);
        const expires = new Date();
        expires.setDate(expires.getDate() + (days || 30));
        const expiresAt = expires.toISOString();

        if (prof) {
          prof.subscription_status = "active";
          prof.subscription_expires_at = expiresAt;
          saveProfilesToStorage();
          return Promise.resolve({ data: prof, error: null });
        }

        const newId = `client-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
        prof = {
          id: newId,
          email: normEmail,
          role: "viewer",
          subscription_status: "active",
          subscription_expires_at: expiresAt,
          created_at: new Date().toISOString(),
        };
        mockStore.profiles.push(prof);
        mockStore.user_roles.push({ user_id: newId, role: "viewer" });
        saveProfilesToStorage();
        return Promise.resolve({ data: prof, error: null });
      }
      if (fnName === "delete_client_user") {
        const { target_user_id } = args as { target_user_id: string };
        mockStore.profiles = mockStore.profiles.filter((p) => p.id !== target_user_id);
        mockStore.user_roles = mockStore.user_roles.filter((r) => r.user_id !== target_user_id);
        saveProfilesToStorage();
        return Promise.resolve({ data: true, error: null });
      }
      if (fnName === "sync_automatic_result") {
        const { p_game_id, p_draw_date, p_draw_time, p_animal_number, p_animal_name } = args;
        const existing = mockStore.results.find(
          (r) =>
            r.game_id === p_game_id && r.draw_date === p_draw_date && r.draw_time === p_draw_time,
        );
        if (existing) {
          if (existing.source === "manual") return Promise.resolve({ data: false, error: null });
          existing.animal_number = p_animal_number as number;
          existing.animal_name = p_animal_name as string;
          return Promise.resolve({ data: true, error: null });
        }
        mockStore.results.push({
          id: `res-${p_game_id}-${p_draw_date}-${p_draw_time}`,
          game_id: p_game_id as string,
          draw_date: p_draw_date as string,
          draw_time: p_draw_time as string,
          animal_number: p_animal_number as number,
          animal_name: p_animal_name as string,
          source: "automatic",
          created_at: new Date().toISOString(),
        });
        return Promise.resolve({ data: true, error: null });
      }
      return Promise.resolve({ data: null, error: null });
    },
    channel() {
      return {
        on() {
          return this;
        },
        subscribe() {
          return { unsubscribe: () => {} };
        },
      };
    },
    removeChannel() {},
    storage: {
      from(bucket: string = "animal-images") {
        return {
          async createSignedUrl(path: string) {
            let dataUrl = mockStorageFiles.get(`${bucket}:${path}`) || mockStorageFiles.get(path);
            if (!dataUrl && typeof window !== "undefined") {
              try {
                dataUrl = localStorage.getItem(`pizarra_storage_${bucket}_${path}`) ?? undefined;
              } catch {
                // ignore
              }
            }
            return { data: { signedUrl: dataUrl || path }, error: null };
          },
          async upload(path: string, file: File | Blob | string, _options?: unknown) {
            return new Promise<{ data: { path: string }; error: null }>((resolve) => {
              if (typeof file === "string") {
                mockStorageFiles.set(`${bucket}:${path}`, file);
                try {
                  localStorage.setItem(`pizarra_storage_${bucket}_${path}`, file);
                } catch {
                  // ignore
                }
                resolve({ data: { path }, error: null });
                return;
              }
              if (typeof FileReader !== "undefined" && file instanceof Blob) {
                const reader = new FileReader();
                reader.onload = () => {
                  const dataUrl = reader.result as string;
                  mockStorageFiles.set(`${bucket}:${path}`, dataUrl);
                  try {
                    localStorage.setItem(`pizarra_storage_${bucket}_${path}`, dataUrl);
                  } catch {
                    // ignore quota limits, Map still has it in memory
                  }
                  resolve({ data: { path }, error: null });
                };
                reader.onerror = () => {
                  resolve({ data: { path }, error: null });
                };
                reader.readAsDataURL(file);
              } else {
                resolve({ data: { path }, error: null });
              }
            });
          },
          async remove(paths: string[]) {
            for (const p of paths) {
              mockStorageFiles.delete(`${bucket}:${p}`);
              mockStorageFiles.delete(p);
              if (typeof window !== "undefined") {
                try {
                  localStorage.removeItem(`pizarra_storage_${bucket}_${p}`);
                } catch {
                  // ignore
                }
              }
            }
            return { data: paths, error: null };
          },
        };
      },
    },
  };
}
