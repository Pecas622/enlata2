// Ventas, plan canje y anulaciones: siempre por las funciones SQL, que calculan totales, tasan el
// canje, controlan los permisos del rol y dejan stock, caja, historial y registro consistentes.
import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeAll, describe, expect, it } from "vitest";
import { appraise } from "@/lib/appraise";
import { DEFECTS } from "@/lib/catalog";
import { loadStoreConfig, type StoreConfig } from "@/lib/store";
import { PROFILE, openShiftId, signInAll, testIMEI, withShiftClosed, type Who } from "./helpers";

let c: Record<Who, SupabaseClient>;
let cfg: StoreConfig;
const SERVICIO = "00000000-0000-4000-8000-200000000014"; // "Limpieza de equipo", $ 8.000, stock 99

beforeAll(async () => {
  c = await signInAll();
  cfg = await loadStoreConfig(c.admin);
});

// Equipo nuevo para cada prueba, así se pueden correr sin resetear la base.
async function equipo(price = 550) {
  const { data, error } = await c.admin.rpc("registrar_ingreso", {
    p_kind: "iPhone", p_model: "iPhone 14", p_capacity: 128, p_color: "Negro", p_condition: "Usado A", p_imei: testIMEI(),
    p_battery: 90, p_origin: "Proveedor", p_cost_usd: 450, p_price_usd: price,
  });
  if (error) throw error;
  return data.device_id as string;
}

const venta = (deviceId: string, extra: Record<string, unknown> = {}) => ({
  lines: [{ kind: "device", device_id: deviceId }, { kind: "acc", accessory_id: SERVICIO, qty: 1 }],
  seller_id: PROFILE.vendedor,
  payments: [{ method: "Efectivo USD", amount: 550 }, { method: "Transferencia ARS", amount: 8000 }],
  ...extra,
});

const canje = (extra: Record<string, unknown> = {}) => ({
  kind: "iPhone", model: "iPhone 13", capacity: 128, color: "Azul", cond: "Usado B", battery: 86, defects: [],
  icloud_free: true, imei_clean: true, imei: testIMEI(), ...extra,
});

async function stockDe(id: string) {
  return (await c.admin.from("accessories").select("stock").eq("id", id).single()).data!.stock as number;
}

describe("tasar_canje", () => {
  it("da lo mismo que appraise() de la app", async () => {
    const cases = [];
    for (const { model, capacity } of cfg.baseValues.slice(0, 6))
      for (const cond of ["Usado A", "Usado B", "Reacondicionado"])
        for (const battery of [100, 89, 79])
          cases.push({ model, capacity, cond, battery, defects: battery === 79 ? [DEFECTS[0], DEFECTS[1]] : [] });
    cases.push({ model: "iPhone 3G", capacity: 8, cond: "Usado A", battery: 90, defects: [] });
    for (const d of cases) {
      const { data, error } = await c.vendedor.rpc("tasar_canje", {
        p_model: d.model, p_capacity: d.capacity, p_cond: d.cond, p_battery: d.battery, p_defects: d.defects,
      });
      expect(error).toBeNull();
      const ap = appraise(cfg, d);
      expect({ ok: data.ok, value: data.value, lines: data.lines ?? [] }).toEqual({ ok: ap.ok, value: ap.value, lines: ap.lines });
    }
  });

  it("rechaza iCloud activo e IMEI bloqueado", async () => {
    const icloud = await c.vendedor.rpc("tasar_canje", { p_model: "iPhone 13", p_capacity: 128, p_cond: "Usado A", p_battery: 90, p_icloud_free: false });
    expect(icloud.data).toMatchObject({ ok: false, blocked: true });
    const imei = await c.vendedor.rpc("tasar_canje", { p_model: "iPhone 13", p_capacity: 128, p_cond: "Usado A", p_battery: 90, p_imei_clean: false });
    expect(imei.data.reason).toContain("IMEI");
  });
});

