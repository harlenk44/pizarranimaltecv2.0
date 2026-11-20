import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  areSameCanonicalGame,
  deduplicateGamesList,
  matchResultsForGame,
  normalizeGameSlug,
} from "@/lib/game-slugs";
import {
  consolidateGamesAndOrphanResultsInSupabase,
  consolidateInMemoryGamesAndResults,
  inferCanonicalSlugForOrphanGroup,
} from "@/lib/consolidate-games-results.server";
import { getResultsProviderForSlug } from "@/lib/result-sync.server";
import { mockStore, INITIAL_GAMES } from "@/lib/mock-db";
import type { Game } from "@/lib/types";

function makeInMemorySupabaseClient(initial: {
  games: Array<Record<string, unknown>>;
  results: Array<Record<string, unknown>>;
  animal_images?: Array<Record<string, unknown>>;
  animal_entries?: Array<Record<string, unknown>>;
}) {
  const tables: Record<string, Array<Record<string, unknown>>> = {
    games: initial.games.map((g) => ({ ...g })),
    results: initial.results.map((r) => ({ ...r })),
    animal_images: (initial.animal_images ?? []).map((i) => ({ ...i })),
    animal_entries: (initial.animal_entries ?? []).map((e) => ({ ...e })),
  };

  const makeQuery = (table: string) => {
    const filters: Array<(row: Record<string, unknown>) => boolean> = [];
    let orderCol: string | null = null;
    let orderAsc = true;
    let op: "select" | "update" | "delete" | "upsert" = "select";
    let payload: Record<string, unknown> | Array<Record<string, unknown>> | null = null;

    const execute = async () => {
      const rows = tables[table] ?? [];
      const matching = rows.filter((row) => filters.every((f) => f(row)));

      if (op === "select") {
        const result = [...matching];
        if (orderCol) {
          result.sort((a, b) => {
            const av = a[orderCol!] ?? "";
            const bv = b[orderCol!] ?? "";
            if (av < bv) return orderAsc ? -1 : 1;
            if (av > bv) return orderAsc ? 1 : -1;
            return 0;
          });
        }
        return { data: result.map((r) => ({ ...r })), error: null };
      }

      if (op === "update" && payload && !Array.isArray(payload)) {
        for (const row of matching) {
          Object.assign(row, payload);
        }
        return { data: matching.map((r) => ({ ...r })), error: null };
      }

      if (op === "delete") {
        tables[table] = rows.filter((row) => !matching.includes(row));
        return { data: matching, error: null };
      }

      if (op === "upsert" && payload) {
        const items = Array.isArray(payload) ? payload : [payload];
        for (const item of items) {
          const idx = rows.findIndex((r) => r.id && r.id === item.id);
          if (idx >= 0) {
            rows[idx] = { ...rows[idx], ...item };
          } else {
            rows.push({ ...item });
          }
        }
        return { data: items, error: null };
      }

      return { data: null, error: null };
    };

    const builder: Record<string, unknown> = {
      select: () => {
        op = "select";
        return builder;
      },
      update: (data: Record<string, unknown>) => {
        op = "update";
        payload = data;
        return builder;
      },
      delete: () => {
        op = "delete";
        return builder;
      },
      upsert: (data: Record<string, unknown> | Array<Record<string, unknown>>) => {
        op = "upsert";
        payload = data;
        return builder;
      },
      eq: (col: string, val: unknown) => {
        filters.push((row) => row[col] === val);
        return builder;
      },
      in: (col: string, vals: unknown[]) => {
        filters.push((row) => vals.includes(row[col]));
        return builder;
      },
      order: (col: string, opts?: { ascending?: boolean }) => {
        orderCol = col;
        orderAsc = opts?.ascending !== false;
        return builder;
      },
      maybeSingle: async () => {
        const res = await execute();
        return {
          data: Array.isArray(res.data) ? (res.data[0] ?? null) : null,
          error: res.error,
        };
      },
      then: (onFulfilled?: (val: unknown) => unknown, onRejected?: (err: unknown) => unknown) =>
        execute().then(onFulfilled, onRejected),
    };

    return builder;
  };

  return {
    tables,
    from: (table: string) => makeQuery(table),
    rpc: vi.fn(async () => ({ data: true, error: null })),
  };
}

