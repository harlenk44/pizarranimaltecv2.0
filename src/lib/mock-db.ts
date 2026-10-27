// Mock in-memory & browser storage database for preview when external Supabase is not provisioned.
import { OFFICIAL_ANIMALS } from "@/lib/official-animals";
import {
  DEFAULT_APP_SETTINGS,
  type AppSettings,
  type Game,
  type Result,
  type Profile,
} from "@/lib/types";
import { parseTuazarResults, normalizeName, hourTo24h } from "@/lib/tuazar-parser";
import { TUAZAR_GAME_NAMES } from "@/lib/tuazar-provider.server";

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
}

const ADMIN_ID = "00000000-0000-0000-0000-000000000001";

export const INITIAL_GAMES: Game[] = [
  {
    id: "7d21a00b-0dfa-4bdc-9edf-8115802df1d6",
    name: "LOTTO ACTIVO",
    slug: "lotto-activo",
    color: "#1a56db",
    logo_url: "https://tuazar.com/in/loteria/logo_lottoactivo.png",
    display_order: 1,
    is_active: true,
    loading_mode: "automatic",
    created_at: new Date().toISOString(),
  },
  {
    id: "01da9c54-392a-45e3-ab66-9a08befe7694",
    name: "GUACHARO ACTIVO",
    slug: "guacharo",
    color: "#059669",
    logo_url: "https://tuazar.com/in/loteria/logo_guacharoactivo.png",
    display_order: 2,
    is_active: true,
    loading_mode: "automatic",
    created_at: new Date().toISOString(),
  },
  {
    id: "0519825d-e7ea-4e59-bf7d-cef2c832edd3",
    name: "EL GUACHARITO MILLONARIO",
    slug: "guacharito",
    color: "#7c2d12",
    logo_url: "https://tuazar.com/in/loteria/logo_elguacharitomillonario.png",
    display_order: 3,
    is_active: true,
    loading_mode: "automatic",
    created_at: new Date().toISOString(),
  },
  {
    id: "8f3aa087-6a0c-41a1-9ed3-5f6d5ed6918e",
    name: "SELVA PLUS",
    slug: "selva-plus",
    color: "#0d9488",
    logo_url: "https://tuazar.com/in/loteria/logo_selvaplus.png",
    display_order: 4,
    is_active: true,
    loading_mode: "automatic",
    created_at: new Date().toISOString(),
  },
  {
    id: "1efc5373-a547-4f7f-9955-845b5ede5ce2",
    name: "LOTO CHAIMA",
    slug: "loto-chaim-a",
    color: "#b45309",
    logo_url: "https://tuazar.com/in/loteria/logo_lotochaima.png",
    display_order: 5,
    is_active: true,
    loading_mode: "automatic",
    created_at: new Date().toISOString(),
  },
  {
    id: "ca8a0400-0000-4000-8000-000000000006",
    name: "LA GRANJITA",
    slug: "granjita",
    color: "#ca8a04",
    logo_url: "https://tuazar.com/in/loteria/logo_lagranjita.png",
    display_order: 6,
    is_active: true,
    loading_mode: "automatic",
    created_at: new Date().toISOString(),
  },
  {
    id: "0f766e00-0000-4000-8000-000000000007",
    name: "MONJE MILLONARIO",
    slug: "monje-millonario",
    color: "#0f766e",
    logo_url: "https://tuazar.com/in/loteria/logo_monjemillonario.webp",
    display_order: 7,
    is_active: true,
    loading_mode: "automatic",
    created_at: new Date().toISOString(),
  },
  {
    id: "1e40af00-0000-4000-8000-000000000008",
    name: "LOTTO ACTIVO RD INTERNACIONAL",
    slug: "lotto-activo-internacional",
    color: "#1e40af",
    logo_url: "https://tuazar.com/in/loteria/logo_lottoactivordinternacional.webp",
    display_order: 8,
    is_active: true,
    loading_mode: "automatic",
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
  return images;
}

// Global persistent in-memory store
declare global {
  var __APPLET_MOCK_STORE__: MockStore | undefined;
}

if (!globalThis.__APPLET_MOCK_STORE__) {
  globalThis.__APPLET_MOCK_STORE__ = {
    games: [...INITIAL_GAMES],
    animal_entries: buildInitialEntries(),
    animal_images: buildInitialImages(),
    results: [],
    app_settings: [{ ...DEFAULT_APP_SETTINGS, id: "global" }],
    ads: [],
    profiles: [
      {
        id: ADMIN_ID,
        email: "admin@pizarra.com",
        role: "admin",
        subscription_status: "active",
        subscription_expires_at: "2030-01-01T00:00:00Z",
        created_at: new Date().toISOString(),
      },
    ],
    user_roles: [{ user_id: ADMIN_ID, role: "admin" }],
  };
}

export const mockStore: MockStore = globalThis.__APPLET_MOCK_STORE__;

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

      const response = await fetch("https://tuazar.com/loteria/animalitos/resultados/", {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36",
        },
      });
      if (!response.ok) return 0;
      const html = await response.text();
      const page = parseTuazarResults(html);
      const drawDate =
        page.date ??
        new Intl.DateTimeFormat("en-CA", {
          timeZone: "America/Caracas",
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
        }).format(new Date());

      let added = 0;
      for (const [slug, tuazarName] of Object.entries(TUAZAR_GAME_NAMES)) {
        const game = mockStore.games.find((g) => g.slug === slug);
        if (!game) continue;
        const catalog = mockStore.animal_entries.filter((e) => e.game_id === game.id);
        const wanted = normalizeName(tuazarName);
        const draws = page.results.filter((r) => normalizeName(r.game) === wanted);

        for (const draw of draws) {
          const drawTime = hourTo24h(draw.hour);
          if (!drawTime) continue;
          const numVal = Number(draw.number);
          const normAnimal = normalizeName(draw.animal);

          const matched = catalog.find((entry) => {
            const nameMatches = normalizeName(entry.name) === normAnimal;
            if (!nameMatches) return false;
            const directNum = entry.number === numVal;
            const labelMatch = entry.label === draw.number;
            const ballenaMatch =
              (draw.number === "00" || draw.number === "0") &&
              normalizeName(entry.name) === "BALLENA";
            const delfinMatch =
              (draw.number === "0" || draw.number === "00") &&
              normalizeName(entry.name) === "DELFIN";
            return directNum || labelMatch || ballenaMatch || delfinMatch;
          });

          if (!matched) continue;

          // Check if existing result was manually entered
          const existing = mockStore.results.find(
            (r) => r.game_id === game.id && r.draw_date === drawDate && r.draw_time === drawTime,
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
      return added;
    } catch (err) {
      console.warn("[mock-db] Error syncing TuAzar directly:", err);
      return 0;
    } finally {
      syncPromise = null;
    }
  })();
  return syncPromise;
}