describe("registrar_venta", () => {
  it("el vendedor vende: stock, caja, historial y registro quedan al día", async () => {
    const dev = await equipo();
    const antes = await stockDe(SERVICIO);
    const { data, error } = await c.vendedor.rpc("registrar_venta", { p: venta(dev, { client_name: "Cliente Test", client_phone: "+54 9 261 000 0000" }) });
    expect(error).toBeNull();
    expect(data.number).toMatch(/^V-\d{4}$/);

    const { data: sale } = await c.vendedor.from("sales").select("*").eq("id", data.sale_id).single();
    expect(Number(sale!.total_usd)).toBeCloseTo(550 + 8000 / cfg.fx, 2);
    expect(sale).toMatchObject({ status: "Cerrada", client_name: "Cliente Test", seller_id: PROFILE.vendedor, cashier_id: PROFILE.vendedor, shift_id: await openShiftId() });
    expect(sale!.client_id).not.toBeNull();

    const { data: d } = await c.admin.from("devices").select("status, sold_sale_id").eq("id", dev).single();
    expect(d).toEqual({ status: "Vendido", sold_sale_id: data.sale_id });
    expect(await stockDe(SERVICIO)).toBe(antes - 1);

    const { data: moves } = await c.admin.from("cash_moves").select("type, method, currency, amount").eq("sale_id", data.sale_id).order("method");
    expect(moves!.map((m) => [m.type, m.method, m.currency, Number(m.amount)])).toEqual([
      ["Ingreso", "Efectivo USD", "USD", 550],
      ["Ingreso", "Transferencia ARS", "ARS", 8000],
    ]);
    const { data: ev } = await c.admin.from("device_events").select("action").eq("device_id", dev).order("at", { ascending: false }).limit(1);
    expect(ev![0].action).toBe(`Vendido en ${data.number}`);
    const { data: log } = await c.admin.from("audit_log").select("action, user_name").ilike("detail", `${data.number} ·%`);
    expect(log).toEqual([{ action: "Venta", user_name: "Mati" }]);
  });

  it("el costo de la venta queda guardado, pero el vendedor no lo ve", async () => {
    const { data } = await c.vendedor.rpc("registrar_venta", { p: venta(await equipo()) });
    const { data: lines } = await c.admin.from("sale_lines").select("id, sale_line_costs(unit_cost)").eq("sale_id", data.sale_id).eq("kind", "device");
    expect(Number((lines![0].sale_line_costs as unknown as { unit_cost: number }).unit_cost)).toBe(450);
    const { data: vend } = await c.vendedor.from("sale_line_costs").select("*").eq("sale_line_id", lines![0].id);
    expect(vend).toEqual([]);
  });

  it("sin caja abierta no se vende", async () => {
    const dev = await equipo();
    const { error } = await withShiftClosed(() => c.vendedor.rpc("registrar_venta", { p: venta(dev) }));
    expect(error?.message).toBe("No hay caja abierta. Abrí la caja para registrar ventas.");
  });

  it("el vendedor no cambia precios ni pasa el descuento máximo; el encargado sí", async () => {
    const dev = await equipo();
    const precio = venta(dev, { lines: [{ kind: "device", device_id: dev, unit_price: 500 }], payments: [{ method: "Efectivo USD", amount: 500 }] });
    expect((await c.vendedor.rpc("registrar_venta", { p: precio })).error?.message).toBe("Tu rol no puede cambiar precios.");
    const desc = venta(dev, { discount_pct: 10 });
    expect((await c.vendedor.rpc("registrar_venta", { p: desc })).error?.message).toBe("Tu rol permite hasta 5% de descuento.");
    expect((await c.encargado.rpc("registrar_venta", { p: precio })).error).toBeNull();
  });

  it("los pagos tienen que cerrar con el total", async () => {
    const dev = await equipo();
    const falta = await c.vendedor.rpc("registrar_venta", { p: venta(dev, { payments: [{ method: "Efectivo USD", amount: 500 }] }) });
    expect(falta.error?.message).toBe("Falta cobrar US$ 57.");
    const sobra = await c.vendedor.rpc("registrar_venta", { p: venta(dev, { payments: [{ method: "Efectivo USD", amount: 600 }] }) });
    expect(sobra.error?.message).toBe("Hay US$ 43 de más: ajustá los pagos.");
  });

  it("un equipo no se vende dos veces y un accesorio no se vende sin stock", async () => {
    const dev = await equipo();
    expect((await c.vendedor.rpc("registrar_venta", { p: venta(dev) })).error).toBeNull();
    expect((await c.vendedor.rpc("registrar_venta", { p: venta(dev) })).error?.message).toContain("ya no está disponible (Vendido)");
    const sinStock = "00000000-0000-4000-8000-200000000006";
    const { error } = await c.vendedor.rpc("registrar_venta", {
      p: { lines: [{ kind: "acc", accessory_id: sinStock, qty: 1 }], seller_id: PROFILE.vendedor, payments: [{ method: "Efectivo ARS", amount: 11000 }] },
    });
    expect(error?.message).toBe("No hay stock suficiente de Vidrio privacidad iPhone 15 Pro (quedan 0).");
  });

  it("un concepto libre se cobra sin tocar stock", async () => {
    const { data, error } = await c.cajero.rpc("registrar_venta", {
      p: { lines: [{ kind: "service", description: "Colocación de vidrio", unit_price: 5000 }], seller_id: PROFILE.vendedor, payments: [{ method: "Efectivo ARS", amount: 5000 }] },
    });
    expect(error).toBeNull();
    const { data: lines } = await c.cajero.from("sale_lines").select("kind, description, currency").eq("sale_id", data.sale_id);
    expect(lines).toEqual([{ kind: "service", description: "Colocación de vidrio", currency: "ARS" }]);
  });
});

