import { describe, expect, it } from "vitest";
import { createMockSupabaseClient } from "@/lib/mock-db";

describe("Animal image storage and persistence", () => {
  const supabase = createMockSupabaseClient();

  it("uploads an image and generates a valid signed URL", async () => {
    const testDataUrl =
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
    const testPath = "game-1/animal-5.png";

    const { error: uploadError } = await supabase.storage
      .from("animal-images")
      .upload(testPath, testDataUrl);

    expect(uploadError).toBeNull();

    const { data, error: urlError } = await supabase.storage
      .from("animal-images")
      .createSignedUrl(testPath);

    expect(urlError).toBeNull();
    expect(data?.signedUrl).toBe(testDataUrl);
    const { data: pubData } = supabase.storage.from("animal-images").getPublicUrl(testPath);
    expect(pubData?.publicUrl).toBe(testDataUrl);
  });

  it("persists per-product animal_images rows via upsert on game_id and animal_number", async () => {
    const gameId = "7d21a00b-0dfa-4bdc-9edf-8115802df1d6";
    const customUrl = "https://example.supabase.co/storage/v1/object/public/animal-images/animals/lotto/12.png";

    const { error: upsertErr } = await supabase.from("animal_images").upsert(
      {
        game_id: gameId,
        animal_number: 12,
        image_url: customUrl,
      },
      { onConflict: "game_id,animal_number" },
    );
    expect(upsertErr).toBeNull();

    const { data: fetched } = await supabase
      .from("animal_images")
      .select("image_url")
      .eq("game_id", gameId)
      .eq("animal_number", 12)
      .maybeSingle();

    expect(fetched?.image_url).toBe(customUrl);
  });

  it("removes an uploaded image with .remove()", async () => {
    const testPath = "game-1/animal-99.png";
    await supabase.storage.from("animal-images").upload(testPath, "data:image/png;base64,test");

    const { error } = await supabase.storage.from("animal-images").remove([testPath]);

    expect(error).toBeNull();
  });
});
