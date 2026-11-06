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
import { resolveCanonicalAnimal, parseCanonicalAnimalNumber } from "@/lib/official-animals";

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

  it("strictly distinguishes 0 (Delfín) from 00 (Ballena) across all lotteries", () => {
    const lotto0 = resolveCanonicalAnimal("lotto-activo", "0", "DELFIN");
    const lotto00 = resolveCanonicalAnimal("lotto-activo", "00", "BALLENA");
    expect(lotto0.label).toBe("0");
    expect(lotto0.name).toBe("Delfín");
    expect(lotto0.number).toBe(0);
    expect(lotto00.label).toBe("00");
    expect(lotto00.name).toBe("Ballena");
    expect(lotto00.number).toBe(37);
    expect(lotto0.imageUrl).not.toBe(lotto00.imageUrl);

    const pantera00 = resolveCanonicalAnimal("lottopantera", "00", "BALLENA");
    const pantera37 = resolveCanonicalAnimal("lottopantera", "37", "CHIGÜIRE");
    expect(pantera00.label).toBe("00");
    expect(pantera00.name).toBe("Ballena");
    expect(pantera00.number).toBe(49);
    expect(pantera37.label).toBe("37");
    expect(pantera37.name).toBe("Chigüire");
    expect(pantera37.number).toBe(37);

    const guacharo00 = resolveCanonicalAnimal("guacharo", "00", "BALLENA");
    expect(guacharo00.label).toBe("00");
    expect(guacharo00.name).toBe("Ballena");
    expect(guacharo00.number).toBe(76);

    const guacharito00 = resolveCanonicalAnimal("guacharito", "00", "BALLENA");
    expect(guacharito00.label).toBe("00");
    expect(guacharito00.name).toBe("Ballena");
    expect(guacharito00.number).toBe(100);
    expect(parseCanonicalAnimalNumber("guacharito", "00")).toBe(100);
  });

  it("prioritizes custom admin images first and then deterministic fixed catalog images per lottery", () => {
    const defaultImg = resolveCanonicalAnimal("granjita", 12, "Caballo");
    expect(defaultImg.name).toBe("Caballo");
    expect(defaultImg.label).toBe("12");
    expect(defaultImg.imageUrl).toBe("https://tuazar.com/in/animalitos/la_granjita/12.png");

    const customMap = { "granjita:12": "/custom/caballo.png" };
    const customImg = resolveCanonicalAnimal("granjita", 12, "Caballo", customMap);
    expect(customImg.imageUrl).toBe("/custom/caballo.png");
  });
});
