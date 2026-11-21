import { QueryClient } from "@tanstack/react-query";
import { createRouter, rootRouteId } from "@tanstack/react-router";
import { render, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { routeTree } from "@/routeTree.gen";
import LotteryApp from "@/components/LotteryApp";

// Match routes without running loaders or rendering: loaders may need a server or
// network the test run lacks, and jsdom never loads the stylesheets React waits on.
describe("App routing", () => {
  it("matches a page for / instead of falling back to not found", () => {
    const router = createRouter({ routeTree, context: { queryClient: new QueryClient() } });

    const matches = router.matchRoutes("/");

    expect(matches.at(-1)?.routeId).not.toBe(rootRouteId);
  });

  it("mounts LotteryApp without crashing or staying stuck on a blank screen", async () => {
    const origFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (url.includes("/api/public/results/sync")) {
        return new Response(
          JSON.stringify({
            status: "ok",
            games: [],
            results: [],
            requireLicense: false,
            clientLicenses: [],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      return new Response(JSON.stringify({ status: "ok", triples: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }) as typeof fetch;

    try {
      const { container } = render(<LotteryApp />);
      await waitFor(
        () => {
          expect(container.textContent?.trim().length).toBeGreaterThan(20);
        },
        { timeout: 4000 },
      );
    } finally {
      globalThis.fetch = origFetch;
    }
  });
});
