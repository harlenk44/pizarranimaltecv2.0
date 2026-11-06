import { describe, it, expect } from "vitest";
import {
  MASTER_PRODUCTS_CATALOG,
  getMasterAnimalProducts,
  getMasterTripleProducts,
  chunkProducts,
} from "@/lib/master-products";

describe("master-products catalog and pagination", () => {
  it("contains valid animalito and triple products", () => {
    const animals = getMasterAnimalProducts();
    const triples = getMasterTripleProducts();

    expect(animals.length).toBeGreaterThanOrEqual(8);
    expect(triples.length).toBeGreaterThanOrEqual(8);

    // Each product must have required metadata
    for (const p of MASTER_PRODUCTS_CATALOG) {
      expect(p.id).toBeTruthy();
      expect(p.name).toBeTruthy();
      expect(p.slug).toBeTruthy();
      expect(p.logo_url).toBeTruthy();
      expect(["animalitos", "triples"]).toContain(p.category);
      expect(p.schedule_times.length).toBeGreaterThan(0);
    }
  });

  it("chunks items into pages of maximum 8 items", () => {
    const list10 = Array.from({ length: 10 }, (_, i) => `item-${i + 1}`);
    const chunks = chunkProducts(list10, 8);

    expect(chunks.length).toBe(2);
    expect(chunks[0]?.length).toBe(8); // Page 1: 8 items
    expect(chunks[1]?.length).toBe(2); // Page 2: remaining 2 items
  });

  it("handles exactly 8 items without creating unnecessary pages", () => {
    const list8 = Array.from({ length: 8 }, (_, i) => `item-${i + 1}`);
    const chunks = chunkProducts(list8, 8);

    expect(chunks.length).toBe(1);
    expect(chunks[0]?.length).toBe(8);
  });

  it("handles 9 items by creating a second page with 1 item", () => {
    const list9 = Array.from({ length: 9 }, (_, i) => `item-${i + 1}`);
    const chunks = chunkProducts(list9, 8);

    expect(chunks.length).toBe(2);
    expect(chunks[0]?.length).toBe(8);
    expect(chunks[1]?.length).toBe(1);
  });

  it("returns empty array when input is empty", () => {
    expect(chunkProducts([])).toEqual([]);
  });
});
