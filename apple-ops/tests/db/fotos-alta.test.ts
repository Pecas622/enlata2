// Fotos del catálogo y alta de locales nuevos.
import type { SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { fresh, PASSWORD, service, signInAll, STORE, type Who } from "./helpers";

let c: Record<Who, SupabaseClient>;
let device: string;

beforeAll(async () => {
  c = await signInAll();
  const { data } = await c.admin.from("devices").select("id").eq("status", "Disponible").limit(1).single();
  device = data!.id;
});

describe("fotos de equipos", () => {
  it("encargado guarda la ruta, se ve en el catálogo público y recibe la anterior para borrarla", async () => {
    const p1 = `${STORE}/${device}-1.jpg`, p2 = `${STORE}/${device}-2.webp`;
    expect((await c.encargado.rpc("catalogo_equipo_foto", { p_device: device, p_path: p1 })).error).toBeNull();
    expect((await fresh().from("catalogo_publico").select("photo_path").eq("id", device).single()).data).toEqual({ photo_path: p1 });
    expect((await c.encargado.rpc("catalogo_equipo_foto", { p_device: device, p_path: p2 })).data).toBe(p1);
    expect((await c.admin.rpc("catalogo_equipo_foto", { p_device: device, p_path: null })).data).toBe(p2);
    expect((await fresh().from("catalogo_publico").select("photo_path").eq("id", device).single()).data).toEqual({ photo_path: null });
    const { data: log } = await c.admin.from("audit_log").select("detail").like("detail", "Nueva foto de %");
    expect(log!.length).toBeGreaterThan(0);
  });

  it("no acepta rutas de otro local u otro equipo, ni a vendedor o cajero", async () => {
    for (const bad of [`otro/${device}-1.jpg`, `${STORE}/${STORE}-1.jpg`, `${STORE}/${device}-1.gif`, `${STORE}/${device}-1.jpg/../x.jpg`]) {
      expect((await c.admin.rpc("catalogo_equipo_foto", { p_device: device, p_path: bad })).error?.message, bad).toBe("Ruta de foto inválida.");
    }
    for (const who of ["vendedor", "cajero"] as Who[]) {
      expect((await c[who].rpc("catalogo_equipo_foto", { p_device: device, p_path: null })).error?.message).toBe("Tu rol no puede cambiar el catálogo.");
    }
    expect((await fresh().rpc("catalogo_equipo_foto", { p_device: device, p_path: null })).error).not.toBeNull();
  });
});

describe("alta de un local nuevo", () => {
  const email = `alta-${Date.now()}@prueba.test`;
  let userId = "";
  let storeId = "";

  afterAll(async () => {
    if (userId) await service().auth.admin.deleteUser(userId);
    if (storeId) await service().from("stores").delete().eq("id", storeId);
  });

  it("solo la clave de servicio crea locales", async () => {
    const args = { p_name: "X", p_slug: "xxx", p_admin: STORE, p_admin_name: "X", p_pin: "1234" };
    expect((await fresh().rpc("crear_local", args)).error).not.toBeNull();
    expect((await c.admin.rpc("crear_local", args)).error).not.toBeNull();
  });

  it("crea el local con su administrador, aislado de los demás locales", async () => {
    const { data: u } = await service().auth.admin.createUser({ email, password: PASSWORD, email_confirm: true });
    userId = u.user!.id;
    expect((await service().rpc("crear_local", { p_name: "Nuevo", p_slug: "demo", p_admin: userId, p_admin_name: "Ana", p_pin: "1234" })).error?.message).toBe("El link /catalogo/demo ya lo usa otro local.");
    expect((await service().rpc("crear_local", { p_name: "Nuevo", p_slug: "nuevo-local", p_admin: userId, p_admin_name: "Ana", p_pin: "12a4" })).error?.message).toBe("El PIN tiene que tener 4 números.");
    const { data, error } = await service().rpc("crear_local", { p_name: "Nuevo", p_slug: "nuevo-local", p_admin: userId, p_admin_name: "Ana", p_pin: "1234" });
    expect(error).toBeNull();
    storeId = data;
    expect((await service().rpc("crear_local", { p_name: "Otro", p_slug: "otro-local", p_admin: userId, p_admin_name: "Ana", p_pin: "1234" })).error?.message).toBe("Esa cuenta ya pertenece a un local.");

    const ana = fresh();
    expect((await ana.auth.signInWithPassword({ email, password: PASSWORD })).error).toBeNull();
    expect((await ana.from("profiles").select("name, role, store_id")).data).toEqual([{ name: "Ana", role: "Administrador", store_id: storeId }]);
    expect((await ana.from("devices").select("id")).data).toEqual([]);
    expect((await ana.from("catalog_settings").select("slug, published").single()).data).toEqual({ slug: "nuevo-local", published: false });
    expect((await fresh().from("catalogo_estado").select("published").eq("slug", "nuevo-local").single()).data).toEqual({ published: false });
  });
});
