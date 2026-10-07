// Accesorios y clientes: altas, ediciones y reposiciones solo por funciones, con stock, costo y registro.
import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeAll, describe, expect, it } from "vitest";
import { STORE, signInAll, type Who } from "./helpers";

let c: Record<Who, SupabaseClient>;
const uniq = () => `${Date.now()}${Math.floor(Math.random() * 1000)}`;

beforeAll(async () => {
  c = await signInAll();
});

async function nuevo(extra: Record<string, unknown> = {}) {
  const { data, error } = await c.encargado.rpc("guardar_accesorio", {
    p_id: null, p_name: `Funda test ${uniq()}`, p_category: "Fundas", p_price_ars: 10000, p_min_stock: 2, p_cost_ars: 4000, p_stock: 10, ...extra,
  });
  if (error) throw error;
  return data as string;
}

const leer = async (id: string) =>
  (await c.admin.from("accessories").select("sku, name, price_ars, stock, min_stock, accessory_costs(cost_ars)").eq("id", id).single()).data!;

describe("accesorios", () => {
  it("el alta genera SKU por categoría, guarda el costo y el stock inicial como movimiento", async () => {
    const id = await nuevo();
    const a = await leer(id);
    expect(a.sku).toMatch(/^FUN-\d{3}$/);
    expect(a.stock).toBe(10);
    expect(Number((a.accessory_costs as unknown as { cost_ars: number }).cost_ars)).toBe(4000);
    const { data: moves } = await c.admin.from("accessory_moves").select("qty, note").eq("accessory_id", id);
    expect(moves).toEqual([{ qty: 10, note: "Stock inicial" }]);
    const { data: log } = await c.admin.from("audit_log").select("action, user_name").eq("detail", `${a.sku} · ${a.name}`);
    expect(log).toEqual([{ action: "Accesorio nuevo", user_name: "Lucía" }]);
  });

  it("los SKU siguen al mayor usado, sin repetir", async () => {
    const a = await leer(await nuevo());
    const b = await leer(await nuevo());
    expect(Number(b.sku.slice(4))).toBe(Number(a.sku.slice(4)) + 1);
    const dup = await c.encargado.rpc("guardar_accesorio", { p_id: null, p_name: "x", p_category: "Fundas", p_price_ars: 1, p_sku: a.sku });
    expect(dup.error?.message).toBe(`El SKU ${a.sku} ya existe.`);
  });

  it("la reposición suma stock y recalcula el costo promedio", async () => {
    const id = await nuevo();
    expect((await c.encargado.rpc("reponer_accesorio", { p_id: id, p_qty: 10, p_unit_cost: 6000 })).error).toBeNull();
    const a = await leer(id);
    expect(a.stock).toBe(20);
    expect(Number((a.accessory_costs as unknown as { cost_ars: number }).cost_ars)).toBe(5000);
    const { data: moves } = await c.admin.from("accessory_moves").select("qty, note").eq("accessory_id", id).order("at");
    expect(moves![1]).toEqual({ qty: 10, note: "Reposición a $ 6000 c/u" });
  });

  it("editar cambia precio y mínimo, pero no el stock", async () => {
    const id = await nuevo();
    const a = await leer(id);
    const { error } = await c.admin.rpc("guardar_accesorio", { p_id: id, p_name: a.name, p_category: "Fundas", p_price_ars: 12000, p_min_stock: 5, p_stock: 999 });
    expect(error).toBeNull();
    expect(await leer(id)).toMatchObject({ price_ars: 12000, min_stock: 5, stock: 10 });
    const { data: log } = await c.admin.from("audit_log").select("detail").eq("action", "Accesorio editado").like("detail", `${a.sku} ·%`);
    expect(log![0].detail).toContain("precio $ 10000 → $ 12000");
  });

  it("vendedor y cajero no cargan, editan ni reponen; tampoco escriben directo", async () => {
    const id = await nuevo();
    for (const who of ["vendedor", "cajero"] as Who[]) {
      expect((await c[who].rpc("guardar_accesorio", { p_id: null, p_name: "x", p_category: "Otros", p_price_ars: 1 })).error?.message)
        .toBe("Tu rol no puede cargar ni editar accesorios.");
      expect((await c[who].rpc("reponer_accesorio", { p_id: id, p_qty: 5 })).error?.message).toBe("Tu rol no puede reponer stock.");
    }
    const { data } = await c.admin.from("accessories").update({ stock: 0 }).eq("id", id).select();
    expect(data ?? []).toEqual([]);
    expect((await leer(id)).stock).toBe(10);
  });

  it("carga masiva: categoría desconocida va a Otros", async () => {
    const tag = uniq();
    const { data, error } = await c.encargado.rpc("carga_masiva_accesorios", {
      p_rows: [
        { name: `Funda masiva ${tag}`, category: "Fundas", cost: 3800, price: 12500, stock: 10 },
        { name: `Cosa masiva ${tag}`, category: "Inexistente", cost: 100, price: 900, stock: 0 },
      ],
    });
    expect(error).toBeNull();
    expect(data).toBe(2);
    const { data: rows } = await c.admin.from("accessories").select("category, stock").like("name", `%masiva ${tag}`).order("name");
    expect(rows).toEqual([{ category: "Otros", stock: 0 }, { category: "Fundas", stock: 10 }]);
  });
});

describe("clientes", () => {
  it("cualquier rol da de alta y edita clientes, con registro", async () => {
    const name = `Cliente ${uniq()}`;
    const { data: id, error } = await c.cajero.rpc("guardar_cliente", { p_id: null, p_name: name, p_phone: "+54 9 261 000 1111" });
    expect(error).toBeNull();
    expect((await c.vendedor.rpc("guardar_cliente", { p_id: id, p_name: name, p_dni: uniq().slice(-8) })).error).toBeNull();
    const { data: log } = await c.admin.from("audit_log").select("action, user_name").eq("detail", name).order("at");
    expect(log).toEqual([{ action: "Cliente nuevo", user_name: "Caro" }, { action: "Cliente editado", user_name: "Mati" }]);
  });

  it("no repite DNI ni acepta nombre vacío, y no se escribe directo", async () => {
    expect((await c.vendedor.rpc("guardar_cliente", { p_id: null, p_name: "Otro", p_dni: "30111222" })).error?.message)
      .toBe("Ya hay un cliente con DNI 30111222.");
    expect((await c.vendedor.rpc("guardar_cliente", { p_id: null, p_name: " " })).error?.message).toBe("Escribí el nombre del cliente.");
    const { error } = await c.vendedor.from("clients").insert({ store_id: STORE, name: "Directo" });
    expect(error).not.toBeNull();
  });

  it("el resumen cuenta solo ventas cerradas", async () => {
    const { data } = await c.vendedor.from("clientes_resumen").select("name, compras, total_usd").eq("name", "Juan Pérez").single();
    expect(data!.compras).toBeGreaterThanOrEqual(2);
    expect(Number(data!.total_usd)).toBeGreaterThan(1000);
  });
});
