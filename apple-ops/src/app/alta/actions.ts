"use server";

import { redirect } from "next/navigation";
import { signupProblems, type Signup } from "@/lib/billing";
import { currentOrigin, startSubscription } from "@/lib/billing-server";
import { mpConfigured } from "@/lib/mercadopago";
import { createClient, createServiceClient } from "@/lib/supabase/server";

export type AltaState = { error?: string };

// Alta desde la web: crea la cuenta y el local (pendiente de pago) y manda a pagar el plan base.
export async function darDeAlta(_prev: AltaState, fd: FormData): Promise<AltaState> {
  const s: Signup = {
    store: String(fd.get("store") ?? "").trim(),
    slug: String(fd.get("slug") ?? "").trim().toLowerCase(),
    name: String(fd.get("name") ?? "").trim(),
    email: String(fd.get("email") ?? "").trim().toLowerCase(),
    password: String(fd.get("password") ?? ""),
    pin: String(fd.get("pin") ?? "").trim(),
  };
  const problems = signupProblems(s);
  if (problems.length) return { error: problems.join(" ") };
  if (!mpConfigured()) return { error: "El cobro online todavía no está configurado. Escribile a Enlata2 para darte de alta." };

  const admin = createServiceClient();
  const { data: taken } = await admin.from("catalog_settings").select("store_id").eq("slug", s.slug).maybeSingle();
  if (taken) return { error: `El link /catalogo/${s.slug} ya lo usa otro local. Probá con otro.` };

  const { data: created, error: userErr } = await admin.auth.admin.createUser({ email: s.email, password: s.password, email_confirm: true, user_metadata: { name: s.name } });
  if (userErr || !created.user) {
    return { error: /already|registered|exists/i.test(userErr?.message ?? "") ? "Ya hay una cuenta con ese email. Ingresá desde el login." : "No se pudo crear la cuenta. Probá de nuevo." };
  }
  const { data: storeId, error: storeErr } = await admin.rpc("crear_local_pendiente", { p_name: s.store, p_slug: s.slug, p_admin: created.user.id, p_admin_name: s.name, p_pin: s.pin });
  if (storeErr) {
    await admin.auth.admin.deleteUser(created.user.id);
    return { error: storeErr.message };
  }

  const supabase = await createClient();
  await supabase.auth.signInWithPassword({ email: s.email, password: s.password });

  let url: string;
  try {
    url = await startSubscription({ storeId: storeId as string, storeName: s.store, item: "base", email: s.email, origin: await currentOrigin() });
  } catch (e) {
    console.warn("alta: no se pudo crear la suscripción", e instanceof Error ? e.message : e);
    // La cuenta ya existe: desde /plan puede reintentar el pago.
    redirect("/plan?error=mp");
  }
  redirect(url);
}
