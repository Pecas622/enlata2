import { MEDIA_BUCKET, MEDIA_COLS, type MediaRow } from "./media";
import { createClient } from "./supabase/server";

export type MediaItem = MediaRow & { url: string | null };

// Archivos de una marca (o de una pieza) con un link firmado por una hora: el bucket es privado.
export async function listMedia(filter: { brandId: string; contentId?: string }): Promise<MediaItem[]> {
  const supabase = await createClient();
  let q = supabase.from("media_files").select(MEDIA_COLS).eq("brand_id", filter.brandId).order("created_at", { ascending: false }).limit(60);
  if (filter.contentId) q = q.eq("content_id", filter.contentId);
  const { data } = await q;
  const rows = (data ?? []) as MediaRow[];
  if (!rows.length) return [];
  const { data: signed } = await supabase.storage.from(MEDIA_BUCKET).createSignedUrls(rows.map((r) => r.path), 3600);
  const urls = new Map((signed ?? []).map((s) => [s.path, s.signedUrl]));
  return rows.map((r) => ({ ...r, url: urls.get(r.path) ?? null }));
}
