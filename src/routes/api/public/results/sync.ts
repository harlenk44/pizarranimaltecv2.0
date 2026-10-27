import { createFileRoute } from "@tanstack/react-router";
import { mockStore } from "@/lib/mock-db";

export const Route = createFileRoute("/api/public/results/sync")({
  server: {
    handlers: {
      GET: async () => {
        if (mockStore.results.length === 0) {
          try {
            const { synchronizeAutomaticResults } = await import("@/lib/result-sync.server");
            await synchronizeAutomaticResults();
          } catch (err) {
            console.warn("[sync-get-warn]", err);
          }
        }
        return Response.json({
          status: "ok",
          results: mockStore.results,
        });
      },
      POST: async ({ request }) => {
        if (process.env["SUPABASE_URL"]) {
          const { authenticateCronRequest } = await import("@/integrations/supabase/cron-auth");
          const authFailure = await authenticateCronRequest(request);
          if (authFailure) return authFailure;
        }
        try {
          const { synchronizeAutomaticResults } = await import("@/lib/result-sync.server");
          const reports = await synchronizeAutomaticResults();
          return Response.json({ reports, results: mockStore.results });
        } catch (err) {
          console.error("[sync-error]", err);
          return Response.json(
            {
              error: "No se pudo sincronizar",
              details: err instanceof Error ? err.message : String(err),
            },
            { status: 500 },
          );
        }
      },
    },
  },
});
