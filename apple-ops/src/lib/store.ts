import type { SupabaseClient } from "@supabase/supabase-js";
import type { AppraisalConfig } from "./appraise";

export type StoreConfig = AppraisalConfig & {
  id: string;
  name: string;
  cuit: string;
  address: string;
  phone: string;
  fx: number;
  maxDiscountSeller: number;
  warrantyNewDays: number;
  warrantyUsedDays: number;
};

export async function loadStoreConfig(supabase: SupabaseClient): Promise<StoreConfig> {
  const [{ data: s }, { data: values }] = await Promise.all([
    supabase.from("stores").select("*").single(),
    supabase.from("trade_in_values").select("model, capacity, value_usd").order("model"),
  ]);
  if (!s) throw new Error("No se encontró el local.");
  return {
    id: s.id,
    name: s.name,
    cuit: s.cuit,
    address: s.address,
    phone: s.phone,
    fx: Number(s.fx),
    targetMargin: Number(s.target_margin),
    maxDiscountSeller: Number(s.max_discount_seller),
    warrantyNewDays: s.warranty_new_days,
    warrantyUsedDays: s.warranty_used_days,
    condMult: s.cond_mult,
    defectCosts: s.defect_costs,
    baseValues: (values ?? []).map((v) => ({ model: v.model, capacity: v.capacity, value: Number(v.value_usd) })),
  };
}
