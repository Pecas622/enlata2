// Usuarios, configuración y estado de caja: solo el administrador gestiona; todo queda registrado.
import type { SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PROFILE, fresh, service, signInAll, type Who } from "./helpers";

let c: Record<Who, SupabaseClient>;
const created: string[] = [];

beforeAll(async () => {
  c = await signInAll();
});

afterAll(async () => {
  for (const id of created) await service().auth.admin.deleteUser(id);
});

async function nuevaCuenta() {
  const email = `test${Date.now()}${Math.floor(Math.random() * 1000)}@demo.apple-ops.test`;
  const { data, error } = await service().auth.admin.createUser({ email, password: "clave-segura-1", email_confirm: true });
  if (error) throw error;
  created.push(data.user.id);
  return { id: data.user.id, email };
}

type Config = Record<string, unknown> & { base_values: { model: string; capacity: number; value: number }[] };

async function configActual(): Promise<Config> {
  const { data: s } = await c.admin.from("stores").select("*").single();
  const { data: v } = await c.admin.from("trade_in_values").select("model, capacity, value_usd");
  return { ...s, base_values: v!.map((x) => ({ model: x.model, capacity: x.capacity, value: Number(x.value_usd) })) };
}

describe("usuarios", () => {
  it("el administrador da de alta un usuario que entra con su email y su PIN", async () => {
    const { id, email } = await nuevaCuenta();
    const sinPin = await c.admin.rpc("guardar_usuario", { p_id: id, p_name: "Nuevo", p_role: "Vendedor" });
    expect(sinPin.error?.message).toBe("Elegí un PIN de 4 dígitos para el usuario.");
    const { error } = await c.admin.rpc("guardar_usuario", { p_id: id, p_name: "Nuevo", p_role: "Vendedor", p_commission: 3, p_pin: "5555" });
    expect(error).toBeNull();

    const nuevo = fresh();
    expect((await nuevo.auth.signInWithPassword({ email, password: "clave-segura-1" })).error).toBeNull();
    expect((await nuevo.rpc("current_app_role")).data).toBe("Vendedor");
    expect((await c.cajero.rpc("verificar_pin", { p_profile: id, p_pin: "5555" })).data).toBe(true);
    const { data: log } = await c.admin.from("audit_log").select("action, user_name").eq("detail", "Nuevo (Vendedor)");
    expect(log).toEqual([{ action: "Usuario nuevo", user_name: "Santiago" }]);
  });

  it("desactivar a un usuario le corta el acceso", async () => {
    const { id, email } = await nuevaCuenta();
    await c.admin.rpc("guardar_usuario", { p_id: id, p_name: "Temporal", p_role: "Cajero", p_pin: "6666" });
    expect((await c.admin.rpc("guardar_usuario", { p_id: id, p_name: "Temporal", p_role: "Cajero", p_active: false })).error).toBeNull();
    const u = fresh();
    await u.auth.signInWithPassword({ email, password: "clave-segura-1" });
    expect((await u.rpc("current_app_role")).data).toBeNull();
    expect((await c.cajero.rpc("verificar_pin", { p_profile: id, p_pin: "6666" })).data).toBe(false);
  });

  it("tiene que quedar al menos un administrador activo", async () => {
    const { error } = await c.admin.rpc("guardar_usuario", { p_id: PROFILE.admin, p_name: "Santiago", p_role: "Encargado" });
    expect(error?.message).toBe("Tiene que quedar al menos un administrador activo.");
    const pin = await c.admin.rpc("guardar_usuario", { p_id: PROFILE.vendedor, p_name: "Mati", p_role: "Vendedor", p_commission: 2, p_pin: "12a4" });
    expect(pin.error?.message).toBe("El PIN tiene que ser de 4 dígitos.");
  });

  it("nadie más gestiona usuarios, ni directo ni por función", async () => {
    for (const who of ["encargado", "vendedor", "cajero"] as Who[]) {
      expect((await c[who].rpc("guardar_usuario", { p_id: PROFILE[who], p_name: "x", p_role: "Administrador" })).error?.message)
        .toBe("Solo el administrador gestiona usuarios.");
    }
    const { data } = await c.admin.from("profiles").update({ commission_pct: 50 }).eq("id", PROFILE.vendedor).select();
    expect(data ?? []).toEqual([]);
  });
});

describe("configuración", () => {
  it("el administrador cambia la cotización y la tabla de tasación, con registro", async () => {
    const cfg = await configActual();
    const base = [...cfg.base_values.filter((v) => v.model !== "iPad 9"), { model: "iPhone 16", capacity: 128, value: 700 }];
    const { error } = await c.admin.rpc("guardar_config", { p: { ...cfg, fx: 1250, base_values: base } });
    expect(error).toBeNull();
    const after = await configActual();
    expect(Number(after.fx)).toBe(1250);
    expect(after.base_values).toContainEqual({ model: "iPhone 16", capacity: 128, value: 700 });
    expect(after.base_values.some((v) => v.model === "iPad 9")).toBe(false);
    const { data: log } = await c.admin.from("audit_log").select("detail").eq("action", "Configuración").order("at", { ascending: false }).limit(1);
    expect(log![0].detail).toBe("cotización $ 1200 → $ 1250");
    // Vuelve a como estaba para el resto de los tests.
    expect((await c.admin.rpc("guardar_config", { p: cfg })).error).toBeNull();
  });

  it("valida la cotización y solo la cambia el administrador", async () => {
    const cfg = await configActual();
    expect((await c.admin.rpc("guardar_config", { p: { ...cfg, fx: 0 } })).error?.message).toBe("La cotización tiene que ser mayor a cero.");
    expect((await c.encargado.rpc("guardar_config", { p: cfg })).error?.message).toBe("Solo el administrador cambia la configuración.");
    const { data } = await c.admin.from("stores").update({ fx: 1 }).neq("id", "00000000-0000-0000-0000-000000000000").select();
    expect(data ?? []).toEqual([]);
  });
});

describe("estado de caja", () => {
  it("cualquier rol ve si la caja está abierta, sin montos", async () => {
    const { data } = await c.vendedor.rpc("estado_caja");
    expect(Object.keys(data as object).sort()).toEqual(["number", "opened_at", "opened_by"]);
  });
});
