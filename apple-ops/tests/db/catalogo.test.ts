// Catálogo público y cotizador: lo anónimo solo ve vistas sin costos, IMEI, clientes ni márgenes.
import type { SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { fresh, service, signInAll, STORE, type Who } from "./helpers";

let c: Record<Who, SupabaseClient>;
const base = { slug: "demo", headline: "Tu próximo iPhone, al mejor precio", tagline: "Equipos nuevos y usados con garantía, y plan canje.", whatsapp: "", published: true, show_accessories: true };

beforeAll(async () => {
  c = await signInAll();
});

afterAll(async () => {
  await c.admin.rpc("guardar_catalogo", { p: base });
});

const BANNED = ["imei", "cost_usd", "cost", "cost_ars", "client_id", "client_name", "notes", "target_margin", "margin", "cuit"];

describe("vistas públicas", () => {
  it("ninguna vista pública expone costos, IMEI, clientes ni márgenes", async () => {
    for (const view of ["catalogo_publico", "accesorios_publicos", "catalogo_config_publica", "tasacion_publica", "catalogo_estado"]) {
      const { data, error } = await fresh().from(view).select("*").limit(1);
      expect(error, view).toBeNull();
      expect(data!.length, view).toBe(1);
      for (const banned of BANNED) expect(Object.keys(data![0]), `${view}.${banned}`).not.toContain(banned);
    }
  });

  it("solo aparecen equipos disponibles", async () => {
    const { data } = await fresh().from("catalogo_publico").select("id");
    const ids = data!.map((d) => d.id);
    const { data: noDisp } = await service().from("devices").select("id").eq("store_id", STORE).neq("status", "Disponible");
    expect(noDisp!.length).toBeGreaterThan(0);
    for (const d of noDisp!) expect(ids).not.toContain(d.id);
  });

  it("con el catálogo pausado no se ve nada más que el nombre del local", async () => {
    expect((await c.encargado.rpc("guardar_catalogo", { p: { ...base, published: false } })).error).toBeNull();
    expect((await fresh().from("catalogo_publico").select("id")).data).toEqual([]);
    expect((await fresh().from("tasacion_publica").select("model")).data).toEqual([]);
    expect((await fresh().from("catalogo_estado").select("store_name, published").eq("slug", "demo").single()).data).toEqual({ store_name: "Tu Local Apple", published: false });
    expect((await c.encargado.rpc("guardar_catalogo", { p: base })).error).toBeNull();
  });
});

describe("panel del catálogo", () => {
  it("valida el link y el WhatsApp, y deja registro", async () => {
    expect((await c.admin.rpc("guardar_catalogo", { p: { ...base, slug: "Con Espacios" } })).error?.message).toBe("El link tiene que tener entre 3 y 40 letras, números o guiones.");
    expect((await c.admin.rpc("guardar_catalogo", { p: { ...base, whatsapp: "123" } })).error?.message).toContain("Revisá el WhatsApp");
    expect((await c.admin.rpc("guardar_catalogo", { p: { ...base, whatsapp: "+54 9 261 555-0000" } })).error).toBeNull();
    const { data } = await fresh().from("catalogo_config_publica").select("whatsapp").eq("slug", "demo").single();
    expect(data!.whatsapp).toBe("5492615550000");
    const { data: log } = await c.admin.from("audit_log").select("action").eq("action", "Catálogo");
    expect(log!.length).toBeGreaterThan(0);
  });

  it("vendedor y cajero no cambian el catálogo, ni directo", async () => {
    const { data: dev } = await c.admin.from("devices").select("id").eq("status", "Disponible").limit(1).single();
    for (const who of ["vendedor", "cajero"] as Who[]) {
      expect((await c[who].rpc("guardar_catalogo", { p: base })).error?.message).toBe("Tu rol no puede cambiar el catálogo.");
      expect((await c[who].rpc("catalogo_equipo", { p_device: dev!.id, p_visible: false, p_featured: false })).error?.message).toBe("Tu rol no puede cambiar el catálogo.");
    }
    const { error } = await c.admin.from("catalog_items").insert({ device_id: dev!.id, store_id: STORE, visible: false });
    expect(error).not.toBeNull();
  });

  it("destacar un equipo se ve en la vista pública", async () => {
    const { data: dev } = await c.admin.from("devices").select("id").eq("status", "Disponible").limit(1).single();
    await c.encargado.rpc("catalogo_equipo", { p_device: dev!.id, p_visible: true, p_featured: true });
    expect((await fresh().from("catalogo_publico").select("featured").eq("id", dev!.id).single()).data).toEqual({ featured: true });
    await c.encargado.rpc("catalogo_equipo", { p_device: dev!.id, p_visible: true, p_featured: false });
  });
});

describe("consultas", () => {
  it("un visitante anónimo registra la consulta, pero no la puede leer", async () => {
    const { data: dev } = await fresh().from("catalogo_publico").select("id").limit(1).single();
    expect((await fresh().rpc("registrar_consulta", { p_slug: "demo", p_item: dev!.id, p_label: "iPhone test" })).error).toBeNull();
    expect((await fresh().rpc("registrar_consulta", { p_slug: "no-existe", p_item: null, p_label: "x" })).error).toBeNull();
    const { data } = await c.encargado.from("assistant_chats").select("kind, topic, item_id").eq("topic", "iPhone test");
    expect(data).toEqual([{ kind: "click", topic: "iPhone test", item_id: dev!.id }]);
    expect((await fresh().from("assistant_chats").select("*")).data ?? []).toEqual([]);
    expect((await c.vendedor.from("assistant_chats").select("*")).data).toEqual([]);
  });
});
