// Verifica los permisos en la base: cada rol consulta Supabase directo, sin pasar por la app.
// Requiere la base con migraciones y seed (supabase start, o el stack local de desarrollo).
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { beforeAll, describe, expect, it } from "vitest";
import { PASSWORD, as, fresh, serviceKey, url, USERS, type Who } from "./helpers";

const clients = {} as Record<Who, SupabaseClient>;

beforeAll(async () => {
  for (const who of Object.keys(USERS) as Who[]) clients[who] = await as(who);
});

describe("costos", () => {
  it.each(["vendedor", "cajero"] as Who[])("%s no ve costos de equipos, accesorios ni ventas", async (who) => {
    const c = clients[who];
    for (const table of ["device_costs", "accessory_costs", "sale_line_costs"]) {
      const { data, error } = await c.from(table).select("*");
      expect(error).toBeNull();
      expect(data).toEqual([]);
    }
  });

  it.each(["admin", "encargado"] as Who[])("%s ve los costos", async (who) => {
    const { data } = await clients[who].from("device_costs").select("cost_usd");
    expect(data!.length).toBeGreaterThanOrEqual(16);
  });

  it("la tabla de equipos no tiene columna de costo", async () => {
    const { error } = await clients.vendedor.from("devices").select("cost_usd");
    expect(error).not.toBeNull();
  });
});

describe("escrituras por rol", () => {
  it("el vendedor no puede cambiar precios", async () => {
    const { data } = await clients.vendedor.from("devices").update({ price_usd: 1 }).eq("model", "iPhone 15").select();
    expect(data).toEqual([]);
    const { data: check } = await clients.admin.from("devices").select("price_usd").eq("model", "iPhone 15");
    expect(check!.every((d) => Number(d.price_usd) > 1)).toBe(true);
  });

  it("solo el administrador gestiona usuarios", async () => {
    const { data } = await clients.encargado.from("profiles").update({ commission_pct: 50 }).eq("name", "Mati").select();
    expect(data).toEqual([]);
  });

  it("nadie escribe ventas directo, ni el administrador", async () => {
    const { error } = await clients.admin.from("sales").insert({ store_id: "00000000-0000-4000-8000-000000000001", number: "V-9999", fx: 1, subtotal_usd: 1, total_usd: 1 });
    expect(error).not.toBeNull();
  });

  it("el PIN no es legible por ningún rol", async () => {
    const { data } = await clients.admin.from("profile_pins").select("*");
    expect(data).toEqual([]);
  });
});

describe("caja", () => {
  it("el vendedor no ve turnos ni movimientos de caja", async () => {
    expect((await clients.vendedor.from("cash_shifts").select("*")).data).toEqual([]);
    expect((await clients.vendedor.from("cash_moves").select("*")).data).toEqual([]);
  });

  it("no se pueden abrir dos cajas a la vez en el mismo local", async () => {
    const svc = createClient(url, serviceKey, { auth: { persistSession: false } });
    const store = "00000000-0000-4000-8000-000000000001";
    const caro = "00000000-0000-4000-8000-0000000000a4";
    // El seed deja la caja de hoy abierta: una segunda choca con el índice único.
    expect((await svc.from("cash_shifts").select("id").eq("status", "Abierta")).data).toHaveLength(1);
    const second = await svc.from("cash_shifts").insert({ store_id: store, number: "T-TEST2", opened_by: caro });
    expect(second.error?.code).toBe("23505");
  });
});

describe("PIN de mostrador", () => {
  it("acepta el PIN correcto y rechaza uno incorrecto", async () => {
    const mati = "00000000-0000-4000-8000-0000000000a3";
    expect((await clients.cajero.rpc("verificar_pin", { p_profile: mati, p_pin: "3333" })).data).toBe(true);
    expect((await clients.cajero.rpc("verificar_pin", { p_profile: mati, p_pin: "0000" })).data).toBe(false);
    expect((await clients.cajero.rpc("verificar_pin", { p_profile: mati, p_pin: "3333" })).data).toBe(true);
  });

  it("un visitante anónimo no puede probar PINs", async () => {
    const { error } = await fresh().rpc("verificar_pin", { p_profile: "00000000-0000-4000-8000-0000000000a3", p_pin: "3333" });
    expect(error).not.toBeNull();
  });
});

describe("catálogo público", () => {
  it("el visitante anónimo no lee tablas internas", async () => {
    for (const table of ["devices", "device_costs", "clients", "sales", "profiles", "stores"]) {
      const { data, error } = await fresh().from(table).select("*");
      expect(error ?? data?.length === 0).toBeTruthy();
    }
  });

  it("la vista pública no expone costo, IMEI ni datos de clientes", async () => {
    const { data, error } = await fresh().from("catalogo_publico").select("*");
    expect(error).toBeNull();
    expect(data!.length).toBeGreaterThan(0);
    const cols = Object.keys(data![0]);
    for (const banned of ["imei", "cost_usd", "cost", "client_id", "notes"]) expect(cols).not.toContain(banned);
  });

  it("un equipo oculto no aparece en el catálogo", async () => {
    const { data: dev } = await clients.admin.from("devices").select("id").eq("model", "MacBook Air M1").single();
    expect((await clients.admin.rpc("catalogo_equipo", { p_device: dev!.id, p_visible: false, p_featured: false })).error).toBeNull();
    const { data } = await fresh().from("catalogo_publico").select("id").eq("id", dev!.id);
    expect(data).toEqual([]);
    await clients.admin.rpc("catalogo_equipo", { p_device: dev!.id, p_visible: true, p_featured: false });
  });
});

describe("aislamiento entre locales", () => {
  it("un usuario de otro local no ve nada de este", async () => {
    const svc = createClient(url, serviceKey, { auth: { persistSession: false } });
    const { data: store } = await svc.from("stores").insert({ name: "Otro local" }).select().single();
    const email = `otro-${Date.now()}@demo.apple-ops.test`;
    const { data: created, error } = await svc.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true });
    expect(error).toBeNull();
    await svc.from("profiles").insert({ id: created.user!.id, store_id: store!.id, name: "Otro", role: "Administrador" });

    const other = fresh();
    await other.auth.signInWithPassword({ email, password: PASSWORD });
    for (const table of ["devices", "device_costs", "clients", "accessories", "trade_in_values"]) {
      expect((await other.from(table).select("id").limit(1)).data ?? []).toEqual([]);
    }
    expect((await other.from("profiles").select("name")).data).toEqual([{ name: "Otro" }]);

    await svc.auth.admin.deleteUser(created.user!.id);
    await svc.from("stores").delete().eq("id", store!.id);
  });
});

describe("altas de usuarios", () => {
  it("nadie puede registrarse solo: los usuarios los crea el administrador", async () => {
    const { error } = await fresh().auth.signUp({ email: `intruso-${Date.now()}@demo.apple-ops.test`, password: PASSWORD });
    expect(error).not.toBeNull();
  });
});
