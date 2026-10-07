import type { SupabaseClient } from "@supabase/supabase-js";

export type SaleRow = {
  id: string;
  number: string;
  at: string;
  client_name: string;
  total_usd: number;
  trade_in_usd: number;
  status: "Cerrada" | "Anulada";
  seller: { name: string } | null;
};

export const SALE_COLUMNS = "id, number, at, client_name, total_usd, trade_in_usd, status, seller:profiles!sales_seller_id_fkey(name)";

export function asSales(rows: unknown[] | null): SaleRow[] {
  return ((rows ?? []) as SaleRow[]).map((s) => ({ ...s, total_usd: Number(s.total_usd), trade_in_usd: Number(s.trade_in_usd) }));
}

export async function recentSales(supabase: SupabaseClient, q: string) {
  let query = supabase.from("sales").select(SALE_COLUMNS).order("at", { ascending: false }).limit(200);
  const needle = q.trim().replace(/[,()]/g, " ");
  if (needle) query = query.or(`number.ilike.%${needle}%,client_name.ilike.%${needle}%`);
  const { data } = await query;
  return asSales(data);
}
