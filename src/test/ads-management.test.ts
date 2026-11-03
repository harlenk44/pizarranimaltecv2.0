import { describe, expect, it, beforeEach } from "vitest";
import { createMockSupabaseClient, mockStore } from "@/lib/mock-db";
import {
  deleteAdFromStore,
  fetchAdsStore,
  saveLocalAdsStore,
  type AdsStoreState,
  DEFAULT_AD_TICKER,
} from "@/lib/ads-service";
import type { Ad } from "@/lib/types";

describe("Ads deletion and persistent synchronization", () => {
  const supabase = createMockSupabaseClient();

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    mockStore.ads = [];
  });

  it("deletes ad directly and permanently from Supabase with .delete().eq('id', ...)", async () => {
    const sampleAd: Ad = {
      id: "ad-delete-test-1",
      title: "Banner Promocional 1",
      image_url: "https://example.com/banner1.png",
      placement: "top",
      is_active: true,
      display_order: 1,
      media_type: "image",
      link_url: null,
      starts_at: null,
      ends_at: null,
      created_at: new Date().toISOString(),
    };

    // Insert ad into Supabase
    await supabase.from("ads").insert(sampleAd);

    const { data: before } = await supabase.from("ads").select("*").eq("id", sampleAd.id);
    expect(before).toHaveLength(1);

    // Delete ad using .delete().eq('id', ...)
    const { error: delErr } = await supabase.from("ads").delete().eq("id", sampleAd.id);
    expect(delErr).toBeNull();

    const { data: after } = await supabase.from("ads").select("*").eq("id", sampleAd.id);
    expect(after).toHaveLength(0);
  });

  it("cleans localStorage immediately when deleteAdFromStore is called", async () => {
    const ad1: Ad = {
      id: "ad-item-1",
      title: "Banner 1",
      image_url: "https://example.com/ad1.png",
      placement: "top",
      is_active: true,
      display_order: 1,
      media_type: "image",
      link_url: null,
      starts_at: null,
      ends_at: null,
      created_at: new Date().toISOString(),
    };
    const ad2: Ad = {
      id: "ad-item-2",
      title: "Banner 2",
      image_url: "https://example.com/ad2.png",
      placement: "bottom",
      is_active: true,
      display_order: 2,
      media_type: "image",
      link_url: null,
      starts_at: null,
      ends_at: null,
      created_at: new Date().toISOString(),
    };

    saveLocalAdsStore({ ads: [ad1, ad2] });
    await supabase.from("ads").insert([ad1, ad2]);

    const stateAfterDelete = await deleteAdFromStore(ad1);

    expect(stateAfterDelete.ads).toHaveLength(1);
    expect(stateAfterDelete.ads[0]?.id).toBe("ad-item-2");

    // LocalStorage must only contain ad2
    const stored = JSON.parse(localStorage.getItem("pizarra_persisted_ads_v1") || "[]");
    expect(stored).toHaveLength(1);
    expect(stored[0]?.id).toBe("ad-item-2");

    // Obsolete keys must be removed
    expect(localStorage.getItem("pizarra_persisted_ads")).toBeNull();
    expect(localStorage.getItem("pizarra_ads")).toBeNull();
  });

  it("does NOT auto-fill or resurrect deleted ads when ads list is empty", async () => {
    const ad: Ad = {
      id: "ad-will-be-deleted",
      title: "Banner Temporal",
      image_url: "https://example.com/banner.png",
      placement: "top",
      is_active: true,
      display_order: 1,
      media_type: "image",
      link_url: null,
      starts_at: null,
      ends_at: null,
      created_at: new Date().toISOString(),
    };

    saveLocalAdsStore({ ads: [ad] });
    await supabase.from("ads").insert(ad);

    // Delete the only ad
    await deleteAdFromStore(ad);

    // Now reload / fetch ads store
    const store = await fetchAdsStore();

    // Must be completely empty: never resurrect or inject fallback ads!
    expect(store.ads).toHaveLength(0);
  });
});
