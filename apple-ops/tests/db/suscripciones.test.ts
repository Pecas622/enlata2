// Venta online del plan: precios públicos, alta pendiente de pago y activación por Mercado Pago.
// Solo el servidor (clave de servicio) registra y aplica suscripciones.
import type { SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MODULES } from "@/lib/modules";
import { STORE, fresh, service, signInAll, type Who } from "./helpers";

let c: Record<Who, SupabaseClient>;
let storeId = "";
let userId = "";
const slug = `alta-${Date.now().toString(36)}`;
const store = async () => (await service().from("stores").select("modules, billing_status, fx_source").eq("id", storeId).single()).data!;
const aplicar = (id: string, status: string) => service().rpc("aplicar_suscripcion", { p_preapproval: id, p_status: status });
const registrar = (id: string, item: string) => service().rpc("registrar_suscripcion", { p_store: storeId, p_item: item, p_preapproval: id, p_price: 1000 });

beforeAll(async () => {
  c = await signInAll();
  const { data, error } = await service().auth.admin.createUser({ email: `${slug}@alta.apple-ops.test`, password: "clave-segura-1", email_confirm: true });
  if (error) throw error;
  userId = data.user.id;
});

afterAll(async () => {
  if (storeId) await service().from("stores").delete().eq("id", storeId);
  if (userId) await service().auth.admin.deleteUser(userId);
});

describe("suscripciones", () => {
  it("los precios son públicos pero nadie los cambia desde la app", async () => {
    const { data } = await fresh().from("plan_prices").select("item, price_ars");
    expect(data?.map((r) => r.item).sort()).toEqual(["base", ...MODULES].sort());
    expect((await c.admin.from("plan_prices").update({ price_ars: 1 }).eq("item", "base").select()).data ?? []).toHaveLength(0);
    expect((await fresh().from("plan_prices").insert({ item: "base", price_ars: 1 })).error).not.toBeNull();
  });

  it("las funciones de cobro son solo del servidor", async () => {
    for (const cl of [fresh(), c.admin]) {
      expect((await cl.rpc("crear_local_pendiente", { p_name: "X", p_slug: "xxx", p_admin: userId, p_admin_name: "X", p_pin: "1234" })).error).not.toBeNull();
      expect((await cl.rpc("registrar_suscripcion", { p_store: STORE, p_item: "base", p_preapproval: "x", p_price: 1 })).error).not.toBeNull();
      expect((await cl.rpc("aplicar_suscripcion", { p_preapproval: "x", p_status: "activa" })).error).not.toBeNull();
    }
  });

  it("el alta crea el local con IMEI y alertas (vienen en la base) y pendiente de pago", async () => {
    const { data, error } = await service().rpc("crear_local_pendiente", { p_name: "Local Alta", p_slug: slug, p_admin: userId, p_admin_name: "Ana", p_pin: "1234" });
    expect(error).toBeNull();
    storeId = data as string;
    expect(await store()).toMatchObject({ modules: ["imei", "alertas"], billing_status: "pendiente" });
  });

  it("el plan base activa el local y, si se cancela, lo suspende", async () => {
    await registrar("pre-base", "base");
    expect((await aplicar("pre-base", "pendiente")).data).toBe(false);
    expect((await aplicar("pre-base", "activa")).data).toBe(true);
    expect((await store()).billing_status).toBe("activo");
    expect((await aplicar("pre-base", "activa")).data).toBe(false);
    await aplicar("pre-base", "cancelada");
    expect((await store()).billing_status).toBe("suspendido");
    await registrar("pre-base-2", "base");
    await aplicar("pre-base-2", "activa");
    expect((await store()).billing_status).toBe("activo");
  });

  it("cada módulo se prende al pagarse y se apaga al cancelarse, en orden y con el asistente atado al catálogo", async () => {
    await registrar("pre-alertas", "alertas");
    await registrar("pre-catalogo", "catalogo");
    await registrar("pre-asistente", "asistente");
    await aplicar("pre-alertas", "activa");
    await aplicar("pre-asistente", "activa");
    expect((await store()).modules).toEqual(["imei", "alertas"]);
    await aplicar("pre-catalogo", "activa");
    expect((await store()).modules).toEqual(["imei", "catalogo", "asistente", "alertas"]);
    await service().from("stores").update({ fx_source: "blue" }).eq("id", storeId);
    await aplicar("pre-alertas", "pausada");
    expect(await store()).toMatchObject({ modules: ["imei", "catalogo", "asistente"], fx_source: "manual" });
    await aplicar("pre-catalogo", "cancelada");
    expect((await store()).modules).toEqual(["imei"]);
    const { data: log } = await service().from("audit_log").select("user_name, detail").eq("store_id", storeId).eq("user_name", "Mercado Pago").order("at", { ascending: false }).limit(1);
    expect(log?.[0].detail).toBe("catálogo online: suscripción cancelada");
  });

  it("un preapproval desconocido no cambia nada y el estado se valida", async () => {
    expect((await aplicar("no-existe", "activa")).data).toBe(false);
    expect((await aplicar("pre-base-2", "rara")).error?.message).toBe("Estado inválido.");
  });

  it("el administrador ve las suscripciones de su local y nadie más", async () => {
    await service().from("subscriptions").insert({ store_id: STORE, item: "imei", mp_preapproval_id: `demo-${slug}`, price_ars: 1 });
    expect((await c.admin.from("subscriptions").select("item").eq("mp_preapproval_id", `demo-${slug}`)).data).toHaveLength(1);
    expect((await c.admin.from("subscriptions").select("item").eq("store_id", storeId)).data).toHaveLength(0);
    expect((await c.vendedor.from("subscriptions").select("item")).data).toHaveLength(0);
    expect((await fresh().from("subscriptions").select("item")).data ?? []).toHaveLength(0);
    await service().from("subscriptions").delete().eq("mp_preapproval_id", `demo-${slug}`);
  });
});
