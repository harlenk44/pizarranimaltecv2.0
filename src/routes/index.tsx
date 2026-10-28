import { createFileRoute, ClientOnly } from "@tanstack/react-router";
import LotteryApp from "@/components/LotteryApp";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "pizarraianimaltec - Resultados de Lotería en Vivo" },
      {
        name: "description",
        content:
          "Resultados diarios y semanales de loterías de animalitos en pizarra en vivo - pizarraianimaltec.",
      },
      { property: "og:title", content: "pizarraianimaltec - Resultados de Lotería en Vivo" },
      {
        property: "og:description",
        content:
          "Resultados diarios y semanales de loterías de animalitos en pizarra en vivo - pizarraianimaltec.",
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
      <LotteryApp />
    </ClientOnly>
  );
}