describe("plan canje", () => {
  it("el equipo del cliente entra al stock al valor tasado y la diferencia se cobra", async () => {
    const dev = await equipo();
    const ti = canje();
    const valor = appraise(cfg, { ...ti }).value; // 320
    const total = 550 + 8000 / cfg.fx;
    const { data, error } = await c.vendedor.rpc("registrar_venta", {
      p: venta(dev, { trade_in: ti, payments: [{ method: "Efectivo USD", amount: 230 }, { method: "Transferencia ARS", amount: 8000 }] }),
    });
    expect(error).toBeNull();
    const { data: sale } = await c.vendedor.from("sales").select("trade_in_usd, paid_usd, total_usd").eq("id", data.sale_id).single();
    expect(Number(sale!.trade_in_usd)).toBe(valor);
    expect(Number(sale!.paid_usd)).toBeCloseTo(total - valor, 2);

    const { data: t } = await c.admin.from("trade_ins").select("device_id, value_usd, resale_usd, devices(status, origin, imei, price_usd, device_costs(cost_usd))").eq("sale_id", data.sale_id).single();
    const nuevo = t!.devices as unknown as { status: string; origin: string; imei: string; price_usd: number; device_costs: { cost_usd: number } };
    expect(nuevo).toMatchObject({ status: "Disponible", origin: "Canje", imei: ti.imei });
    expect(Number(nuevo.device_costs.cost_usd)).toBe(valor);
    expect(Number(nuevo.price_usd)).toBe(Number(t!.resale_usd));
    const { data: log } = await c.admin.from("audit_log").select("detail").ilike("detail", `${data.number} ·%`);
    expect(log![0].detail).toContain(`con canje US$ ${valor}`);
  });

  it("el vendedor no toma por encima de la tasación; el encargado sí", async () => {
    const p = (devId: string) => venta(devId, {
      lines: [{ kind: "device", device_id: devId }],
      trade_in: canje({ value_usd: 400 }),
      payments: [{ method: "Efectivo USD", amount: 150 }],
    });
    const dev = await equipo();
    expect((await c.vendedor.rpc("registrar_venta", { p: p(dev) })).error?.message)
      .toBe("Tu rol no permite tomar el equipo por encima de US$ 320. Pedí autorización al encargado.");
    expect((await c.encargado.rpc("registrar_venta", { p: p(dev) })).error).toBeNull();
  });

  it("rechaza iCloud activo, IMEI repetido, canje mayor a la compra y al cajero", async () => {
    const dev = await equipo();
    const icloud = await c.vendedor.rpc("registrar_venta", { p: venta(dev, { trade_in: canje({ icloud_free: false }) }) });
    expect(icloud.error?.message).toContain("iCloud");
    const enStock = (await c.admin.from("devices").select("imei").eq("id", dev).single()).data!.imei;
    const repetido = await c.vendedor.rpc("registrar_venta", { p: venta(await equipo(), { trade_in: canje({ imei: enStock }) }) });
    expect(repetido.error?.message).toBe("El IMEI del equipo que entrega el cliente ya está en stock.");
    const barato = await c.encargado.rpc("registrar_venta", {
      p: { lines: [{ kind: "acc", accessory_id: SERVICIO, qty: 1 }], seller_id: PROFILE.vendedor, trade_in: canje(), payments: [] },
    });
    expect(barato.error?.message).toBe("El valor del canje supera el total de la compra.");
    const cajero = await c.cajero.rpc("registrar_venta", { p: venta(dev, { trade_in: canje() }) });
    expect(cajero.error?.message).toBe("Tu rol no puede tomar equipos en canje.");
  });
});

