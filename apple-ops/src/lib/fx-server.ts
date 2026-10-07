import { fetchVenta, fxFromQuote, isStale, type FxSource } from "./fx";
import { createServiceClient } from "./supabase/server";

type StoreFx = { id: string; fx_source: FxSource; fx_extra: number; fx_updated_at: string | null };

// Actualiza la cotización de los locales automáticos. Con force, aunque se haya consultado hace poco.
// Consulta cada fuente una sola vez. Devuelve cuántos locales se revisaron, cuántos cambiaron y en cuántos falló la consulta.
export async function refreshFx(opts: { storeId?: string; force?: boolean } = {}) {
  const db = createServiceClient();
  let q = db.from("stores").select("id, fx_source, fx_extra, fx_updated_at").neq("fx_source", "manual");
  if (opts.storeId) q = q.eq("id", opts.storeId);
  const { data } = await q;
  const stores = ((data ?? []) as StoreFx[]).filter((s) => opts.force || isStale(s.fx_updated_at));
  const quotes = new Map<string, Promise<number | null>>();
  let changed = 0;
  let failed = 0;
  for (const s of stores) {
    const src = s.fx_source as Exclude<FxSource, "manual">;
    if (!quotes.has(src)) quotes.set(src, fetchVenta(src));
    const venta = await quotes.get(src)!;
    if (venta === null) { failed++; continue; }
    const { data: did } = await db.rpc("aplicar_cotizacion", { p_store: s.id, p_fx: fxFromQuote(venta, Number(s.fx_extra)) });
    if (did) changed++;
  }
  return { checked: stores.length, changed, failed };
}

// Para llamar con after(): nunca rompe la página que la dispara.
export async function refreshFxQuietly(storeId: string) {
  try {
    await refreshFx({ storeId });
  } catch (e) {
    console.warn("cotización: no se pudo actualizar:", e instanceof Error ? e.message : e);
  }
}

// Igual que refreshFxQuietly, para el catálogo público, que solo conoce el link del local.
export async function refreshFxForSlug(slug: string) {
  try {
    const { data } = await createServiceClient().from("catalog_settings").select("store_id").eq("slug", slug).maybeSingle();
    if (data) await refreshFx({ storeId: data.store_id });
  } catch (e) {
    console.warn("cotización: no se pudo actualizar:", e instanceof Error ? e.message : e);
  }
}
