import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase as cloudClient } from "@/integrations/supabase/client";

// Untyped view of the Lovable Cloud client so the ported screens keep their own row types.
export const supabase = cloudClient as unknown as SupabaseClient;

// Prefer permanent public URLs for public buckets (animal-images), falling back to long-lived signed URLs.
export async function getMediaUrl(bucket: string, path: string): Promise<string> {
  try {
    const { data: pubData } = supabase.storage.from(bucket).getPublicUrl(path);
    if (
      pubData?.publicUrl &&
      (pubData.publicUrl.startsWith("http") || pubData.publicUrl.startsWith("data:"))
    ) {
      return pubData.publicUrl;
    }
  } catch {
    // fallback to signed url
  }

  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrl(path, 60 * 60 * 24 * 365 * 10);
  if (error || !data) throw error ?? new Error("No se pudo obtener la URL");
  return data.signedUrl;
}