describe("anular_venta", () => {
  it("revierte stock, caja y canje, con motivo y registro", async () => {
    const dev = await equipo();
    const ti = canje();
    const antes = await stockDe(SERVICIO);
    const { data } = await c.vendedor.rpc("registrar_venta", {
      p: venta(dev, { trade_in: ti, payments: [{ method: "Efectivo USD", amount: 230 }, { method: "Transferencia ARS", amount: 8000 }] }),
    });

    expect((await c.vendedor.rpc("anular_venta", { p_sale: data.sale_id, p_reason: "x" })).error?.message).toBe("Tu rol no puede anular ventas.");
    expect((await c.encargado.rpc("anular_venta", { p_sale: data.sale_id, p_reason: " " })).error?.message).toBe("Escribí el motivo de la anulación.");
    expect((await c.encargado.rpc("anular_venta", { p_sale: data.sale_id, p_reason: "El cliente se arrepintió" })).error).toBeNull();

    const { data: sale } = await c.admin.from("sales").select("status, void_reason, voided_by").eq("id", data.sale_id).single();
    expect(sale).toEqual({ status: "Anulada", void_reason: "El cliente se arrepintió", voided_by: PROFILE.encargado });
    expect((await c.admin.from("devices").select("status, sold_sale_id").eq("id", dev).single()).data).toEqual({ status: "Disponible", sold_sale_id: null });
    expect(await stockDe(SERVICIO)).toBe(antes);
    const { data: recibido } = await c.admin.from("devices").select("status").eq("imei", ti.imei).single();
    expect(recibido!.status).toBe("Retirado");

    const { data: moves } = await c.admin.from("cash_moves").select("type, method, amount").eq("sale_id", data.sale_id).eq("type", "Egreso").order("method");
    expect(moves!.map((m) => [m.method, Number(m.amount)])).toEqual([["Efectivo USD", 230], ["Transferencia ARS", 8000]]);
    const { data: log } = await c.admin.from("audit_log").select("action, user_name").eq("detail", `${data.number} · El cliente se arrepintió`);
    expect(log).toEqual([{ action: "Venta anulada", user_name: "Lucía" }]);

    expect((await c.encargado.rpc("anular_venta", { p_sale: data.sale_id, p_reason: "otra vez" })).error?.message).toBe(`La venta ${data.number} ya está anulada.`);
  });

  it("si el equipo del canje ya se vendió, pide anular esa venta primero", async () => {
    const ti = canje();
    const { data: primera } = await c.vendedor.rpc("registrar_venta", {
      p: venta(await equipo(), { trade_in: ti, payments: [{ method: "Efectivo USD", amount: 230 }, { method: "Transferencia ARS", amount: 8000 }] }),
    });
    const recibido = (await c.admin.from("trade_ins").select("device_id").eq("sale_id", primera.sale_id).single()).data!.device_id;
    const { data: precio } = await c.admin.from("devices").select("price_usd").eq("id", recibido).single();
    const { data: segunda, error } = await c.vendedor.rpc("registrar_venta", {
      p: { lines: [{ kind: "device", device_id: recibido }], seller_id: PROFILE.vendedor, payments: [{ method: "Efectivo USD", amount: Number(precio!.price_usd) }] },
    });
    expect(error).toBeNull();
    const { error: bloqueo } = await c.encargado.rpc("anular_venta", { p_sale: primera.sale_id, p_reason: "prueba" });
    expect(bloqueo?.message).toBe(`El equipo recibido en canje ya se vendió en ${segunda.number}. Anulá esa venta primero.`);
  });

  it("sin caja abierta no se puede devolver el dinero", async () => {
    const { data } = await c.vendedor.rpc("registrar_venta", { p: venta(await equipo()) });
    const { error } = await withShiftClosed(() => c.encargado.rpc("anular_venta", { p_sale: data.sale_id, p_reason: "prueba" }));
    expect(error?.message).toBe("Abrí la caja para registrar la devolución del dinero.");
  });
});