describe("Normalización estricta de slugs y deduplicación de games[]", () => {
  it("normaliza alias de GUACHARO ACTIVO, EL GUACHARITO MILLONARIO y LA GRANJITA a una única clave canónica", () => {
    expect(normalizeGameSlug("guacharo")).toBe("guacharo-activo");
    expect(normalizeGameSlug("guacharo-activo")).toBe("guacharo-activo");
    expect(normalizeGameSlug("GUÁCHARO ACTIVO")).toBe("guacharo-activo");
    expect(normalizeGameSlug(undefined, "GUACHARO ACTIVO")).toBe("guacharo-activo");

    expect(normalizeGameSlug("guacharito")).toBe("el-guacharito-millonario");
    expect(normalizeGameSlug("guacharito-millonario")).toBe("el-guacharito-millonario");
    expect(normalizeGameSlug("el-guacharito-millonario")).toBe("el-guacharito-millonario");
    expect(normalizeGameSlug(undefined, "EL GUACHARITO MILLONARIO")).toBe(
      "el-guacharito-millonario",
    );

    expect(normalizeGameSlug("granjita")).toBe("la-granjita");
    expect(normalizeGameSlug("la-granjita")).toBe("la-granjita");
    expect(normalizeGameSlug(undefined, "LA GRANJITA")).toBe("la-granjita");

    expect(
      areSameCanonicalGame(
        { slug: "guacharo", name: "Guácharo Activo" },
        { slug: "guacharo-activo", name: "GUACHARO ACTIVO" },
      ),
    ).toBe(true);
    expect(
      areSameCanonicalGame(
        { slug: "guacharito", name: "El Guacharito Millonario" },
        { slug: "el-guacharito-millonario", name: "EL GUACHARITO MILLONARIO" },
      ),
    ).toBe(true);
  });

  it("resuelve proveedores del scraper usando el slug canónico sin fallar por alias", () => {
    expect(getResultsProviderForSlug("guacharo-activo")).toBeDefined();
    expect(getResultsProviderForSlug("guacharo")).toBeDefined();
    expect(getResultsProviderForSlug("el-guacharito-millonario")).toBeDefined();
    expect(getResultsProviderForSlug("guacharito")).toBeDefined();
    expect(getResultsProviderForSlug("la-granjita")).toBeDefined();
    expect(getResultsProviderForSlug("granjita")).toBeDefined();
    expect(getResultsProviderForSlug("lotto-activo")).toBeDefined();
    expect(getResultsProviderForSlug("monje-millonario")).toBeDefined();
    expect(getResultsProviderForSlug("selva-plus")).toBeDefined();
  });

  it("deduplica games[] prefiriendo los UUID reales de Supabase sobre los UUID locales legados", () => {
    const realGuacharoId = "90cf1adf-734f-4a17-9cee-dfd3c705e611";
    const realGuacharitoId = "d48546e4-1993-438a-a9de-64499762cce9";

    const games: Game[] = [
      {
        id: "01da9c54-392a-45e3-ab66-9a08befe7694",
        name: "Guácharo Activo",
        slug: "guacharo",
        color: "#00aa00",
        logo_url: null,
        display_order: 3,
        is_active: true,
        loading_mode: "automatic",
      },
      {
        id: realGuacharoId,
        name: "GUACHARO ACTIVO",
        slug: "guacharo-activo",
        color: "#00aa00",
        logo_url: null,
        display_order: 3,
        is_active: true,
        loading_mode: "automatic",
      },
      {
        id: "0519825d-e7ea-4e59-bf7d-cef2c832edd3",
        name: "El Guacharito Millonario",
        slug: "guacharito",
        color: "#ffaa00",
        logo_url: null,
        display_order: 5,
        is_active: true,
        loading_mode: "automatic",
      },
      {
        id: realGuacharitoId,
        name: "EL GUACHARITO MILLONARIO",
        slug: "el-guacharito-millonario",
        color: "#ffaa00",
        logo_url: null,
        display_order: 5,
        is_active: true,
        loading_mode: "automatic",
      },
    ];

    const { games: deduped, idRemap } = deduplicateGamesList(games);
    expect(deduped).toHaveLength(2);
    expect(deduped.find((g) => g.slug === "guacharo-activo")?.id).toBe(realGuacharoId);
    expect(deduped.find((g) => g.slug === "el-guacharito-millonario")?.id).toBe(realGuacharitoId);
    expect(idRemap.get("01da9c54-392a-45e3-ab66-9a08befe7694")).toBe(realGuacharoId);
    expect(idRemap.get("0519825d-e7ea-4e59-bf7d-cef2c832edd3")).toBe(realGuacharitoId);
  });
});

