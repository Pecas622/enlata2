import type { SupabaseClient } from "@supabase/supabase-js";
import { dayStartISO } from "./dates";
import type { ReportLine, ReportSale, Seller } from "./reports";

type Row = Omit<ReportSale, "lines" | "seller_name"> & {
  seller: { name: string } | null;
  sale_lines: (Omit<ReportLine, "device_kind" | "cost"> & { devices: { kind: string } | null; sale_line_costs: { unit_cost: number; currency: ReportLine["currency"] } | null })[];
};

// Ventas desde un día local, con líneas y (si el rol los ve) costos.
export async function loadReportSales(supabase: SupabaseClient, fromDay?: string, limit?: number): Promise<ReportSale[]> {
  let q = supabase
    .from("sales")
    .select(`id, number, at, status, client_name, seller_id, fx, total_usd, discount_usd, trade_in_usd,
      seller:profiles!sales_seller_id_fkey(name),
      sale_lines(kind, description, qty, unit_price, currency, devices(kind), sale_line_costs(unit_cost, currency))`)
    .order("at", { ascending: false });
  if (fromDay && fromDay > "0000-01-01") q = q.gte("at", dayStartISO(fromDay));
  if (limit) q = q.limit(limit);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return ((data ?? []) as unknown as Row[]).map((s) => ({
    id: s.id, number: s.number, at: s.at, status: s.status, client_name: s.client_name, seller_id: s.seller_id,
    seller_name: s.seller?.name ?? "-", fx: Number(s.fx), total_usd: Number(s.total_usd), discount_usd: Number(s.discount_usd),
    trade_in_usd: Number(s.trade_in_usd),
    lines: s.sale_lines.map((l) => ({
      kind: l.kind, device_kind: l.devices?.kind ?? null, description: l.description, qty: l.qty, unit_price: Number(l.unit_price), currency: l.currency,
      cost: l.sale_line_costs ? { unit_cost: Number(l.sale_line_costs.unit_cost), currency: l.sale_line_costs.currency } : null,
    })),
  }));
}

export async function loadSellers(supabase: SupabaseClient): Promise<Seller[]> {
  const { data } = await supabase.from("profiles").select("id, name, role, commission_pct").order("name");
  return (data ?? []).map((u) => ({ ...u, commission_pct: Number(u.commission_pct) }));
}
