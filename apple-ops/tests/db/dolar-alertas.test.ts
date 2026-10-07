// Cotización automática del dólar y parámetros de alertas.
import type { SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { service, signInAll, STORE, type Who } from "./helpers";

let c: Record<Who, SupabaseClient>;
const store = async () => (await service().from("stores").select("fx, fx_source, fx_extra, fx_updated_at, stale_days").eq("id", STORE).single()).data!;

beforeAll(async () => {
  c = await signInAll();
});

afterAll(async () => {
  await service().from("stores").update({ fx: 1200, fx_source: "manual", fx_extra: 0, fx_updated_at: null, stale_days: 30 }).eq("id", STORE);
});

describe("dólar automático y alertas", () => {
  it("solo el administrador elige la fuente, el ajuste y los días de equipo parado", async () => {
    const args = { p_source: "blue", p_extra: 10, p_stale_days: 20 };
    expect((await c.encargado.rpc("guardar_cotizacion_y_alertas", args)).error?.message).toBe("Solo el administrador cambia la configuración.");
    expect((await c.admin.rpc("guardar_cotizacion_y_alertas", { ...args, p_source: "cripto" })).error?.message).toBe("Elegí de dónde sale la cotización.");
    expect((await c.admin.rpc("guardar_cotizacion_y_alertas", { ...args, p_stale_days: 0 })).error?.message).toBe("Los días para avisar de un equipo parado van de 1 a 365.");
    expect((await c.admin.rpc("guardar_cotizacion_y_alertas", args)).error).toBeNull();
    expect(await store()).toMatchObject({ fx_source: "blue", fx_extra: 10, stale_days: 20, fx_updated_at: null });
    const { data: log } = await c.admin.from("audit_log").select("detail").like("detail", "cotización manual → dólar blue%");
    expect(log).toHaveLength(1);
  });

  it("la cotización consultada solo la aplica el servidor y queda en el historial si cambia", async () => {
    expect((await c.admin.rpc("aplicar_cotizacion", { p_store: STORE, p_fx: 1 })).error).not.toBeNull();
    expect((await service().rpc("aplicar_cotizacion", { p_store: STORE, p_fx: 1310 })).data).toBe(true);
    const s = await store();
    expect(Number(s.fx)).toBe(1310);
    expect(s.fx_updated_at).not.toBeNull();
    expect((await service().rpc("aplicar_cotizacion", { p_store: STORE, p_fx: 1310 })).data).toBe(false);
    const { data: log } = await c.admin.from("audit_log").select("user_name, detail").like("detail", "%(dólar blue)");
    expect(log).toEqual([{ user_name: "Automático", detail: "cotización $ 1200 → $ 1310 (dólar blue)" }]);
  });

  it("en manual no se toca la cotización", async () => {
    expect((await c.admin.rpc("guardar_cotizacion_y_alertas", { p_source: "manual", p_extra: 0, p_stale_days: 30 })).error).toBeNull();
    expect((await service().rpc("aplicar_cotizacion", { p_store: STORE, p_fx: 999 })).data).toBe(false);
    expect(Number((await store()).fx)).toBe(1310);
  });
});
