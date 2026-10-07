// Venta por módulos: los prende y apaga Enlata2 con set_modulos, y lo que un módulo apagado
// bloquea se corta en la base, no solo en el menú.
import type { SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MODULES } from "@/lib/modules";
import { PROFILE, STORE, fresh, service, signInAll, testIMEI, type Who } from "./helpers";

let c: Record<Who, SupabaseClient>;
let published = true;
const SERVICIO = "00000000-0000-4000-8000-200000000014";
const set = (mods: string[]) => service().rpc("set_modulos", { p_slug: "demo", p_modules: mods });
const store = async () => (await service().from("stores").select("modules, fx_source").eq("id", STORE).single()).data!;

beforeAll(async () => {
  c = await signInAll();
  published = (await service().from("catalog_settings").select("published").eq("store_id", STORE).single()).data!.published;
});

afterAll(async () => {
  await set([...MODULES]);
  await service().from("stores").update({ fx_source: "manual" }).eq("id", STORE);
  await service().from("catalog_settings").update({ published }).eq("store_id", STORE);
});

async function equipo() {
  const { data, error } = await c.admin.rpc("registrar_ingreso", {
    p_kind: "iPhone", p_model: "iPhone 14", p_capacity: 128, p_color: "Negro", p_condition: "Usado A", p_imei: testIMEI(),
    p_battery: 90, p_origin: "Proveedor", p_cost_usd: 450, p_price_usd: 550,
  });
  if (error) throw error;
  return data.device_id as string;
}

describe("módulos del local", () => {
  it("por defecto el local tiene todos los módulos", async () => {
    expect((await store()).modules).toEqual([...MODULES]);
  });

  it("solo Enlata2 cambia los módulos, nunca el local", async () => {
    expect((await c.admin.rpc("set_modulos", { p_slug: "demo", p_modules: [] })).error).not.toBeNull();
    expect((await fresh().rpc("set_modulos", { p_slug: "demo", p_modules: [] })).error).not.toBeNull();
    expect((await c.admin.from("stores").update({ modules: [] }).eq("id", STORE).select()).data ?? []).toHaveLength(0);
    expect((await store()).modules).toEqual([...MODULES]);
  });

  it("valida el local y los nombres, ordena y saca el asistente si no hay catálogo", async () => {
    expect((await service().rpc("set_modulos", { p_slug: "no-existe", p_modules: [] })).error?.message).toBe("No hay ningún local con el link no-existe.");
    expect((await set(["canje", "whatsapp"])).error?.message).toContain("Módulo desconocido: whatsapp.");
    const { data } = await set(["asistente", "reportes", "canje", "canje"]);
    expect(data).toEqual(["canje", "reportes"]);
    const { data: log } = await c.admin.from("audit_log").select("user_name, detail").eq("user_name", "Enlata2").order("at", { ascending: false }).limit(1);
    expect(log?.[0].detail).toBe(`módulos: ${MODULES.join(", ")} → canje, reportes`);
  });

  it("sin plan canje ni accesorios no se registran en una venta", async () => {
    await set(["reportes"]);
    const canje = { kind: "iPhone", model: "iPhone 13", capacity: 128, color: "Azul", cond: "Usado B", battery: 86, defects: [], icloud_free: true, imei_clean: true, imei: testIMEI() };
    const conCanje = await c.vendedor.rpc("registrar_venta", {
      p: { lines: [{ kind: "device", device_id: await equipo() }], seller_id: PROFILE.vendedor, trade_in: canje, payments: [{ method: "Efectivo USD", amount: 550 }] },
    });
    expect(conCanje.error?.message).toBe("El plan canje no está incluido en tu plan.");
    const conAcc = await c.vendedor.rpc("registrar_venta", {
      p: { lines: [{ kind: "acc", accessory_id: SERVICIO, qty: 1 }], seller_id: PROFILE.vendedor, payments: [{ method: "Efectivo ARS", amount: 8000 }] },
    });
    expect(conAcc.error?.message).toBe("Los accesorios no están incluidos en tu plan.");
    const soloEquipo = await c.vendedor.rpc("registrar_venta", {
      p: { lines: [{ kind: "device", device_id: await equipo() }], seller_id: PROFILE.vendedor, payments: [{ method: "Efectivo USD", amount: 550 }] },
    });
    expect(soloEquipo.error).toBeNull();
  });

  it("sin el módulo de alertas no hay dólar automático y al sacarlo vuelve a manual", async () => {
    await set([...MODULES]);
    await service().from("stores").update({ fx_source: "blue" }).eq("id", STORE);
    await set(["canje"]);
    expect((await store()).fx_source).toBe("manual");
    expect((await c.admin.rpc("guardar_cotizacion_y_alertas", { p_source: "oficial", p_extra: 0, p_stale_days: 30 })).error?.message).toBe("El dólar automático no está incluido en tu plan.");
    expect((await c.admin.rpc("guardar_cotizacion_y_alertas", { p_source: "manual", p_extra: 0, p_stale_days: 40 })).error).toBeNull();
    await service().from("stores").update({ stale_days: 30 }).eq("id", STORE);
  });

  it("el catálogo público respeta los módulos", async () => {
    const anon = fresh();
    await service().from("catalog_settings").update({ published: true }).eq("store_id", STORE);
    await set(["catalogo"]);
    const { data: cfg } = await anon.from("catalogo_config_publica").select("assistant_on, quote_on").eq("slug", "demo").single();
    expect(cfg).toEqual({ assistant_on: false, quote_on: false });
    expect((await anon.from("tasacion_publica").select("model").eq("slug", "demo")).data).toEqual([]);
    expect((await anon.from("accesorios_publicos").select("id").eq("slug", "demo")).data).toEqual([]);
    expect((await anon.from("catalogo_publico").select("id").eq("slug", "demo")).data!.length).toBeGreaterThan(0);
    await anon.rpc("registrar_chat", { p_slug: "demo", p_id: crypto.randomUUID(), p_topic: "Hola", p_messages: [{ role: "user", text: "hola" }], p_handoff: false });
    expect((await service().from("assistant_chats").select("id").eq("store_id", STORE).eq("topic", "Hola")).data).toEqual([]);

    await set([]);
    expect((await anon.from("catalogo_config_publica").select("slug").eq("slug", "demo")).data).toEqual([]);
    expect((await anon.from("catalogo_estado").select("slug").eq("slug", "demo")).data).toEqual([]);
    expect((await anon.from("catalogo_publico").select("id").eq("slug", "demo")).data).toEqual([]);

    await set([...MODULES]);
    expect((await anon.from("catalogo_config_publica").select("quote_on").eq("slug", "demo").single()).data).toEqual({ quote_on: true });
  });
});
