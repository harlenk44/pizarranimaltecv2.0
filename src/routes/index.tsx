import { createFileRoute, ClientOnly } from "@tanstack/react-router";
import { lazy, Suspense } from "react";

const LotteryApp = lazy(() => import("@/components/LotteryApp"));

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Pizarra de Animalitos - Resultados de Lotería" },
      {
        name: "description",
        content: "Resultados diarios y semanales de loterías de animalitos en una pizarra en vivo.",
      },
      { property: "og:title", content: "Pizarra de Animalitos - Resultados de Lotería" },
      {
        property: "og:description",
        content: "Resultados diarios y semanales de loterías de animalitos en una pizarra en vivo.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

function Loading() {
  return <div className="min-h-screen bg-slate-950" suppressHydrationWarning />;
}

function Index() {
  return (
    <ClientOnly fallback={<Loading />}>
      <Suspense fallback={<Loading />}>
        <LotteryApp />
      </Suspense>
    </ClientOnly>
  );
}