describe("Consolidación de juegos duplicados y resultados huérfanos en Supabase", () => {
  const OFFICIAL_LOTTO_ID = "11111111-1111-4111-8111-111111111101";
  const OFFICIAL_GUACHARO_ID = "11111111-1111-4111-8111-111111111102";
  const OFFICIAL_GUACHARITO_ID = "11111111-1111-4111-8111-111111111103";
  const OFFICIAL_MONJE_ID = "11111111-1111-4111-8111-111111111104";
  const OFFICIAL_GRANJITA_ID = "11111111-1111-4111-8111-111111111105";
  const OFFICIAL_SELVA_ID = "11111111-1111-4111-8111-111111111106";

  const ORPHAN_ID_A = "90cf1adf-734f-4a17-9cee-dfd3c705e611";
  const ORPHAN_ID_B = "d48546e4-1993-438a-a9de-64499762cce9";

  it("fusiona duplicados en games[], migra huérfanos a su game_id oficial, preserva resultados manuales y rellena game_slug", async () => {
    const client = makeInMemorySupabaseClient({
      games: [
        { id: OFFICIAL_LOTTO_ID, name: "LOTTO ACTIVO", slug: "lotto-activo", display_order: 1 },
        {
          id: OFFICIAL_GUACHARO_ID,
          name: "GUACHARO ACTIVO",
          slug: "guacharo-activo",
          display_order: 2,
        },
        // Fila duplicada con slug viejo "guacharo"
        {
          id: "01da9c54-392a-45e3-ab66-9a08befe7694",
          name: "Guácharo Activo",
          slug: "guacharo",
          display_order: 20,
        },
        {
          id: OFFICIAL_GUACHARITO_ID,
          name: "EL GUACHARITO MILLONARIO",
          slug: "el-guacharito-millonario",
          display_order: 3,
        },
        // Fila duplicada con slug viejo "guacharito"
        {
          id: "0519825d-e7ea-4e59-bf7d-cef2c832edd3",
          name: "El Guacharito Millonario",
          slug: "guacharito",
          display_order: 21,
        },
        {
          id: OFFICIAL_MONJE_ID,
          name: "MONJE MILLONARIO",
          slug: "monje-millonario",
          display_order: 4,
        },
        // Slug no canónico "granjita" que debe normalizarse a "la-granjita"
        { id: OFFICIAL_GRANJITA_ID, name: "LA GRANJITA", slug: "granjita", display_order: 5 },
        { id: OFFICIAL_SELVA_ID, name: "SELVA PLUS", slug: "selva-plus", display_order: 6 },
      ],
      results: [
        // Resultado manual oficial de Guácharo Activo a las 09:00 (DEBE preservarse)
        {
          id: "res-manual-guacharo-09",
          game_id: OFFICIAL_GUACHARO_ID,
          draw_date: "2026-11-20",
          draw_time: "09:00",
          animal_number: 12,
          animal_name: "Caballo",
          source: "manual",
        },
        // Resultado automático duplicado en la fila vieja "guacharo" a las 09:00 (conflicto -> eliminar, NO pisar el manual)
        {
          id: "res-dup-guacharo-09",
          game_id: "01da9c54-392a-45e3-ab66-9a08befe7694",
          draw_date: "2026-11-20",
          draw_time: "09:00",
          animal_number: 5,
          animal_name: "León",
          source: "automatic",
        },
        // Resultado automático de la fila vieja "guacharo" a las 10:00 (sin conflicto -> migrar al oficial)
        {
          id: "res-dup-guacharo-10",
          game_id: "01da9c54-392a-45e3-ab66-9a08befe7694",
          draw_date: "2026-11-20",
          draw_time: "10:00",
          animal_number: 75,
          animal_name: "Guácharo",
          source: "automatic",
        },
        // Huérfano con ID 90cf1adf-... con horario :05 único de MONJE MILLONARIO
        {
          id: "res-orphan-monje-0905",
          game_id: ORPHAN_ID_A,
          draw_date: "2026-11-20",
          draw_time: "09:05",
          animal_number: 18,
          animal_name: "Burro",
          source: "automatic",
        },
        // Huérfano con ID d48546e4-... con horario :15 único de SELVA PLUS
        {
          id: "res-orphan-selva-0915",
          game_id: ORPHAN_ID_B,
          draw_date: "2026-11-20",
          draw_time: "09:15",
          animal_number: 22,
          animal_name: "Camello",
          source: "automatic",
        },
        // Huérfano con UUID legado local de La Granjita
        {
          id: "res-orphan-granjita-legacy",
          game_id: "ca8a0400-0000-4000-8000-000000000006",
          draw_date: "2026-11-20",
          draw_time: "10:00",
          animal_number: 7,
          animal_name: "Perico",
          source: "automatic",
        },
      ],
    });

    const report = await consolidateGamesAndOrphanResultsInSupabase(client);

    expect(report.ok).toBe(true);
    expect(report.errors).toEqual([]);
    expect(report.deduplicatedGames).toHaveLength(2);
    expect(report.unresolvedOrphans).toEqual([]);

    // games[] debe tener exactamente 6 juegos únicos, todos con slug canónico
    expect(client.tables.games).toHaveLength(6);
    const slugs = client.tables.games.map((g) => g.slug);
    expect(slugs).toContain("guacharo-activo");
    expect(slugs).toContain("el-guacharito-millonario");
    expect(slugs).toContain("la-granjita");
    expect(slugs).not.toContain("guacharo");
    expect(slugs).not.toContain("guacharito");
    expect(slugs).not.toContain("granjita");

    // El resultado manual a las 09:00 de Guácharo Activo debe seguir intacto (Caballo, #12)
    const guacharo09 = client.tables.results.find(
      (r) => r.game_id === OFFICIAL_GUACHARO_ID && r.draw_time === "09:00",
    );
    expect(guacharo09?.animal_number).toBe(12);
    expect(guacharo09?.source).toBe("manual");
    expect(guacharo09?.game_slug).toBe("guacharo-activo");

    // El resultado 10:00 migró al game_id oficial de Guácharo Activo
    const guacharo10 = client.tables.results.find(
      (r) => r.game_id === OFFICIAL_GUACHARO_ID && r.draw_time === "10:00",
    );
    expect(guacharo10?.animal_number).toBe(75);
    expect(guacharo10?.game_slug).toBe("guacharo-activo");

    // Los huérfanos 90cf1adf-... y d48546e4-... migraron a Monje Millonario y Selva Plus
    const monje0905 = client.tables.results.find(
      (r) => r.game_id === OFFICIAL_MONJE_ID && r.draw_time === "09:05",
    );
    expect(monje0905?.animal_number).toBe(18);
    expect(monje0905?.game_slug).toBe("monje-millonario");

    const selva0915 = client.tables.results.find(
      (r) => r.game_id === OFFICIAL_SELVA_ID && r.draw_time === "09:15",
    );
    expect(selva0915?.animal_number).toBe(22);
    expect(selva0915?.game_slug).toBe("selva-plus");

    // El huérfano legado de La Granjita migró al game_id oficial de La Granjita
    const granjita10 = client.tables.results.find(
      (r) => r.game_id === OFFICIAL_GRANJITA_ID && r.draw_time === "10:00",
    );
    expect(granjita10?.animal_number).toBe(7);
    expect(granjita10?.game_slug).toBe("la-granjita");

    // Cero registros con game_id fuera de games[]
    const validIds = new Set(client.tables.games.map((g) => g.id));
    for (const r of client.tables.results) {
      expect(validIds.has(r.game_id)).toBe(true);
      expect(typeof r.game_slug).toBe("string");
    }
  });

  it("infiere correctamente huérfanos mediante solapamiento de sorteos y game_slug explícito", () => {
    const officialBySlug = new Map([
      ["lotto-activo", { id: OFFICIAL_LOTTO_ID, slug: "lotto-activo" }],
      ["guacharo-activo", { id: OFFICIAL_GUACHARO_ID, slug: "guacharo-activo" }],
    ]);

    const bySlug = inferCanonicalSlugForOrphanGroup(
      ORPHAN_ID_A,
      [
        {
          id: "1",
          game_id: ORPHAN_ID_A,
          game_slug: "guacharo",
          draw_date: "2026-11-20",
          draw_time: "09:00",
          animal_number: 10,
          animal_name: "Tigre",
        },
      ],
      officialBySlug,
    );
    expect(bySlug).toBe("guacharo-activo");

    const byOverlap = inferCanonicalSlugForOrphanGroup(
      ORPHAN_ID_B,
      [
        {
          id: "2",
          game_id: ORPHAN_ID_B,
          draw_date: "2026-11-20",
          draw_time: "09:00",
          animal_number: 25,
          animal_name: "Gallina",
        },
      ],
      officialBySlug,
      [
        {
          id: "official-1",
          game_id: OFFICIAL_LOTTO_ID,
          draw_date: "2026-11-20",
          draw_time: "09:00",
          animal_number: 25,
          animal_name: "Gallina",
        },
      ],
    );
    expect(byOverlap).toBe("lotto-activo");
  });
});

