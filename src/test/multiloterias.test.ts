import { describe, it, expect } from "vitest";
import {
  formatMultiloteriasDrawTime,
  MULTILOTERIAS_GAMES_INFO,
} from "@/lib/multiloterias-provider.server";
import {
  getMasterAnimalProducts,
  getMasterTripleProducts,
  chunkProducts,
} from "@/lib/master-products";
import { getEmojiForNumber } from "@/lib/animals";

describe("Multiloterias Integration and Catalog", () => {
  it("converts 24h draw times from HH:mm to HH:mm:00", () => {
    expect(formatMultiloteriasDrawTime("08:00")).toBe("08:00:00");
    expect(formatMultiloteriasDrawTime("13:00")).toBe("13:00:00");
    expect(formatMultiloteriasDrawTime("19:00")).toBe("19:00:00");
  });

  it("defines correct UUIDs and metadata for the 4 Multiloterias games", () => {
    expect(MULTILOTERIAS_GAMES_INFO.lotoanimalito.uuid).toBe(
      "d953f80c-4335-4bc9-9f78-9b56193286fe",
    );
    expect(MULTILOTERIAS_GAMES_INFO.lottopantera.uuid).toBe("61580ccf-5a2d-4d10-877e-4883515135e4");
    expect(MULTILOTERIAS_GAMES_INFO["triple-pantera"].uuid).toBe(
      "69efc4d7-52cb-41a6-951d-be299590f393",
    );
    expect(MULTILOTERIAS_GAMES_INFO["terminal-pantera"].uuid).toBe(
      "741ef8e9-129b-446b-abad-d00f68323f1c",
    );
  });

  it("includes Triple Ricachona in Triples products catalog", () => {
    const tripleProducts = getMasterTripleProducts();
    const ricachona = tripleProducts.find((p) => p.slug === "triple-ricachona");

    expect(ricachona).toBeDefined();
    expect(ricachona?.name).toBe("Triple Ricachona");
    expect(ricachona?.category).toBe("triples");
    expect(ricachona?.color).toBe("#eab308");
  });

  it("automatically creates 8-card chunks for Animalitos and Triples", () => {
    const animalProducts = getMasterAnimalProducts();
    expect(animalProducts.length).toBeGreaterThanOrEqual(8);
    const animalPages = chunkProducts(animalProducts, 8);
    expect(animalPages.length).toBeGreaterThanOrEqual(1);
    expect(animalPages[0]?.length).toBeLessThanOrEqual(8);

    const tripleProducts = getMasterTripleProducts();
    expect(tripleProducts.length).toBeGreaterThanOrEqual(8);
    const triplePages = chunkProducts(tripleProducts, 8);
    expect(triplePages.length).toBeGreaterThanOrEqual(1);
    expect(triplePages[0]?.length).toBeLessThanOrEqual(8);
  });

  it("resolves emojis for special animals by name", () => {
    expect(getEmojiForNumber(37, "CHIGÜIRE")).toBe("🦫");
    expect(getEmojiForNumber(38, "TURPIAL")).toBe("🐤");
    expect(getEmojiForNumber(39, "ARAÑA")).toBe("🕷️");
    expect(getEmojiForNumber(40, "PANTERA")).toBe("🐆");
    expect(getEmojiForNumber(41, "CONEJO")).toBe("🐰");
    expect(getEmojiForNumber(43, "TORTUGA")).toBe("🐢");
    expect(getEmojiForNumber(48, "TUCÁN")).toBe("🦜");
  });
});
