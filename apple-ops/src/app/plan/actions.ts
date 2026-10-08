"use server";

import { redirect } from "next/navigation";
import { isItem } from "@/lib/billing";
import { currentOrigin, startSubscription } from "@/lib/billing-server";
import { mpConfigured } from "@/lib/mercadopago";
import { getCurrentUser } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";

// Arranca la suscripción del plan base o de un módulo y manda a pagar a Mercado Pago.
// Solo el Administrador; un módulo que el local ya tiene no se vuelve a cobrar.
export async function pagar(item: string): Promise<{ error?: string }> {
  const user = await getCurrentUser();
  if (user.role !== "Administrador") return { error: "Solo el administrador puede contratar el plan." };
  if (!isItem(item)) return { error: "Ese ítem no existe." };
  if (!mpConfigured()) return { error: "El cobro online todavía no está configurado. Escribile a Enlata2." };
  if (item === "base" ? user.billingStatus === "activo" : user.modules.includes(item)) return { error: "Ya lo tenés en tu plan." };
  if (item === "asistente" && !user.modules.includes("catalogo")) return { error: "El asistente necesita el catálogo online: sumá primero el catálogo." };
  let url: string;
  try {
    url = await startSubscription({ storeId: user.storeId, storeName: user.storeName, item, email: user.email, origin: await currentOrigin() });
  } catch (e) {
    console.warn("plan: no se pudo crear la suscripción", e instanceof Error ? e.message : e);
    return { error: "Mercado Pago no respondió. Probá de nuevo en un rato." };
  }
  redirect(url);
}

export async function salir() {
  await (await createClient()).auth.signOut();
  redirect("/login");
}
