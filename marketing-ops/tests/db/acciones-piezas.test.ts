// Duplicar, adaptar y borrar piezas contra la base: quién puede, qué se copia y qué registro queda.
import { describe, expect, it } from "vitest";
import { as, BRAND, newPiece, service } from "./helpers";

describe("duplicar y adaptar", () => {
  it("duplicar copia la pieza sin fecha, como borrador, y deja de dónde salió", async () => {
    const id = await newPiece();
    const s = service();
    await s.from("contents").update({ publish_on: "2030-01-10", hook: "Gancho", status: "Aprobado" }).eq("id", id);
    const c = await as("creador");
    const { data: copy, error } = await c.rpc("copy_content", { p_id: id, p: { mode: "duplicate" } });
    expect(error).toBeNull();
    const { data } = await s.from("contents").select("status, publish_on, hook, body, brand_id, created_by").eq("id", copy).single();
    expect(data).toMatchObject({ status: "Borrador", publish_on: null, hook: "Gancho", body: "Texto de prueba. Pedí por WhatsApp.", brand_id: BRAND.espiga });
    const { data: ev } = await s.from("content_events").select("action").eq("content_id", copy);
    expect(ev![0].action).toBe("Duplicada de “Prueba”");
  });

  it("adaptar cambia red, formato y texto; una red que no existe se rechaza; el Revisor no puede", async () => {
    const id = await newPiece();
    const c = await as("creador");
    const { data: copy } = await c.rpc("copy_content", { p_id: id, p: { mode: "adapt", channel: "WhatsApp", format: "Mensaje", body: "Hola! Te escribimos.", hashtags: "", publish_on: "2030-02-01", source: "plantilla" } });
    const { data } = await service().from("contents").select("channel, format, body, publish_on, source").eq("id", copy).single();
    expect(data).toEqual({ channel: "WhatsApp", format: "Mensaje", body: "Hola! Te escribimos.", publish_on: "2030-02-01", source: "plantilla" });
    const { data: ev } = await service().from("content_events").select("action").eq("content_id", copy);
    expect(ev![0].action).toBe("Adaptada de “Prueba” para WhatsApp");
    expect((await c.rpc("copy_content", { p_id: id, p: { channel: "Fax" } })).error?.message).toContain("no existe");
    const r = await as("revisor");
    expect((await r.rpc("copy_content", { p_id: id, p: {} })).error?.message).toContain("Tu rol no crea");
  });
});

describe("borrar", () => {
  it("borra una pieza sin publicar, deja registro y libera el plan que la apuntaba", async () => {
    const c = await as("creador");
    const day = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10);
    const item = { publish_on: day, channel: "Instagram", format: "Post", goal: "Vender", topic: "Prueba plan borrar", body: "Texto. Pedí por WhatsApp." };
    const { data: planId } = await c.rpc("save_plan", { p_brand_id: BRAND.espiga, p_month: day.slice(0, 7), p: { source: "plantilla", items: [item] } });
    await c.rpc("add_plan_pieces", { p_plan_id: planId, p_indexes: [0] });
    const s = service();
    const id = (await s.from("content_plans").select("items").eq("id", planId).single()).data!.items[0].content_id;
    expect((await (await as("revisor")).rpc("delete_content", { p_id: id })).error?.message).toContain("Tu rol no borra");
    expect((await c.rpc("delete_content", { p_id: id })).error).toBeNull();
    expect((await s.from("contents").select("id").eq("id", id)).data).toEqual([]);
    const { data: log } = await s.from("content_deletions").select("title, status, by_profile").eq("content_id", id).single();
    expect(log).toEqual({ title: "Prueba plan borrar", status: "Borrador", by_profile: "00000000-0000-4000-8000-0000000000a2" });
    expect((await s.from("content_plans").select("items").eq("id", planId).single()).data!.items[0].content_id).toBeUndefined();
    // Liberada, se puede volver a sumar.
    expect((await c.rpc("add_plan_pieces", { p_plan_id: planId, p_indexes: [0] })).data).toBe(1);
    await s.from("content_plans").delete().eq("id", planId);
    await s.from("contents").delete().eq("topic", "Prueba plan borrar");
  });

  it("una publicada no se borra", async () => {
    const id = await newPiece();
    await service().from("contents").update({ status: "Publicado" }).eq("id", id);
    expect((await (await as("admin")).rpc("delete_content", { p_id: id })).error?.message).toContain("no se borra");
  });
});
