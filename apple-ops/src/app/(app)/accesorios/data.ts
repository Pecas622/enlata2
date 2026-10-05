import type { SupabaseClient } from "@supabase/supabase-js";
import type { AccRow } from "./AccTable";

type Raw = Omit<AccRow, "cost_ars"> & { supplier?: string; accessory_costs?: { cost_ars: number } | null };

// Accesorios del local; el costo solo viene para quien lo puede ver (la base igual lo filtra).
export async function loadAccessories(supabase: SupabaseClient, seeCost: boolean, id?: string) {
  const cols = "id, sku, name, category, price_ars, stock, min_stock, supplier" + (seeCost ? ", accessory_costs(cost_ars)" : "");
  let query = supabase.from("accessories").select(cols).order("name");
  if (id) query = query.eq("id", id);
  const { data } = await query;
  return ((data ?? []) as unknown as Raw[]).map((a) => ({
    ...a,
    supplier: a.supplier ?? "",
    price_ars: Number(a.price_ars),
    cost_ars: a.accessory_costs ? Number(a.accessory_costs.cost_ars) : null,
  }));
}
