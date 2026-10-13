// Resultados contra la base: quién los carga, solo en piezas publicadas, validación y registro.
import { afterAll, describe, expect, it } from "vitest";
import { as, fresh, newPiece, service, WS } from "./helpers";

const C1_PUBLICADA = "00000000-0000-4000-8000-0000000000c1";
const created: string[] = [];
afterAll(async () => {
  if (created.length) await service().from("contents").delete().in("id", created);
});

async function publishedPiece() {
  const id = await newPiece();
  created.push(id);
  const creador = await as("creador");
  const revisor = await as("revisor");
  expect((await creador.rpc("set_content_status", { p_id: id, p_status: "En revisión" })).error).toBeNull();
  expect((await revisor.rpc("set_content_status", { p_id: id, p_status: "Aprobado" })).error).toBeNull();
  expect((await creador.rpc("set_content_status", { p_id: id, p_status: "Publicado" })).error).toBeNull();
  return id;
}

describe("resultados", () => {
  it("sin sesión no se ven y nadie los escribe directo", async () => {
    const { data } = await fresh().from("content_results").select("content_id");
    expect(data ?? []).toEqual([]);
    const admin = await as("admin");
    const { error } = await admin.from("content_results").insert({ content_id: C1_PUBLICADA, workspace_id: WS, reach: 1 });
    expect(error).not.toBeNull();
    await admin.from("content_results").update({ reach: 1 }).eq("content_id", C1_PUBLICADA);
    const { data: still } = await service().from("content_results").select("reach").eq("content_id", C1_PUBLICADA).single();
    expect(still!.reach).toBe(1450);
  });

  it("al publicar sin fecha, la pieza queda con el día de hoy", async () => {
    const id = await publishedPiece();
    const { data } = await service().from("contents").select("publish_on").eq("id", id).single();
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Mendoza" }).format(new Date());
    expect(data!.publish_on).toBe(today);
  });

  it("el Creador carga y corrige, con registro; el Revisor solo mira", async () => {
    const id = await publishedPiece();
    const c = await as("creador");
    const p = { reach: "1200", interactions: "85", clicks: "10", inquiries: "6", sales: "2", spend: "0", notes: "Prueba" };
    expect((await c.rpc("save_results", { p_content_id: id, p })).error).toBeNull();
    expect((await c.rpc("save_results", { p_content_id: id, p: { ...p, reach: "1500" } })).error).toBeNull();
    const { data } = await service().from("content_results").select("reach, interactions, inquiries, spend, notes").eq("content_id", id).single();
    expect(data).toEqual({ reach: 1500, interactions: 85, inquiries: 6, spend: 0, notes: "Prueba" });
    const { data: ev } = await service().from("content_events").select("action, note").eq("content_id", id).like("action", "%resultados").order("at");
    expect(ev).toEqual([
      { action: "Cargó los resultados", note: "Alcance 1200 · 85 interacciones · 6 consultas" },
      { action: "Corrigió los resultados", note: "Alcance 1500 · 85 interacciones · 6 consultas" },
    ]);
    const r = await as("revisor");
    const { data: seen } = await r.from("content_results").select("reach").eq("content_id", id);
    expect(seen).toEqual([{ reach: 1500 }]);
    expect((await r.rpc("save_results", { p_content_id: id, p })).error?.message).toContain("Tu rol no carga resultados");
  });

  it("solo en piezas publicadas y con números válidos", async () => {
    const draft = await newPiece();
    created.push(draft);
    const c = await as("creador");
    expect((await c.rpc("save_results", { p_content_id: draft, p: { reach: "10" } })).error?.message).toContain("cuando la pieza está publicada");
    expect((await c.rpc("save_results", { p_content_id: C1_PUBLICADA, p: { reach: "-3" } })).error?.message).toContain("no pueden ser negativos");
    expect((await c.rpc("save_results", { p_content_id: C1_PUBLICADA, p: { reach: "mucho" } })).error?.message).toContain("números enteros");
    const { data } = await service().from("content_results").select("reach").eq("content_id", C1_PUBLICADA).single();
    expect(data!.reach).toBe(1450);
  });
});
