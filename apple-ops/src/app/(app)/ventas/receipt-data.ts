import type { SupabaseClient } from "@supabase/supabase-js";
import type { Currency } from "@/lib/catalog";

export type SaleDetail = {
  id: string;
  number: string;
  at: string;
  status: "Cerrada" | "Anulada";
  client_name: string;
  client_phone: string;
  discount_pct: number;
  fx: number;
  subtotal_usd: number;
  discount_usd: number;
  total_usd: number;
  trade_in_usd: number;
  notes: string;
  void_reason: string | null;
  voided_at: string | null;
  seller: { name: string } | null;
  cashier: { name: string } | null;
  voider: { name: string } | null;
  lines: { kind: string; description: string; qty: number; unit_price: number; currency: Currency }[];
  payments: { method: string; currency: Currency; amount: number }[];
  tradeIn: { model: string; capacity: number; condition: string; imei: string } | null;
};

const num = (v: unknown) => Number(v) || 0;

// Venta completa para el comprobante. El cajero no lee el detalle del canje: ve solo el monto.
export async function loadSale(supabase: SupabaseClient, id: string): Promise<SaleDetail | null> {
  const { data: s } = await supabase
    .from("sales")
    .select(`id, number, at, status, client_name, client_phone, discount_pct, fx, subtotal_usd, discount_usd, total_usd, trade_in_usd, notes,
      void_reason, voided_at,
      seller:profiles!sales_seller_id_fkey(name), cashier:profiles!sales_cashier_id_fkey(name), voider:profiles!sales_voided_by_fkey(name),
      sale_lines(kind, description, qty, unit_price, currency), sale_payments(method, currency, amount)`)
    .eq("id", id)
    .maybeSingle();
  if (!s) return null;
  const { data: ti } = await supabase.from("trade_ins").select("devices(model, capacity, condition, imei)").eq("sale_id", id).maybeSingle();
  const raw = s as unknown as Omit<SaleDetail, "lines" | "payments" | "tradeIn"> & { sale_lines: SaleDetail["lines"]; sale_payments: SaleDetail["payments"] };
  return {
    ...raw,
    discount_pct: num(raw.discount_pct),
    fx: num(raw.fx),
    subtotal_usd: num(raw.subtotal_usd),
    discount_usd: num(raw.discount_usd),
    total_usd: num(raw.total_usd),
    trade_in_usd: num(raw.trade_in_usd),
    lines: raw.sale_lines.map((l) => ({ ...l, qty: num(l.qty), unit_price: num(l.unit_price) })),
    payments: raw.sale_payments.map((p) => ({ ...p, amount: num(p.amount) })),
    tradeIn: (ti?.devices as unknown as SaleDetail["tradeIn"]) ?? null,
  };
}
