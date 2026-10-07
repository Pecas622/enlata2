// Demo para clientes: se carga en un local vacío y se borra para entregarlo.
import type { SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { as, fresh, PASSWORD, service, STORE } from "./helpers";

const email = `demo-${Date.now()}@prueba.test`;
let userId = "";
let storeId = "";
let ana: SupabaseClient;

const count = async (c: SupabaseClient, table: string) => (await c.from(table).select("*", { count: "exact", head: true })).count;
const seedDevices = async () => (await service().from("devices").select("*", { count: "exact", head: true }).eq("store_id", STORE)).count;

beforeAll(async () => {
  const { data: u } = await service().auth.admin.createUser({ email, password: PASSWORD, email_confirm: true });
  userId = u.user!.id;
  const { data } = await service().rpc("crear_local", { p_name: "Cliente", p_slug: `cliente-${Date.now()}`, p_admin: userId, p_admin_name: "Ana", p_pin: "1234" });
  storeId = data;
  ana = fresh();
  await ana.auth.signInWithPassword({ email, password: PASSWORD });
});

afterAll(async () => {
  if (userId) await service().auth.admin.deleteUser(userId);
  if (storeId) await service().from("stores").delete().eq("id", storeId);
});

describe("demo para clientes", () => {
  it("solo el administrador la carga y solo en un local vacío", async () => {
    expect((await (await as("encargado")).rpc("cargar_demo")).error?.message).toBe("Solo el Administrador puede cargar la demo.");
    expect((await (await as("admin")).rpc("cargar_demo")).error?.message).toBe("El local ya tiene datos. La demo solo se carga en un local vacío.");
    expect((await fresh().rpc("cargar_demo")).error).not.toBeNull();
  });

  it("carga stock, clientes y una semana de ventas y cajas en el local nuevo", async () => {
    const before = await seedDevices();
    expect((await ana.rpc("cargar_demo")).error).toBeNull();
    expect(await count(ana, "devices")).toBe(16); // 14 del stock + 2 que entraron por canje
    expect(await count(ana, "accessories")).toBe(14);
    expect(await count(ana, "clients")).toBe(5);
    expect(await count(ana, "sales")).toBe(10);
    expect((await ana.from("cash_shifts").select("status")).data!.filter((s) => s.status === "Abierta")).toHaveLength(1);
    expect(await count(ana, "trade_in_values")).toBeGreaterThan(0);
    expect((await ana.from("stores").select("demo_since").single()).data!.demo_since).not.toBeNull();
    // El local de prueba no se toca.
    expect(await seedDevices()).toBe(before);
    expect((await ana.rpc("cargar_demo")).error?.message).toBe("El local ya tiene datos. La demo solo se carga en un local vacío.");
  });

  it("borrar deja el local en cero y conserva usuarios y configuración", async () => {
    expect((await (await as("encargado")).rpc("borrar_demo")).error?.message).toBe("Solo el Administrador puede borrar la demo.");
    const { data, error } = await ana.rpc("borrar_demo");
    expect(error).toBeNull();
    expect(data).toEqual([]);
    for (const t of ["devices", "accessories", "clients", "sales", "cash_shifts", "cash_moves"]) expect(await count(ana, t), t).toBe(0);
    expect(await count(ana, "trade_in_values")).toBeGreaterThan(0);
    expect((await ana.from("profiles").select("name, role")).data).toEqual([{ name: "Ana", role: "Administrador" }]);
    expect((await ana.from("audit_log").select("detail")).data).toEqual([{ detail: "Se borraron los datos de demostración. El local quedó en cero." }]);
    expect((await ana.rpc("borrar_demo")).error?.message).toBe("Este local no tiene una demo cargada.");
    // Se puede volver a cargar, y la numeración arranca de nuevo.
    expect((await ana.rpc("cargar_demo")).error).toBeNull();
    expect((await ana.from("sales").select("number").order("number").limit(1).single()).data).toEqual({ number: "V-0001" });
  });
});