// Initial sync on module load
syncTuazarDirectly();

function createMockQueryBuilder(table: string) {
  const filters: Array<(row: Record<string, unknown>) => boolean> = [];
  let sortFn: ((a: Record<string, unknown>, b: Record<string, unknown>) => number) | null = null;
  let isSingle = false;

  const builder = {
    select() {
      return builder;
    },
    eq(col: string, val: unknown) {
      filters.push((row) => row[col] === val);
      return builder;
    },
    order(col: string, { ascending = true }: { ascending?: boolean } = {}) {
      sortFn = (a, b) => {
        const valA = a[col] as string | number;
        const valB = b[col] as string | number;
        if (valA < valB) return ascending ? -1 : 1;
        if (valA > valB) return ascending ? 1 : -1;
        return 0;
      };
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
      for (const r of toAdd) {
        storeList.push({ id: r["id"] ?? `id-${Date.now()}-${Math.random()}`, ...r });
      }
      return Promise.resolve({ data: rows, error: null });
    },
    update(changes: Record<string, unknown>) {
      return {
        eq(col: string, val: unknown) {
          const storeList = ((mockStore as unknown as Record<string, unknown[]>)[table] ??= []);
          for (const item of storeList) {
            if (item[col] === val) {
              Object.assign(item, changes);
            }
          }
          return Promise.resolve({ data: changes, error: null });
        },
      };
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
      return Promise.resolve({ data: rowOrRows, error: null });
    },
    delete() {
      return {
        eq(col: string, val: unknown) {
          const storeList = ((mockStore as unknown as Record<string, unknown[]>)[table] ??= []);
          (mockStore as unknown as Record<string, unknown[]>)[table] = storeList.filter(
            (item) => item[col] !== val,
          );
          return Promise.resolve({ data: null, error: null });
        },
      };
    },
    async then<TResult1 = { data: unknown; error: null }, TResult2 = never>(
      onFulfilled?:
        ((value: { data: unknown; error: null }) => TResult1 | PromiseLike<TResult1>) | null,
      onRejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
    ): Promise<TResult1 | TResult2> {
      if (table === "results" && mockStore.results.length === 0 && typeof window !== "undefined") {
        await syncTuazarDirectly();
      }
      const storeList = ((mockStore as unknown as Record<string, unknown[]>)[table] ??
        []) as Record<string, unknown>[];
      const filtered = storeList.filter((item) => filters.every((f) => f(item)));
      if (sortFn) filtered.sort(sortFn);
      const data = isSingle ? (filtered[0] ?? null) : filtered;
      return Promise.resolve({ data, error: null }).then(onFulfilled, onRejected);
    },
  };
  return builder;
}

export function createMockSupabaseClient() {
  const session = {
    access_token: "mock-admin-token",
    token_type: "bearer",
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    refresh_token: "mock-refresh-token",
    user: {
      id: ADMIN_ID,
      email: "admin@pizarra.com",
      app_metadata: {},
      user_metadata: {},
      aud: "authenticated",
      created_at: new Date().toISOString(),
    },
  };

  return {
    auth: {
      async getSession() {
        return { data: { session }, error: null };
      },
      onAuthStateChange(callback: (event: string, session: typeof session) => void) {
        setTimeout(() => callback("SIGNED_IN", session), 0);
        return {
          data: {
            subscription: {
              unsubscribe: () => {},
            },
          },
        };
      },
      async signInWithPassword() {
        return { data: { session, user: session.user }, error: null };
      },
      async signUp() {
        return { data: { user: session.user, session }, error: null };
      },
      async signOut() {
        return { error: null };
      },
      async getUser() {
        return { data: { user: session.user }, error: null };
      },
    },
    from(tableName: string) {
      return createMockQueryBuilder(tableName);
    },
    rpc(fnName: string, args: Record<string, unknown>) {
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
      from() {
        return {
          async createSignedUrl(path: string) {
            return { data: { signedUrl: path }, error: null };
          },
          async upload(path: string) {
            return { data: { path }, error: null };
          },
        };
      },
    },
  };
}
