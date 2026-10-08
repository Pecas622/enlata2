// Operaciones de cobro del lado del servidor: crean suscripciones en Mercado Pago y aplican su
// estado en la base con la clave de servicio.
import { externalRef, mpStatus, parseExternalRef, parsePrices, type Item } from "./billing";
import { createPreapproval, getPreapproval } from "./mercadopago";
import { MODULE_INFO } from "./modules";
import { createServiceClient } from "./supabase/server";

export async function loadPrices() {
  const { data } = await createServiceClient().from("plan_prices").select("item, price_ars");
  return parsePrices(data);
}

const reason = (item: Item, store: string) => `APPLE OPS · ${item === "base" ? "Plan base" : MODULE_INFO[item].label} · ${store}`;

// Crea la suscripción mensual del ítem y devuelve el link de pago de Mercado Pago.
export async function startSubscription(p: { storeId: string; storeName: string; item: Item; email: string; origin: string }) {
  const prices = await loadPrices();
  const amount = prices[p.item];
  if (!amount) throw new Error("Ese ítem no tiene precio cargado.");
  const back = `${p.origin}/plan?vuelta=${p.item === "base" ? "base" : "modulo"}`;
  const pre = await createPreapproval({ reason: reason(p.item, p.storeName), payerEmail: p.email, amount, externalReference: externalRef(p.storeId, p.item), backUrl: back });
  const { error } = await createServiceClient().rpc("registrar_suscripcion", { p_store: p.storeId, p_item: p.item, p_preapproval: pre.id, p_price: amount });
  if (error) throw new Error(error.message);
  if (!pre.init_point) throw new Error("Mercado Pago no devolvió el link de pago.");
  return pre.init_point;
}

// Consulta la suscripción en Mercado Pago y aplica su estado. Devuelve true si cambió algo.
export async function syncPreapproval(id: string): Promise<boolean> {
  const pre = await getPreapproval(id);
  const status = mpStatus(pre.status);
  if (!status || !parseExternalRef(pre.external_reference)) return false;
  const { data, error } = await createServiceClient().rpc("aplicar_suscripcion", { p_preapproval: pre.id, p_status: status });
  if (error) throw new Error(error.message);
  return data === true;
}

// Al volver de Mercado Pago no se espera al webhook: se revisan las suscripciones pendientes del local.
export async function syncStore(storeId: string) {
  const { data } = await createServiceClient().from("subscriptions").select("mp_preapproval_id").eq("store_id", storeId).eq("status", "pendiente");
  for (const s of data ?? []) {
    try {
      await syncPreapproval(s.mp_preapproval_id);
    } catch (e) {
      console.warn("suscripción: no se pudo consultar", s.mp_preapproval_id, e instanceof Error ? e.message : e);
    }
  }
}

// Dirección pública de la app, para la vuelta desde Mercado Pago.
export async function currentOrigin() {
  const { headers } = await import("next/headers");
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}
