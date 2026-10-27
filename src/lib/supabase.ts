import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase as cloudClient } from "@/integrations/supabase/client";

// Untyped view of the Lovable Cloud client so the ported screens keep their own row types.
export const supabase = cloudClient as unknown as SupabaseClient;

// Buckets are private: return a long-lived signed link for signed-in viewers.
export async function getMediaUrl(bucket: string, path: string): Promise<string> {
  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrl(path, 60 * 60 * 24 * 365 * 10);
  if (error || !data) throw error ?? new Error("No se pudo obtener la URL");
  return data.signedUrl;
}
