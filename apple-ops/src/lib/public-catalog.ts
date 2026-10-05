import type { SupabaseClient } from "@supabase/supabase-js";
import type { AppraisalConfig } from "./appraise";
import type { PublicValue } from "./quote";

// Solo lee las vistas públicas: nunca costos, IMEI, clientes ni márgenes.
export type PublicConfig = {
  slug: string; store_name: string; address: string; whatsapp: string; phone: string; headline: string; tagline: string;
  fx: number; warranty_new_days: number; warranty_used_days: number;
  assistant_on: boolean; assistant_name: string; greeting: string;
};
export type PublicDevice = {
  id: string; kind: string; model: string; capacity: number; color: string; condition: string; battery: number | null;
  price_usd: number; warranty_days: number; featured: boolean; entry_date: string;
};
export type PublicAccessory = { id: string; name: string; category: string; price_ars: number };

export type PublicCatalog =
  | { state: "missing" }
  | { state: "paused"; storeName: string }
  | { state: "ok"; cfg: PublicConfig; devices: PublicDevice[]; accessories: PublicAccessory[] };

export async function loadPublicConfig(supabase: SupabaseClient, slug: string) {
  const { data } = await supabase.from("catalogo_config_publica").select("slug, store_name, address, whatsapp, phone, headline, tagline, fx, warranty_new_days, warranty_used_days, assistant_on, assistant_name, greeting").eq("slug", slug).maybeSingle();
  if (!data) return null;
  return { ...data, fx: Number(data.fx) } as PublicConfig;
}

export async function loadPublicCatalog(supabase: SupabaseClient, slug: string): Promise<PublicCatalog> {
  const cfg = await loadPublicConfig(supabase, slug);
  if (!cfg) {
    const { data } = await supabase.from("catalogo_estado").select("store_name").eq("slug", slug).maybeSingle();
    return data ? { state: "paused", storeName: data.store_name } : { state: "missing" };
  }
  const [{ data: devs }, { data: accs }] = await Promise.all([
    supabase.from("catalogo_publico").select("id, kind, model, capacity, color, condition, battery, price_usd, warranty_days, featured, entry_date").eq("slug", slug),
    supabase.from("accesorios_publicos").select("id, name, category, price_ars").eq("slug", slug).order("category").order("name"),
  ]);
  return {
    state: "ok",
    cfg,
    devices: (devs ?? []).map((d) => ({ ...d, price_usd: Number(d.price_usd) })) as PublicDevice[],
    accessories: (accs ?? []).map((a) => ({ ...a, price_ars: Number(a.price_ars) })) as PublicAccessory[],
  };
}

export async function loadPublicValues(supabase: SupabaseClient, slug: string): Promise<PublicValue[]> {
  const { data } = await supabase.from("tasacion_publica").select("model, capacity, value_usd, mult_usado_a").eq("slug", slug);
  return (data ?? []).map((v) => ({ ...v, value_usd: Number(v.value_usd), mult_usado_a: Number(v.mult_usado_a) }));
}

// Tabla de tasación del local para el canje por chat (estado y fallas incluidos).
export async function loadPublicAppraisal(supabase: SupabaseClient, slug: string): Promise<AppraisalConfig> {
  const { data } = await supabase.from("tasacion_publica").select("model, capacity, value_usd, mult_por_estado, descuentos_por_falla").eq("slug", slug);
  const rows = data ?? [];
  const nums = (o: unknown) => Object.fromEntries(Object.entries((o ?? {}) as Record<string, unknown>).map(([k, v]) => [k, Number(v) || 0]));
  return {
    baseValues: rows.map((r) => ({ model: r.model, capacity: Number(r.capacity), value: Number(r.value_usd) })),
    condMult: nums(rows[0]?.mult_por_estado),
    defectCosts: nums(rows[0]?.descuentos_por_falla),
    targetMargin: 0,
  };
}

// Link de WhatsApp que pasa por el servidor para contar la consulta en el panel.
export function waHref(slug: string, text: string, item?: string, label?: string) {
  const q = new URLSearchParams({ t: text });
  if (item) q.set("i", item);
  if (label) q.set("l", label);
  return `/catalogo/${slug}/wa?${q}`;
}

export const waNumber = (cfg: Pick<PublicConfig, "whatsapp" | "phone">) => (cfg.whatsapp || cfg.phone || "").replace(/[^\d]/g, "");
