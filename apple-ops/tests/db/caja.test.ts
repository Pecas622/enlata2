// Caja: apertura, movimientos y cierre con arqueo, por funciones. Una sola caja abierta y arqueo ciego del cajero.
import type { SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PROFILE, service, signInAll, type Who } from "./helpers";

let c: Record<Who, SupabaseClient>;

beforeAll(async () => {
  c = await signInAll();
});

// El resto de los tests espera la caja abierta, como la deja el seed.
afterAll(async () => {
  const { data } = await service().from("cash_shifts").select("id").eq("status", "Abierta").maybeSingle();
  if (!data) await c.cajero.rpc("abrir_caja", { p_opening_ars: 50000, p_opening_usd: 200 });
});

type Resumen = { number: string; blind: boolean; expected_ars: number | null; expected_usd: number | null; breakdown: { method: string; cash: boolean }[] };

describe("caja", () => {
  it("el vendedor no maneja la caja", async () => {
    expect((await c.vendedor.rpc("abrir_caja", { p_opening_ars: 0, p_opening_usd: 0 })).error?.message).toBe("Tu rol no maneja la caja.");
    expect((await c.vendedor.rpc("resumen_caja")).error?.message).toBe("Tu rol no maneja la caja.");
    expect((await c.vendedor.rpc("cerrar_caja", { p_counted_ars: 0, p_counted_usd: 0 })).error?.message).toBe("Tu rol no maneja la caja.");
  });

  it("no se abre una segunda caja", async () => {
    const { data: open } = await c.admin.rpc("resumen_caja");
    const { error } = await c.cajero.rpc("abrir_caja", { p_opening_ars: 0, p_opening_usd: 0 });
    expect(error?.message).toBe(`Ya hay una caja abierta (${(open as Resumen).number}).`);
  });

  it("un egreso en efectivo baja el esperado; el cajero no ve el esperado", async () => {
    const antes = (await c.encargado.rpc("resumen_caja")).data as Resumen;
    const { error } = await c.cajero.rpc("movimiento_caja", { p_type: "Egreso", p_method: "Efectivo ARS", p_concept: "Gastos del local", p_amount: 5000 });
    expect(error).toBeNull();
    const despues = (await c.encargado.rpc("resumen_caja")).data as Resumen;
    expect(Number(despues.expected_ars)).toBe(Number(antes.expected_ars) - 5000);

    const ciego = (await c.cajero.rpc("resumen_caja")).data as Resumen;
    expect(ciego).toMatchObject({ blind: true, expected_ars: null, expected_usd: null });
    expect(ciego.breakdown.some((b) => b.cash)).toBe(false);
    const { data: log } = await c.admin.from("audit_log").select("user_name").eq("detail", "Egreso $ 5000 · Gastos del local").eq("action", "Movimiento de caja");
    expect(log!.at(-1)).toEqual({ user_name: "Caro" });
  });

  it("el encargado cierra: una diferencia exige motivo y queda el arqueo guardado", async () => {
    const r = (await c.encargado.rpc("resumen_caja")).data as Resumen & { id: string };
    const conDif = await c.encargado.rpc("cerrar_caja", { p_counted_ars: Number(r.expected_ars) - 100, p_counted_usd: Number(r.expected_usd) });
    expect(conDif.error?.message).toBe("Escribí el motivo de la diferencia.");

    const { data: id, error } = await c.encargado.rpc("cerrar_caja", {
      p_counted_ars: Number(r.expected_ars) - 100, p_counted_usd: Number(r.expected_usd), p_note: "Faltante de cambio",
    });
    expect(error).toBeNull();
    const { data: s } = await c.encargado.from("cash_shifts").select("status, diff_ars, diff_usd, note, breakdown, closed_by").eq("id", id).single();
    expect(s).toMatchObject({ status: "Cerrada", note: "Faltante de cambio", closed_by: PROFILE.encargado });
    expect(Number(s!.diff_ars)).toBe(-100);
    expect(Number(s!.diff_usd)).toBe(0);
    expect((s!.breakdown as unknown[]).length).toBe(5);

    expect((await c.cajero.rpc("movimiento_caja", { p_type: "Ingreso", p_method: "Efectivo ARS", p_concept: "x", p_amount: 1 })).error?.message).toBe("No hay caja abierta.");
    expect((await c.cajero.rpc("resumen_caja")).data).toBeNull();
  });

  it("el cajero abre y cierra a ciegas, sin motivo obligatorio, y ve su reporte", async () => {
    const { data: abierta, error } = await c.cajero.rpc("abrir_caja", { p_opening_ars: 30000, p_opening_usd: 100 });
    expect(error).toBeNull();
    expect(abierta.number).toMatch(/^T-\d{3}$/);
    const { data: id, error: e2 } = await c.cajero.rpc("cerrar_caja", { p_counted_ars: 29000, p_counted_usd: 100 });
    expect(e2).toBeNull();
    const { data: s } = await c.cajero.from("cash_shifts").select("number, expected_ars, diff_ars").eq("id", id).single();
    expect(s!.number).toBe(abierta.number);
    expect(Number(s!.expected_ars)).toBe(30000);
    expect(Number(s!.diff_ars)).toBe(-1000);
  });

  it("nadie escribe la caja directo", async () => {
    const { error } = await c.admin.from("cash_moves").insert({ store_id: "00000000-0000-4000-8000-000000000001", type: "Ingreso", concept: "x", method: "Efectivo ARS", currency: "ARS", amount: 1 });
    expect(error).not.toBeNull();
  });
});
