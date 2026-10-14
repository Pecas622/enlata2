// Plan del mes contra la base: los campos nuevos de la marca y la pieza, quién guarda planes y cómo sus piezas
// pasan al calendario (desde la base, una sola vez, con registro).
import { afterAll, describe, expect, it } from "vitest";
import { as, BRAND, fresh, newPiece, service, WS } from "./helpers";

const plans: string[] = [];
afterAll(async () => {
  const s = service();
  await s.from("content_plans").delete().in("id", plans);
  await s.from("contents").delete().like("topic", "Prueba plan%");
});

const day = (n: number) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
const month = day(2).slice(0, 7);
const item = (n: number, extra: Record<string, unknown> = {}) => ({
  publish_on: day(2), post_time: "19:30", channel: "Instagram", format: "Reel", goal: "Comunidad", topic: `Prueba plan ${n}`, title: `Prueba ${n}`,
  hook: "¿Sabés cómo se hace?", structure: "0-3 s: gancho", body: "Texto de la pieza. Pedí por WhatsApp.", hashtags: "#laespiga", cta: "Pedí por WhatsApp",
  resources: "Video vertical", rationale: "Porque el público pide ver el proceso.", ...extra,
});

describe("marca y pieza para planificar", () => {
  it("save_brand guarda redes, frecuencia y presupuesto, y una llamada vieja no los borra", async () => {
    const admin = await as("admin");
    const { data: before } = await service().from("brands").select("*").eq("id", BRAND.rodar).single();
    const base = { name: before!.name, tone: before!.tone, color: before!.color };
    expect((await admin.rpc("save_brand", { p_id: BRAND.rodar, p: { ...base, channels: ["Instagram", "TikTok"], posts_per_week: 5, ad_budget: 90000, goals: "Turnos" } })).error).toBeNull();
    let { data } = await service().from("brands").select("channels, posts_per_week, ad_budget, goals").eq("id", BRAND.rodar).single();
    expect(data).toEqual({ channels: ["Instagram", "TikTok"], posts_per_week: 5, ad_budget: 90000, goals: "Turnos" });
    await admin.rpc("save_brand", { p_id: BRAND.rodar, p: base });
    ({ data } = await service().from("brands").select("channels, posts_per_week, ad_budget, goals").eq("id", BRAND.rodar).single());
    expect(data).toEqual({ channels: ["Instagram", "TikTok"], posts_per_week: 5, ad_budget: 90000, goals: "Turnos" });
    expect((await admin.rpc("save_brand", { p_id: BRAND.rodar, p: { ...base, channels: ["Fax"] } })).error?.message).toContain("no existe");
    expect((await admin.rpc("save_brand", { p_id: BRAND.rodar, p: { ...base, channels: [] } })).error?.message).toContain("al menos una red");
    expect((await admin.rpc("save_brand", { p_id: BRAND.rodar, p: { ...base, posts_per_week: 9 } })).error?.message).toContain("de 1 a 7");
    // Vuelve a como estaba.
    await admin.rpc("save_brand", { p_id: BRAND.rodar, p: { ...base, channels: before!.channels, posts_per_week: before!.posts_per_week, ad_budget: before!.ad_budget, goals: before!.goals } });
  });

  it("save_content edita gancho, estructura, horario y por qué; aprobada vuelve a borrador como siempre", async () => {
    const id = await newPiece();
    const c = await as("creador");
    expect((await c.rpc("save_content", { p_id: id, p: { hook: "Gancho", structure: "1. a", post_time: "12:30", rationale: "Porque sí", resources: "Foto" } })).error).toBeNull();
    const { data } = await service().from("contents").select("hook, structure, post_time, rationale, resources, body").eq("id", id).single();
    expect(data).toEqual({ hook: "Gancho", structure: "1. a", post_time: "12:30:00", rationale: "Porque sí", resources: "Foto", body: "Texto de prueba. Pedí por WhatsApp." });
    await c.rpc("save_content", { p_id: id, p: { post_time: "" } });
    expect((await service().from("contents").select("post_time").eq("id", id).single()).data!.post_time).toBeNull();
  });
});