describe("Consolidación en memoria (consolidateInMemoryGamesAndResults)", () => {
  beforeEach(() => {
    mockStore.games = INITIAL_GAMES.map((g) => ({ ...g }));
    mockStore.results = [];
  });

  it("elimina duplicados en mockStore.games y remapea resultados huérfanos al game_id oficial con game_slug", () => {
    const officialGuacharoId = "90cf1adf-734f-4a17-9cee-dfd3c705e611";
    mockStore.games.push({
      id: officialGuacharoId,
      name: "GUACHARO ACTIVO",
      slug: "guacharo-activo",
      color: "#00aa00",
      logo_url: null,
      display_order: 3,
      is_active: true,
      loading_mode: "automatic",
    });

    mockStore.results.push({
      id: "r1",
      game_id: "01da9c54-392a-45e3-ab66-9a08befe7694",
      draw_date: "2026-11-20",
      draw_time: "11:00",
      animal_number: 75,
      animal_name: "Guácharo",
      source: "automatic",
    });

    consolidateInMemoryGamesAndResults();

    const guacharoGames = mockStore.games.filter(
      (g) => normalizeGameSlug(g.slug, g.name) === "guacharo-activo",
    );
    expect(guacharoGames).toHaveLength(1);
    expect(guacharoGames[0]!.id).toBe(officialGuacharoId);

    const res = mockStore.results.find((r) => r.id === "r1");
    expect(res?.game_id).toBe(officialGuacharoId);
    expect(res?.game_slug).toBe("guacharo-activo");
  });

  it("matchResultsForGame vincula resultados de LA GRANJITA por UUID oficial, UUID legado y game_slug priorizando manuales", () => {
    const officialGranjita: Game = {
      id: "88888888-1111-4111-8111-111111111105",
      name: "LA GRANJITA",
      slug: "la-granjita",
      color: "#16a34a",
      logo_url: null,
      display_order: 2,
      is_active: true,
      loading_mode: "automatic",
    };

    const matched = matchResultsForGame(
      officialGranjita,
      [
        // Exact UUID match at 09:00 (automatic)
        {
          id: "g-09-auto",
          game_id: officialGranjita.id,
          game_slug: "la-granjita",
          draw_date: "2026-11-20",
          draw_time: "09:00",
          animal_number: 5,
          animal_name: "León",
          source: "automatic",
        },
        // Legacy UUID match at 10:00 (no game_slug)
        {
          id: "g-10-legacy",
          game_id: "ca8a0400-0000-4000-8000-000000000006",
          draw_date: "2026-11-20",
          draw_time: "10:00",
          animal_number: 12,
          animal_name: "Caballo",
          source: "automatic",
        },
        // Slug alias match at 11:00 (manual override beats automatic)
        {
          id: "g-11-auto",
          game_id: officialGranjita.id,
          game_slug: "la-granjita",
          draw_date: "2026-11-20",
          draw_time: "11:00",
          animal_number: 20,
          animal_name: "Cochino",
          source: "automatic",
        },
        {
          id: "g-11-manual",
          game_id: "ca8a0400-0000-4000-8000-000000000006",
          game_slug: "granjita",
          draw_date: "2026-11-20",
          draw_time: "11:00",
          animal_number: 7,
          animal_name: "Perico",
          source: "manual",
        },
        // Unrelated game must NOT match
        {
          id: "lotto-09",
          game_id: "7d21a00b-0dfa-4bdc-9edf-8115802df1d6",
          game_slug: "lotto-activo",
          draw_date: "2026-11-20",
          draw_time: "09:00",
          animal_number: 1,
          animal_name: "Carnero",
          source: "automatic",
        },
      ],
      "2026-11-20",
    );

    expect(matched).toHaveLength(3);
    expect(matched.find((r) => r.draw_time === "09:00")?.animal_number).toBe(5);
    expect(matched.find((r) => r.draw_time === "10:00")?.animal_number).toBe(12);
    expect(matched.find((r) => r.draw_time === "11:00")?.animal_number).toBe(7);
    expect(matched.find((r) => r.draw_time === "11:00")?.source).toBe("manual");
  });
});
