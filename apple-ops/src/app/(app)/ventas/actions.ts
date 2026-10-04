"use server";

import { revalidatePath } from "next/cache";
import type { DeviceDraft } from "@/components/DeviceEvalForm";
import { createClient } from "@/lib/supabase/server";
import type { CartLine } from "@/lib/sale";

export type SaleInput = {
  lines: Pick<CartLine, "kind" | "refId" | "desc" | "qty" | "unit">[];
  discountPct: number;
  sellerId: string;
  clientId: string;
  clientName: string;
  clientPhone: string;
  notes: string;
  payments: { method: string; amount: number }[];
  tradeIn: (DeviceDraft & { valueStr: string }) | null;
};

export type SaleResult = { error?: string; saleId?: string; number?: string };

function refresh() {
  for (const path of ["/ventas", "/canje", "/stock"]) revalidatePath(path);
}

// La base recalcula totales, tasa el canje y controla los permisos del rol.
export async function registrarVenta(input: SaleInput): Promise<SaleResult> {
  const supabase = await createClient();
  const t = input.tradeIn;
  const { data, error } = await supabase.rpc("registrar_venta", {
    p: {
      lines: input.lines.map((l) =>
        l.kind === "device" ? { kind: "device", device_id: l.refId, unit_price: l.unit }
        : l.kind === "acc" ? { kind: "acc", accessory_id: l.refId, qty: l.qty, unit_price: l.unit }
        : { kind: "service", description: l.desc, unit_price: l.unit }),
      discount_pct: input.discountPct,
      seller_id: input.sellerId || null,
      client_id: input.clientId || null,
      client_name: input.clientName,
      client_phone: input.clientPhone,
      notes: input.notes,
      payments: input.payments.filter((p) => p.amount > 0),
      trade_in: t && {
        kind: t.kind, model: t.model, capacity: t.capacity, color: t.color, cond: t.cond, battery: t.battery,
        imei: t.imei.trim(), defects: t.defects, icloud_free: t.icloudFree, imei_clean: t.imeiClean, note: t.note,
        value_usd: t.valueStr === "" ? null : Number(t.valueStr),
      },
    },
  });
  if (error) return { error: error.message };
  refresh();
  return { saleId: data.sale_id, number: data.number };
}

export async function anularVenta(saleId: string, reason: string): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("anular_venta", { p_sale: saleId, p_reason: reason });
  if (error) return { error: error.message };
  refresh();
  revalidatePath(`/ventas/${saleId}`);
  return {};
}
