// Facturación electrónica: los datos fiscales los cambia solo el Administrador, el certificado y la
// clave privada no los lee nadie desde la app, y las facturas las escribe solo el servidor.
import type { SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PROFILE, STORE, fresh, service, signInAll, type Who } from "./helpers";

let c: Record<Who, SupabaseClient>;
const ALL = ["imei", "reportes", "catalogo", "asistente", "alertas", "facturacion"];
const SIN = ALL.filter((m) => m !== "facturacion");
const SERVICIO = "00000000-0000-4000-8000-200000000014"; // accesorio "Limpieza de equipo", $ 8.000
const setModules = (mods: string[]) => service().rpc("set_modulos", { p_slug: "demo", p_modules: mods });
const datos = { razon_social: "Local Test SRL", cuit: "20111111112", condicion_iva: "Responsable Inscripto", punto_venta: 5, ambiente: "homologacion", automatica: true };
const factura = { letra: "B", cbte_tipo: 6, punto_venta: 5, ambiente: "homologacion", doc_tipo: 99, doc_nro: "0", receptor_condicion: 5, neto: 6611.57, iva: 1388.43, total: 8000, alicuota_iva: 21 };

async function venta() {
  const { data, error } = await c.admin.rpc("registrar_venta", { p: {
    lines: [{ kind: "acc", accessory_id: SERVICIO, qty: 1 }], seller_id: PROFILE.admin, payments: [{ method: "Transferencia ARS", amount: 8000 }],
  } });
  if (error) throw error;
  return data.sale_id as string;
}

beforeAll(async () => {
  c = await signInAll();
});

afterAll(async () => {
  await service().from("invoices").delete().eq("store_id", STORE);
  await service().from("fiscal_settings").delete().eq("store_id", STORE);
  await service().from("fiscal_credentials").delete().eq("store_id", STORE);
  await setModules(ALL);
});

describe("facturación", () => {
  it("es un módulo con precio", async () => {
    const { data } = await fresh().from("plan_prices").select("price_ars").eq("item", "facturacion").single();
    expect(Number(data!.price_ars)).toBeGreaterThan(0);
    expect((await setModules(ALL)).data).toEqual(ALL);
  });

  it("los datos fiscales los guarda solo el Administrador, con un CUIT válido", async () => {
    await setModules(ALL);
    for (const who of ["encargado", "vendedor", "cajero"] as const) {
      expect((await c[who].rpc("guardar_datos_fiscales", { p: datos })).error?.message).toMatch(/Solo el Administrador/);
    }
    expect((await c.admin.rpc("guardar_datos_fiscales", { p: { ...datos, cuit: "123" } })).error?.message).toMatch(/CUIT/);
    expect((await c.admin.rpc("guardar_datos_fiscales", { p: datos })).error).toBeNull();
    const { data } = await c.vendedor.from("fiscal_settings").select("razon_social, punto_venta").single();
    expect(data).toEqual({ razon_social: "Local Test SRL", punto_venta: 5 });
    expect((await c.admin.from("fiscal_settings").update({ punto_venta: 9 }).eq("store_id", STORE).select()).data ?? []).toHaveLength(0);
    expect((await fresh().from("fiscal_settings").select("*")).data ?? []).toHaveLength(0);
  });

  it("nadie lee ni escribe el certificado desde la app", async () => {
    await service().from("fiscal_credentials").upsert({ store_id: STORE, key_enc: "v1.x.y.z", cert_pem: "CERT" });
    for (const cl of [c.admin, c.encargado, fresh()]) {
      expect((await cl.from("fiscal_credentials").select("*")).data ?? []).toHaveLength(0);
      expect((await cl.from("fiscal_credentials").update({ cert_pem: "X" }).eq("store_id", STORE).select()).data ?? []).toHaveLength(0);
    }
    const { data } = await service().from("fiscal_credentials").select("cert_pem").eq("store_id", STORE).single();
    expect(data!.cert_pem).toBe("CERT");
  });

  it("las facturas las escribe solo el servidor y las lee el local", async () => {
    const sale = await venta();
    for (const cl of [c.admin, fresh()]) {
      expect((await cl.rpc("factura_preparar", { p_sale: sale, p_kind: "Factura", p_user: PROFILE.admin, p: factura })).error).not.toBeNull();
      expect((await cl.from("invoices").insert({ store_id: STORE, sale_id: sale, kind: "Factura", ...factura })).error).not.toBeNull();
    }
    const { data: inv, error } = await service().rpc("factura_preparar", { p_sale: sale, p_kind: "Factura", p_user: PROFILE.admin, p: factura });
    expect(error).toBeNull();
    expect(inv).toMatchObject({ status: "Pendiente", letra: "B", total: 8000 });
    expect((await c.admin.rpc("factura_resultado", { p_id: inv.id, p_status: "Emitida", p_numero: 1, p_fecha: "2026-10-08", p_cae: "1", p_cae_vence: null, p_error: "", p_user: PROFILE.admin })).error).not.toBeNull();

    // Sin la factura emitida no hay nota de crédito.
    expect((await service().rpc("factura_preparar", { p_sale: sale, p_kind: "Nota de crédito", p_user: PROFILE.admin, p: { ...factura, cbte_tipo: 8 } })).error?.message).toMatch(/no tiene factura emitida/);

    await service().rpc("factura_intento", { p_id: inv.id, p_numero: 41, p_fecha: "2026-10-08" });
    // Con un número ya pedido, preparar de nuevo no cambia nada: primero hay que confirmarlo con ARCA.
    const again = (await service().rpc("factura_preparar", { p_sale: sale, p_kind: "Factura", p_user: PROFILE.admin, p: { ...factura, total: 1 } })).data;
    expect(again).toMatchObject({ id: inv.id, numero: 41, total: 8000 });

    expect((await service().rpc("factura_resultado", { p_id: inv.id, p_status: "Emitida", p_numero: 41, p_fecha: "2026-10-08", p_cae: "76000000000001",
      p_cae_vence: "2026-10-18", p_error: "", p_user: PROFILE.cajero })).error).toBeNull();
    const { data: leida } = await c.cajero.from("invoices").select("status, numero, cae").eq("id", inv.id).single();
    expect(leida).toEqual({ status: "Emitida", numero: 41, cae: "76000000000001" });
    expect((await fresh().from("invoices").select("id")).data ?? []).toHaveLength(0);

    // Una factura emitida no se pisa.
    await service().rpc("factura_resultado", { p_id: inv.id, p_status: "Rechazada", p_numero: null, p_fecha: null, p_cae: "", p_cae_vence: null, p_error: "x", p_user: PROFILE.admin });
    expect((await service().from("invoices").select("status, cae").eq("id", inv.id).single()).data).toEqual({ status: "Emitida", cae: "76000000000001" });

    const { data: log } = await service().from("audit_log").select("user_name, detail").eq("store_id", STORE).eq("action", "Facturación").order("at", { ascending: false }).limit(1).single();
    expect(log).toEqual({ user_name: "Caro", detail: expect.stringMatching(/^Factura B 00005-00000041 de la venta V-\d+, CAE 76000000000001$/) });
  });

  it("sin el módulo no se factura", async () => {
    const sale = await venta();
    await setModules(SIN);
    expect((await service().rpc("factura_preparar", { p_sale: sale, p_kind: "Factura", p_user: PROFILE.admin, p: factura })).error?.message).toMatch(/módulo de facturación/);
    expect((await c.admin.rpc("guardar_datos_fiscales", { p: datos })).error?.message).toMatch(/módulo de facturación/);
  });
});
