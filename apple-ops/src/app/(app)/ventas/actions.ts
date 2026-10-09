"use server";

import { revalidatePath } from "next/cache";
import type { DeviceDraft } from "@/components/DeviceEvalForm";
import { facturarVenta, fiscalListo, loadFiscal, notaDeCredito } from "@/lib/arca-server";
import type { Receptor } from "@/lib/factura";
import { hasModule } from "@/lib/modules";
import { getCurrentUser } from "@/lib/session";
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
  // Si quien vende eligió emitir la factura electrónica con esta venta.
  facturar?: boolean;
  // Datos para la factura; null = consumidor final sin identificar.
  receptor?: Receptor | null;
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
  // Si se eligió emitir factura, la venta sale con ella. Si ARCA no responde, la venta queda
  // registrada igual y la factura se reintenta desde el detalle.
  const user = await getCurrentUser();
  if (input.facturar && hasModule(user.modules, "facturacion")) {
    const { fiscal, creds } = await loadFiscal(user.storeId);
    if (fiscalListo(fiscal, creds)) {
      await facturarVenta({ storeId: user.storeId, saleId: data.sale_id, userId: user.id, receptor: input.receptor ?? null });
    }
  }
  refresh();
  return { saleId: data.sale_id, number: data.number };
}

// Factura una venta desde su detalle: si no se facturó al venderla, o para reintentar si ARCA no
// respondió o rechazó la factura.
export async function facturar(saleId: string, receptor: Receptor | null): Promise<{ error?: string }> {
  const user = await getCurrentUser();
  if (!hasModule(user.modules, "facturacion")) return { error: "El local no tiene el módulo de facturación." };
  // La venta se lee con los permisos del usuario: si no la ve, no la factura.
  const { data: sale } = await (await createClient()).from("sales").select("id").eq("id", saleId).maybeSingle();
  if (!sale) return { error: "No existe la venta." };
  const res = await facturarVenta({ storeId: user.storeId, saleId, userId: user.id, receptor });
  revalidatePath(`/ventas/${saleId}`);
  return res.ok ? {} : { error: res.error };
}

// Reintenta la nota de crédito de una venta anulada.
export async function reintentarNotaDeCredito(saleId: string): Promise<{ error?: string }> {
  const user = await getCurrentUser();
  if (!hasModule(user.modules, "facturacion")) return { error: "El local no tiene el módulo de facturación." };
  if (user.role !== "Administrador" && user.role !== "Encargado") return { error: "Tu rol no puede anular ventas." };
  const { data: sale } = await (await createClient()).from("sales").select("id, status").eq("id", saleId).maybeSingle();
  if (!sale || sale.status !== "Anulada") return { error: "La venta no está anulada." };
  const res = await notaDeCredito({ storeId: user.storeId, saleId, userId: user.id });
  revalidatePath(`/ventas/${saleId}`);
  return !res || res.ok ? {} : { error: res.error };
}

export async function anularVenta(saleId: string, reason: string): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("anular_venta", { p_sale: saleId, p_reason: reason });
  if (error) return { error: error.message };
  // Si la venta estaba facturada, la anulación lleva su nota de crédito.
  const user = await getCurrentUser();
  if (hasModule(user.modules, "facturacion")) await notaDeCredito({ storeId: user.storeId, saleId, userId: user.id });
  refresh();
  revalidatePath(`/ventas/${saleId}`);
  return {};
}
