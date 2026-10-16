// Campañas contra la base: quién las crea, piezas de la misma marca y registro.
import { afterAll, describe, expect, it } from "vitest";
import { as, BRAND, fresh, newPiece, service } from "./helpers";

const CAMP_ESPIGA = "00000000-0000-4000-8000-0000000000d1";
const C3_RODAR = "00000000-0000-4000-8000-0000000000c3";
const created: { campaigns: string[]; contents: string[] } = { campaigns: [], contents: [] };
afterAll(async () => {
  if (created.contents.length) await service().from("contents").delete().in("id", created.contents);
  if (created.campaigns.length) await service().from("campaigns").delete().in("id", created.campaigns);
});

const base = { brand_id: BRAND.espiga, name: "Prueba", goal: "Vender", starts_on: "2030-05-01", ends_on: "2030-05-10", budget: "30000" };

describe("campañas", () => {
  it("sin sesión no se ven y nadie las escribe directo", async () => {
    const { data } = await fresh().from("campaigns").select("id");
    expect(data ?? []).toEqual([]);
    const admin = await as("admin");
    const { error } = await admin.from("campaigns").insert({ workspace_id: "00000000-0000-4000-8000-000000000001", brand_id: BRAND.espiga, name: "x", starts_on: "2030-01-01", ends_on: "2030-01-02" });
    expect(error).not.toBeNull();
  });

  it("el Creador crea y edita, con registro; el Revisor solo mira", async () => {
    const c = await as("creador");
    const { data: id, error } = await c.rpc("save_campaign", { p_id: null, p: { ...base, name: "Prueba " + Date.now() } });
    expect(error).toBeNull();
    created.campaigns.push(id as string);
    const { error: e2 } = await c.rpc("save_campaign", { p_id: id, p: { ...base, name: "Prueba editada", budget: "45000" } });
    expect(e2).toBeNull();
    const { data } = await service().from("campaigns").select("name, budget, brand_id").eq("id", id).single();
    expect(data).toEqual({ name: "Prueba editada", budget: 45000, brand_id: BRAND.espiga });
    const { data: ev } = await service().from("campaign_events").select("action").eq("campaign_id", id).order("at");
    expect(ev!.map((e) => e.action)).toEqual(["Creó la campaña", "Editó la campaña"]);
    const r = await as("revisor");
    const { data: seen } = await r.from("campaigns").select("id").eq("id", id);
    expect(seen).toHaveLength(1);
    const { error: e3 } = await r.rpc("save_campaign", { p_id: id, p: base });
    expect(e3?.message).toContain("Tu rol no crea");
  });

  it("valida fechas y presupuesto", async () => {
    const c = await as("creador");
    const { error } = await c.rpc("save_campaign", { p_id: null, p: { ...base, ends_on: "2030-04-01" } });
    expect(error?.message).toContain("termina antes de empezar");
    const { error: e2 } = await c.rpc("save_campaign", { p_id: null, p: { ...base, budget: "-5" } });
    expect(e2?.message).toContain("no puede ser negativo");
  });

  it("guarda qué promociona y la página de destino, que tiene que ser una dirección web", async () => {
    const c = await as("creador");
    const { error: bad } = await c.rpc("save_campaign", { p_id: null, p: { ...base, link: "mi web" } });
    expect(bad?.message).toContain("tiene que empezar con https://");
    const { data: id, error } = await c.rpc("save_campaign", { p_id: null, p: { ...base, product: "Tortas por encargo", link: "https://laespiga.com.ar/tortas" } });
    expect(error).toBeNull();
    created.campaigns.push(id as string);
    // Editar sin mandar los campos nuevos (una versión anterior del formulario) no los borra.
    expect((await c.rpc("save_campaign", { p_id: id, p: { ...base, name: "Con página" } })).error).toBeNull();
    const { data } = await service().from("campaigns").select("product, link").eq("id", id).single();
    expect(data).toEqual({ product: "Tortas por encargo", link: "https://laespiga.com.ar/tortas" });
  });
});

describe("piezas de una campaña", () => {
  it("suma y saca una pieza, con registro en la pieza y en la campaña", async () => {
    const id = await newPiece();
    created.contents.push(id);
    const c = await as("creador");
    expect((await c.rpc("set_content_campaign", { p_content_id: id, p_campaign_id: CAMP_ESPIGA })).error).toBeNull();
    const { data } = await service().from("contents").select("campaign_id").eq("id", id).single();
    expect(data!.campaign_id).toBe(CAMP_ESPIGA);
    expect((await c.rpc("set_content_campaign", { p_content_id: id, p_campaign_id: null })).error).toBeNull();
    const { data: ev } = await service().from("content_events").select("action").eq("content_id", id).order("at");
    expect(ev!.map((e) => e.action)).toEqual(["Creada con plantilla", "Sumó a la campaña Día de la Madre", "Sacó de la campaña"]);
  });

  it("no mezcla marcas y el Revisor no arma campañas", async () => {
    const admin = await as("admin");
    const { error } = await admin.rpc("set_content_campaign", { p_content_id: C3_RODAR, p_campaign_id: CAMP_ESPIGA });
    expect(error?.message).toContain("otra marca");
    const r = await as("revisor");
    const { error: e2 } = await r.rpc("set_content_campaign", { p_content_id: C3_RODAR, p_campaign_id: null });
    expect(e2?.message).toContain("Tu rol no arma campañas");
  });
});
