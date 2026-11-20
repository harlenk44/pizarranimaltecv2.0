/**
 * Script de migración y consolidación de juegos duplicados y resultados huérfanos en Supabase.
 *
 * Uso:
 *   SUPABASE_URL="https://xxx.supabase.co" SUPABASE_KEY="tu-key" npx tsx scripts/consolidate-orphan-results.ts
 *   (Agrega --dry-run para previsualizar cambios sin escribir en Supabase)
 */
import {
  createRealSupabaseAdminClient,
  getSupabaseCloudDiagnostics,
} from "../src/integrations/supabase/client.server";
import { consolidateGamesAndOrphanResultsInSupabase } from "../src/lib/consolidate-games-results.server";

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const dateArg = process.argv.find((a) => a.startsWith("--date="))?.split("=")[1];

  const diag = getSupabaseCloudDiagnostics();
  if (!diag.configured) {
    console.error("[consolidate] Supabase no está configurado:", diag.reason);
    process.exit(1);
  }

  const client = createRealSupabaseAdminClient();
  if (!client) {
    console.error("[consolidate] No se pudo inicializar el cliente de Supabase.");
    process.exit(1);
  }

  console.log(
    `[consolidate] Conectado a ${diag.url} (${dryRun ? "MODO SIMULACIÓN --dry-run" : "MODO EJECUCIÓN"})${dateArg ? ` | Fecha: ${dateArg}` : ""}`,
  );

  const report = await consolidateGamesAndOrphanResultsInSupabase(client, {
    dryRun,
    onlyDate: dateArg,
  });

  console.log(JSON.stringify(report, null, 2));

  if (!report.ok) {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error("[consolidate] Error fatal:", err);
  process.exit(1);
});
