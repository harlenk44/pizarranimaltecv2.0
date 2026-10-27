import { synchronizeGame, type ResultsProvider, type SyncReport } from "@/lib/result-sync";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { createTuazarProvider, TUAZAR_GAME_NAMES } from "@/lib/tuazar-provider.server";

// Trusted, fixed-origin adapters by game slug. Games without an entry stay "pending_configuration".
// No user-supplied URLs or placeholder results are used.
const providers: Readonly<Record<string, ResultsProvider>> = Object.fromEntries(
  Object.entries(TUAZAR_GAME_NAMES).map(([slug, name]) => [slug, createTuazarProvider(name)]),
);

export async function synchronizeAutomaticResults(): Promise<SyncReport[]> {
  const { data: games, error } = await supabaseAdmin
    .from("games")
    .select("id, slug, loading_mode, is_active")
    .eq("loading_mode", "automatic")
    .eq("is_active", true);
  if (error) throw error;
  const reports: SyncReport[] = [];
  for (const game of games ?? []) {
    try {
      const report = await synchronizeGame(
        { ...game, loading_mode: "automatic" },
        providers[game.slug],
        async (draw) => {
          const { data, error: writeError } = await supabaseAdmin.rpc("sync_automatic_result", {
            p_game_id: game.id,
            p_draw_date: draw.draw_date,
            p_draw_time: draw.draw_time,
            p_animal_number: draw.animal_number,
            p_animal_name: draw.animal_name,
          });
          if (writeError) throw writeError;
          return data === true;
        },
      );
      reports.push(report);
    } catch {
      reports.push({ game_id: game.id, status: "error", written: 0, preserved: 0 });
    }
  }
  return reports;
}