describe("planes del mes", () => {
  it("sin sesión no se ven y nadie los escribe directo; el Revisor no arma planes", async () => {
    expect((await fresh().from("content_plans").select("id")).data ?? []).toEqual([]);
    const admin = await as("admin");
    expect((await admin.from("content_plans").insert({ workspace_id: WS, brand_id: BRAND.espiga, month, source: "ia" })).error).not.toBeNull();
    const r = await as("revisor");
    expect((await r.rpc("save_plan", { p_brand_id: BRAND.espiga, p_month: month, p: { source: "ia", items: [item(0)] } })).error?.message).toContain("Tu rol no arma planes");
    const c = await as("creador");
    expect((await c.rpc("save_plan", { p_brand_id: BRAND.espiga, p_month: month, p: { source: "ia", items: [] } })).error?.message).toContain("no trae piezas");
    expect((await c.rpc("save_plan", { p_brand_id: BRAND.espiga, p_month: "2026-13", p: { source: "ia", items: [item(0)] } })).error?.message).toContain("Mes inválido");
    expect((await c.rpc("save_plan", { p_brand_id: BRAND.espiga, p_month: month, p: { source: "manual", items: [item(0)] } })).error?.message).toContain("mal armado");
  });

  it("las piezas elegidas pasan una sola vez, con todo su plan y registro", async () => {
    const c = await as("creador");
    const items = [item(1), item(2, { body: "", format: "Carrusel" }), item(3, { channel: "Fax" }), item(4, { publish_on: "2020-01-01" })];
    const { data: planId, error } = await c.rpc("save_plan", { p_brand_id: BRAND.espiga, p_month: month, p: { source: "ia", summary: "Resumen", items } });
    expect(error).toBeNull();
    plans.push(planId as string);
    expect((await c.rpc("add_plan_pieces", { p_plan_id: planId, p_indexes: [0, 1, 0] })).data).toBe(2);
    const { data: saved } = await service().from("content_plans").select("items").eq("id", planId).single();
    const [a, b] = [saved!.items[0].content_id, saved!.items[1].content_id];
    const { data: pieces } = await service().from("contents").select("id, status, source, post_time, hook, rationale, body").in("id", [a, b]).order("topic");
    expect(pieces!.map((p) => [p.status, p.source, p.post_time, p.hook, p.rationale])).toEqual([
      ["Borrador", "ia", "19:30:00", "¿Sabés cómo se hace?", "Porque el público pide ver el proceso."],
      ["Idea", "ia", "19:30:00", "¿Sabés cómo se hace?", "Porque el público pide ver el proceso."],
    ]);
    const { data: ev } = await service().from("content_events").select("action, note").eq("content_id", a);
    expect(ev).toEqual([{ action: "Planificada con IA", note: "Porque el público pide ver el proceso." }]);
    expect((await c.rpc("add_plan_pieces", { p_plan_id: planId, p_indexes: [0] })).error?.message).toContain("ya está en el calendario");
    expect((await c.rpc("add_plan_pieces", { p_plan_id: planId, p_indexes: [2] })).error?.message).toContain("no existe");
    expect((await c.rpc("add_plan_pieces", { p_plan_id: planId, p_indexes: [3] })).error?.message).toContain("ya pasó");
    expect((await c.rpc("add_plan_pieces", { p_plan_id: planId, p_indexes: [9] })).error?.message).toContain("Pieza inexistente");
    expect((await c.rpc("add_plan_pieces", { p_plan_id: planId, p_indexes: [] })).error?.message).toContain("al menos una");
    const r = await as("revisor");
    expect((await r.rpc("add_plan_pieces", { p_plan_id: planId, p_indexes: [0] })).error?.message).toContain("Tu rol no crea");
  });
});
