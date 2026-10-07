"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type IngresoInput = {
  kind: string;
  model: string;
  capacity: number;
  color: string;
  cond: string;
  imei: string;
  battery: number;
  origin: string;
  costUSD: number;
  priceUSD: number;
  personName: string;
  personDni: string;
  personPhone: string;
  icloudFree: boolean;
  imeiClean: boolean;
  defects: string[];
  note: string;
  payMethod: string;
  payAmount: number;
};

export type IngresoResult = { error?: string; purchaseId?: string; number?: string };

export async function registrarIngreso(input: IngresoInput): Promise<IngresoResult> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("registrar_ingreso", {
    p_kind: input.kind,
    p_model: input.model,
    p_capacity: input.capacity,
    p_color: input.color,
    p_condition: input.cond,
    p_imei: input.imei.trim(),
    p_battery: input.battery,
    p_origin: input.origin,
    p_cost_usd: input.costUSD,
    p_price_usd: input.priceUSD,
    p_person_name: input.personName,
    p_person_dni: input.personDni,
    p_person_phone: input.personPhone,
    p_icloud_free: input.icloudFree,
    p_imei_clean: input.imeiClean,
    p_defects: input.defects,
    p_note: input.note,
    p_pay_method: input.payAmount > 0 ? input.payMethod : null,
    p_pay_amount: input.payAmount,
  });
  if (error) return { error: error.message };
  revalidatePath("/ingresos");
  revalidatePath("/stock");
  return { purchaseId: data.purchase_id, number: data.number };
}

// Para avisar antes de enviar que el IMEI ya está en stock.
export async function imeiInStock(imei: string): Promise<string | null> {
  const clean = imei.trim();
  if (clean.length < 6) return null;
  const supabase = await createClient();
  const { data } = await supabase
    .from("devices")
    .select("model, capacity, status")
    .eq("imei", clean)
    .not("status", "in", "(Vendido,Retirado)")
    .maybeSingle();
  return data ? `${data.model}${data.capacity ? ` ${data.capacity}GB` : ""}, ${data.status}` : null;
}
