import { z } from "zod";

export type LoadingMode = "manual" | "automatic";
export const manualResultSource = "manual" as const;

export const automaticDrawSchema = z.object({
  draw_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .refine((value) => {
      const date = new Date(`${value}T00:00:00Z`);
      return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
    }, "Fecha inválida"),
  draw_time: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d:00$/),
  animal_number: z.number().int().nonnegative(),
  animal_name: z.string().trim().min(1).max(120),
});
export type AutomaticDraw = z.infer<typeof automaticDrawSchema>;
export interface SyncGame {
  id: string;
  slug: string;
  loading_mode: LoadingMode;
  is_active: boolean;
}
export interface ResultsProvider {
  fetchResults: (game: SyncGame) => Promise<unknown[]>;
}
export interface SyncReport {
  game_id: string;
  status: "skipped" | "pending_configuration" | "synced" | "error";
  written: number;
  preserved: number;
}

// Providers supply normalized draws. The database enforces mode and manual protection atomically.
export async function synchronizeGame(
  game: SyncGame,
  provider: ResultsProvider | undefined,
  write: (draw: AutomaticDraw) => Promise<boolean>,
): Promise<SyncReport> {
  const report: SyncReport = { game_id: game.id, status: "skipped", written: 0, preserved: 0 };
  if (!game.is_active || game.loading_mode !== "automatic") return report;
  if (!provider) return { ...report, status: "pending_configuration" };
  const draws = z
    .array(automaticDrawSchema)
    .max(500)
    .parse(await provider.fetchResults(game));
  for (const draw of draws) {
    if (await write(draw)) report.written += 1;
    else report.preserved += 1;
  }
  return { ...report, status: "synced" };
}
