import { createFileRoute } from "@tanstack/react-router";
import {
  getCachedMultiloteriasItems,
  type MultiloteriasItem,
} from "@/lib/multiloterias-provider.server";

export const Route = createFileRoute("/api/public/multiloterias/items")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const game = url.searchParams.get("game");
        const gameSlug =
          game === "lotoanimalito" || game === "lottopantera" ? game : "lottopantera";

        try {
          const items: MultiloteriasItem[] = await getCachedMultiloteriasItems(gameSlug);
          return Response.json({
            success: true,
            game: gameSlug,
            data: items,
          });
        } catch (err) {
          return Response.json(
            {
              success: false,
              game: gameSlug,
              error: err instanceof Error ? err.message : String(err),
              data: [],
            },
            { status: 500 },
          );
        }
      },
    },
  },
});
