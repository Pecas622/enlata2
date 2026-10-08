// Ajuste de precios del plan y de los módulos: sube un porcentaje los precios de lista y el monto de
// las suscripciones de Mercado Pago que ya existen, para que el aumento llegue también a los clientes
// actuales. Redondea a múltiplos de $100. Sin --aplicar solo muestra lo que haría.
// Uso: npm run ajustar-precios -- --porcentaje 15 [--env .env.produccion] [--aplicar]
// Avisale a los clientes antes del próximo cobro: Mercado Pago les cobra el monto nuevo.
import { existsSync } from "node:fs";
import { parseArgs } from "node:util";
import { createClient } from "@supabase/supabase-js";

const { values: a } = parseArgs({
  options: { porcentaje: { type: "string" }, env: { type: "string", default: ".env.local" }, aplicar: { type: "boolean", default: false } },
});
const pct = Number(a.porcentaje);
if (!Number.isFinite(pct) || pct <= 0 || pct > 100) {
  console.error("Indicá --porcentaje entre 0 y 100, por ejemplo --porcentaje 15.");
  process.exit(1);
}
if (existsSync(a.env)) process.loadEnvFile(a.env);
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const token = process.env.MP_ACCESS_TOKEN;
const api = process.env.MP_API_URL || "https://api.mercadopago.com";
if (!url || !key || !token) {
  console.error(`Faltan NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY y MP_ACCESS_TOKEN (en ${a.env} o en el entorno).`);
  process.exit(1);
}

const sb = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const up = (n) => Math.round((Number(n) * (1 + pct / 100)) / 100) * 100;
const ars = (n) => Number(n).toLocaleString("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 });

const { data: prices, error: pErr } = await sb.from("plan_prices").select("item, price_ars").order("item");
if (pErr) throw new Error(pErr.message);
const newPrice = Object.fromEntries(prices.map((p) => [p.item, up(p.price_ars)]));
console.log(`Precios de lista (+${pct}%):`);
for (const p of prices) console.log(`  ${p.item.padEnd(10)} ${ars(p.price_ars)} → ${ars(newPrice[p.item])}`);

const { data: subs, error: sErr } = await sb.from("subscriptions").select("id, item, mp_preapproval_id, price_ars, status").in("status", ["activa", "pausada", "pendiente"]);
if (sErr) throw new Error(sErr.message);
console.log(`Suscripciones a ajustar: ${subs.length}.`);

if (!a.aplicar) {
  console.log("No se cambió nada. Para aplicar, repetí el comando con --aplicar.");
  process.exit(0);
}

for (const p of prices) {
  const { error } = await sb.from("plan_prices").update({ price_ars: newPrice[p.item] }).eq("item", p.item);
  if (error) throw new Error(error.message);
}
let ok = 0;
const failed = [];
for (const s of subs) {
  const amount = up(s.price_ars);
  const res = await fetch(`${api}/preapproval/${encodeURIComponent(s.mp_preapproval_id)}`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ auto_recurring: { transaction_amount: amount, currency_id: "ARS" } }),
  });
  if (!res.ok) {
    failed.push(`${s.mp_preapproval_id} (${res.status})`);
    continue;
  }
  await sb.from("subscriptions").update({ price_ars: amount, updated_at: new Date().toISOString() }).eq("id", s.id);
  ok++;
}
console.log(`Listo: precios de lista actualizados y ${ok} de ${subs.length} suscripciones con el monto nuevo.`);
if (failed.length) {
  console.error(`Mercado Pago rechazó ${failed.length}: ${failed.join(", ")}. Esas quedaron con el monto anterior: cambialas a mano en Mercado Pago y no repitas el comando, porque volvería a subir las demás.`);
  process.exit(1);
}
