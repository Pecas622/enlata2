// Investigaciones contra la base: quién las guarda, quién las ve y cómo sus ideas pasan al calendario.
import { afterAll, describe, expect, it } from "vitest";
import { as, BRAND, fresh, service, WS } from "./helpers";

const created: string[] = [];
afterAll(async () => {
  const s = service();
  await s.from("brand_research").delete().in("id", created);
  await s.from("contents").delete().eq("source", "ia").eq("status", "Idea").like("topic", "Prueba investigación%");
});

const sample = {
  focus: "competencia",
  summary: "Resumen de prueba.",
  trends: [{ title: "Tema", detail: "Detalle", sources: ["https://example.com/a"] }],
  competitors: [],
  ideas: [
    { topic: "Prueba investigación: Reel del horno", why: "Lo hace la competencia.", channel: "Instagram", format: "Reel", goal: "Comunidad", sources: [] },
    { topic: "Prueba investigación: red falsa", why: "x", channel: "Fax", format: "Post", goal: "Vender", sources: [] },
  ],
  sources: [{ url: "https://example.com/a", title: "A" }],
};
const tomorrow = () => new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10);

describe("investigaciones", () => {
  it("sin sesión no se ven y nadie las escribe directo", async () => {
    const { data } = await fresh().from("brand_research").select("id");
    expect(data ?? []).toEqual([]);
    const admin = await as("admin");
    const { error } = await admin.from("brand_research").insert({ workspace_id: WS, brand_id: BRAND.espiga, summary: "x" });
    expect(error).not.toBeNull();
  });

  it("el Creador guarda una investigación; el Revisor la ve pero no investiga", async () => {
    const c = await as("creador");
    const { data: id, error } = await c.rpc("save_research", { p_brand_id: BRAND.espiga, p: sample });
    expect(error).toBeNull();
    created.push(id as string);
    const { data } = await service().from("brand_research").select("focus, created_by").eq("id", id).single();
    expect(data).toEqual({ focus: "competencia", created_by: "00000000-0000-4000-8000-0000000000a2" });
    const r = await as("revisor");
    expect((await r.from("brand_research").select("id").eq("id", id)).data).toHaveLength(1);
    expect((await r.rpc("save_research", { p_brand_id: BRAND.espiga, p: sample })).error?.message).toContain("Tu rol no investiga");
    expect((await c.rpc("save_research", { p_brand_id: BRAND.espiga, p: { ...sample, trends: [], ideas: [] } })).error?.message).toContain("no trajo nada");
  });

  it("una idea pasa al calendario una sola vez, con registro de dónde salió", async () => {
    const c = await as("creador");
    const { data: id } = await c.rpc("save_research", { p_brand_id: BRAND.espiga, p: sample });
    created.push(id as string);
    const day = tomorrow();
    expect((await c.rpc("add_research_idea", { p_research_id: id, p_index: 0, p_day: "2020-01-01" })).error?.message).toContain("de hoy en adelante");
    const { data: contentId, error } = await c.rpc("add_research_idea", { p_research_id: id, p_index: 0, p_day: day });
    expect(error).toBeNull();
    const { data: piece } = await service().from("contents").select("status, channel, format, publish_on, source").eq("id", contentId).single();
    expect(piece).toEqual({ status: "Idea", channel: "Instagram", format: "Reel", publish_on: day, source: "ia" });
    const { data: ev } = await service().from("content_events").select("action, note").eq("content_id", contentId);
    expect(ev).toEqual([{ action: "Sugerida por la investigación", note: "Lo hace la competencia." }]);
    const { data: saved } = await service().from("brand_research").select("ideas").eq("id", id).single();
    expect(saved!.ideas[0].content_id).toBe(contentId);
    expect((await c.rpc("add_research_idea", { p_research_id: id, p_index: 0, p_day: day })).error?.message).toContain("ya está en el calendario");
    expect((await c.rpc("add_research_idea", { p_research_id: id, p_index: 1, p_day: day })).error?.message).toContain("no existe");
    expect((await c.rpc("add_research_idea", { p_research_id: id, p_index: 5, p_day: day })).error?.message).toContain("Idea inexistente");
    const r = await as("revisor");
    expect((await r.rpc("add_research_idea", { p_research_id: id, p_index: 0, p_day: day })).error?.message).toContain("Tu rol no crea");
  });
});
