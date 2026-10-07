// Ingresos y edición de equipos: siempre por las funciones SQL, con historial, caja y registro.
import type { SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PROFILE, STORE, service, signInAll, testIMEI, type Who } from "./helpers";

let c: Record<Who, SupabaseClient>;
let shiftId: string | null = null;

const base = (imei: string) => ({
  p_kind: "iPhone", p_model: "iPhone 14", p_capacity: 128, p_color: "Negro", p_condition: "Usado A", p_imei: imei,
  p_battery: 88, p_origin: "Compra a particular", p_cost_usd: 450, p_price_usd: 550,
  p_person_name: "Ana Test", p_person_dni: "30000000",
});

beforeAll(async () => {
  c = await signInAll();
});

afterAll(async () => {
  if (shiftId) {
    const svc = service();
    await svc.from("cash_moves").delete().eq("shift_id", shiftId);
    await svc.from("cash_shifts").delete().eq("id", shiftId);
  }
});

describe("registrar_ingreso", () => {
  it("el encargado ingresa un equipo con historial, comprobante y registro", async () => {
    const imei = testIMEI();
    const { data, error } = await c.encargado.rpc("registrar_ingreso", base(imei));
    expect(error).toBeNull();
    expect(data.number).toMatch(/^I-\d{4}$/);

    const { data: dev } = await c.encargado.from("devices").select("status, price_usd, origin, warranty_days, device_costs(cost_usd)").eq("id", data.device_id).single();
    expect(dev).toMatchObject({ status: "Disponible", origin: "Compra a particular", warranty_days: 90 });
    expect(Number((dev!.device_costs as unknown as { cost_usd: number }).cost_usd)).toBe(450);

    const { data: ev } = await c.encargado.from("device_events").select("action").eq("device_id", data.device_id);
    expect(ev![0].action).toContain(data.number);
    const { data: log } = await c.admin.from("audit_log").select("action, user_name").ilike("detail", `${data.number}%`);
    expect(log).toEqual([{ action: "Ingreso de equipo", user_name: "Lucía" }]);
  });

  it("rechaza un IMEI que ya está en stock", async () => {
    const imei = testIMEI();
    expect((await c.admin.rpc("registrar_ingreso", base(imei))).error).toBeNull();
    const dup = await c.admin.rpc("registrar_ingreso", base(imei));
    expect(dup.error?.message).toBe("El IMEI ya está en stock.");
  });

  it("rechaza IMEI inválido, iCloud activo y particular sin DNI", async () => {
    expect((await c.admin.rpc("registrar_ingreso", base("123"))).error?.message).toContain("IMEI válido");
    expect((await c.admin.rpc("registrar_ingreso", { ...base(testIMEI()), p_icloud_free: false })).error?.message).toContain("iCloud");
    expect((await c.admin.rpc("registrar_ingreso", { ...base(testIMEI()), p_person_dni: "" })).error?.message).toContain("DNI");
  });

  it("vendedor y cajero no pueden ingresar equipos", async () => {
    for (const who of ["vendedor", "cajero"] as Who[]) {
      const { error } = await c[who].rpc("registrar_ingreso", base(testIMEI()));
      expect(error?.message).toBe("Tu rol no puede ingresar equipos.");
    }
  });

  it("sin caja abierta no se puede pagar desde caja", async () => {
    const { error } = await c.admin.rpc("registrar_ingreso", { ...base(testIMEI()), p_pay_method: "Efectivo USD", p_pay_amount: 450 });
    expect(error?.message).toBe("Abrí la caja para registrar el pago.");
  });

  it("con caja abierta, el pago queda como egreso del turno", async () => {
    const { data: shift } = await service().from("cash_shifts").insert({ store_id: STORE, number: "T-ING", opened_by: PROFILE.cajero }).select().single();
    shiftId = shift!.id;
    const { data, error } = await c.admin.rpc("registrar_ingreso", { ...base(testIMEI()), p_pay_method: "Efectivo USD", p_pay_amount: 450 });
    expect(error).toBeNull();
    const { data: moves } = await c.admin.from("cash_moves").select("type, currency, amount, concept, shift_id").eq("purchase_id", data.purchase_id);
    expect(moves).toHaveLength(1);
    expect(moves![0]).toMatchObject({ type: "Egreso", currency: "USD", shift_id: shiftId });
    expect(Number(moves![0].amount)).toBe(450);
    expect(moves![0].concept).toContain(data.number);
  });

  it("un proveedor entra como nuevo sellado sin datos de particular", async () => {
    const { data, error } = await c.admin.rpc("registrar_ingreso", {
      ...base(testIMEI()), p_origin: "Proveedor", p_condition: "Nuevo sellado", p_person_name: "", p_person_dni: "",
    });
    expect(error).toBeNull();
    const { data: dev } = await c.admin.from("devices").select("warranty_days, battery").eq("id", data.device_id).single();
    expect(dev).toEqual({ warranty_days: 365, battery: null });
  });
});

describe("editar_equipo", () => {
  it("cambia precio y estado y deja historial", async () => {
    const { data } = await c.admin.rpc("registrar_ingreso", base(testIMEI()));
    const { error } = await c.encargado.rpc("editar_equipo", { p_device: data.device_id, p_price_usd: 600, p_status: "Reservado", p_notes: "Seña de Juan" });
    expect(error).toBeNull();
    const { data: ev } = await c.admin.from("devices").select("price_usd, status, notes, device_events(action)").eq("id", data.device_id).single();
    expect(ev).toMatchObject({ status: "Reservado", notes: "Seña de Juan" });
    const actions = (ev!.device_events as unknown as { action: string }[]).map((e) => e.action);
    expect(actions).toContain("Editado: precio US$ 550 → US$ 600 estado Disponible → Reservado");
  });

  it("no deja marcar Vendido a mano ni editar siendo vendedor", async () => {
    const { data } = await c.admin.rpc("registrar_ingreso", base(testIMEI()));
    expect((await c.admin.rpc("editar_equipo", { p_device: data.device_id, p_price_usd: 600, p_status: "Vendido", p_notes: "" })).error).not.toBeNull();
    expect((await c.vendedor.rpc("editar_equipo", { p_device: data.device_id, p_price_usd: 1, p_status: "Disponible", p_notes: "" })).error?.message).toBe("Tu rol no puede editar el stock.");
  });

  it("nadie actualiza equipos directo, ni el administrador", async () => {
    const { data } = await c.admin.from("devices").update({ price_usd: 1 }).eq("model", "iPhone 15").select();
    expect(data).toEqual([]);
  });
});
