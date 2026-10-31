import { describe, expect, it } from "vitest";
import { createMockSupabaseClient, mockStore } from "@/lib/mock-db";

describe("Mock Supabase query builder", () => {
  const supabase = createMockSupabaseClient();

  it("supports .or() with PostgREST syntax for active ads", async () => {
    // Seed ads
    mockStore.ads = [
      {
        id: "ad-1",
        placement: "top",
        is_active: true,
        starts_at: null,
        ends_at: null,
        display_order: 1,
      },
      {
        id: "ad-2",
        placement: "top",
        is_active: true,
        starts_at: "2020-01-01T00:00:00Z",
        ends_at: "2020-01-02T00:00:00Z", // expired
        display_order: 2,
      },
    ];

    const now = "2026-10-28T12:00:00Z";
    const { data } = await supabase
      .from("ads")
      .select("*")
      .eq("is_active", true)
      .eq("placement", "top")
      .or(`starts_at.is.null,starts_at.lte.${now}`)
      .or(`ends_at.is.null,ends_at.gte.${now}`)
      .order("display_order", { ascending: true });

    expect(data).toHaveLength(1);
    expect((data as Array<{ id: string }>)[0]?.id).toBe("ad-1");
  });

  it("supports multiple chained .order() and .limit()", async () => {
    mockStore.results = [
      {
        id: "r1",
        game_id: "g1",
        draw_date: "2026-10-28",
        draw_time: "10:00:00",
        animal_number: 1,
        animal_name: "Carnero",
      },
      {
        id: "r2",
        game_id: "g1",
        draw_date: "2026-10-28",
        draw_time: "12:00:00",
        animal_number: 2,
        animal_name: "Toro",
      },
      {
        id: "r3",
        game_id: "g1",
        draw_date: "2026-10-27",
        draw_time: "14:00:00",
        animal_number: 3,
        animal_name: "Ciempiés",
      },
    ] as typeof mockStore.results;

    const { data } = await supabase
      .from("results")
      .select("*")
      .eq("game_id", "g1")
      .order("draw_date", { ascending: false })
      .order("draw_time", { ascending: false })
      .limit(2);

    expect(data).toHaveLength(2);
    const results = data as Array<{ id: string }>;
    expect(results[0]?.id).toBe("r2");
    expect(results[1]?.id).toBe("r1");
  });

  it("supports .gte() and .lte() date range queries", async () => {
    const { data } = await supabase
      .from("results")
      .select("*")
      .gte("draw_date", "2026-10-28")
      .lte("draw_date", "2026-10-28");

    expect(data).toHaveLength(2);
  });

  it("includes Monje Millonario 77-animal catalog and supports sync_automatic_result for high animal numbers", async () => {
    const monjeGame = mockStore.games.find((g) => g.slug === "monje-millonario");
    expect(monjeGame).toBeDefined();

    const { data: entries } = await supabase
      .from("animal_entries")
      .select("*")
      .eq("game_id", monjeGame!.id);

    const entriesArr = (entries ?? []) as Array<{ number: number; name: string }>;
    expect(entriesArr.length).toBeGreaterThanOrEqual(76);
    expect(entriesArr.some((e) => e.number === 54 && e.name.toLowerCase() === "grillo")).toBe(true);
    expect(
      entriesArr.some(
        (e) =>
          e.number === 73 &&
          e.name.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().includes("hipopotam"),
      ),
    ).toBe(true);

    const { data: rpcRes } = await supabase.rpc("sync_automatic_result", {
      p_game_id: monjeGame!.id,
      p_draw_date: "2026-10-30",
      p_draw_time: "08:05:00",
      p_animal_number: 54,
      p_animal_name: "Grillo",
    });
    expect(rpcRes).toBe(true);

    const { data: resultData } = await supabase
      .from("results")
      .select("*")
      .eq("game_id", monjeGame!.id)
      .eq("draw_date", "2026-10-30")
      .eq("draw_time", "08:05:00");

    expect(resultData).toHaveLength(1);
    expect((resultData as Array<{ animal_number: number }>)[0]?.animal_number).toBe(54);
  });
});
