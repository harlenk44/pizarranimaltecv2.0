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
  });

  it("removes an uploaded image with .remove()", async () => {
    const testPath = "game-1/animal-99.png";
    await supabase.storage.from("animal-images").upload(testPath, "data:image/png;base64,test");

    const { error } = await supabase.storage.from("animal-images").remove([testPath]);

    expect(error).toBeNull();
  });
});
