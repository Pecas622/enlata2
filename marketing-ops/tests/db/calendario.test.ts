// Calendario: reprogramar y plan del mes, contra la base.
import { afterAll, describe, expect, it } from "vitest";
import { as, BRAND, newPiece, service } from "./helpers";

const created: string[] = [];
afterAll(async () => {
  if (created.length) await service().from("contents").delete().in("id", created);
});

const C2_APROBADA = "00000000-0000-4000-8000-0000000000c2";
const C1_PUBLICADA = "00000000-0000-4000-8000-0000000000c1";

describe("reprogramar", () => {
  it("una pieza aprobada cambia de día y sigue aprobada, con registro", async () => {
    const s = service();
    const { data: before } = await s.from("contents").select("publish_on").eq("id", C2_APROBADA).single();
    const c = await as("creador");
    const { error } = await c.rpc("schedule_content", { p_id: C2_APROBADA, p_day: "2030-01-15" });
    expect(error).toBeNull();
    const { data } = await s.from("contents").select("status, publish_on").eq("id", C2_APROBADA).single();
    expect(data).toEqual({ status: "Aprobado", publish_on: "2030-01-15" });
    const { data: ev } = await s.from("content_events").select("action").eq("content_id", C2_APROBADA).order("at", { ascending: false }).limit(1).single();
    expect(ev!.action).toBe("Programó para el 15/01/2030");
    await c.rpc("schedule_content", { p_id: C2_APROBADA, p_day: before!.publish_on });
  });

  it("se puede sacar del calendario", async () => {
    const id = await newPiece();
    created.push(id);
    const c = await as("creador");
    await c.rpc("schedule_content", { p_id: id, p_day: "2030-02-01" });
    const { error } = await c.rpc("schedule_content", { p_id: id, p_day: null });
    expect(error).toBeNull();
    const { data } = await service().from("contents").select("publish_on").eq("id", id).single();
    expect(data!.publish_on).toBeNull();
  });

  it("el Revisor no reprograma y una publicada no se mueve", async () => {
    const r = await as("revisor");
    const { error } = await r.rpc("schedule_content", { p_id: C2_APROBADA, p_day: "2030-01-20" });
    expect(error?.message).toContain("Tu rol no reprograma");
    const admin = await as("admin");
    const { error: e2 } = await admin.rpc("schedule_content", { p_id: C1_PUBLICADA, p_day: "2030-01-20" });
    expect(e2?.message).toContain("publicada no se mueve");
  });
});

describe("plan del mes", () => {
  it("agrega varias ideas con fecha en una sola vez", async () => {
    const c = await as("creador");
    const topic = "Idea de plan " + Date.now();
    const { data, error } = await c.rpc("add_plan_ideas", {
      p_brand_id: BRAND.espiga,
      p_items: [
        { publish_on: "2030-03-03", channel: "Instagram", format: "Reel", goal: "Comunidad", topic: topic + " A", reason: "Para no dejar la semana sin publicaciones" },
        { publish_on: "2030-03-05", channel: "WhatsApp", format: "Mensaje", goal: "Vender", topic: topic + " B" },
      ],
    });
    expect(error).toBeNull();
    expect(data).toBe(2);
    const { data: rows } = await service().from("contents").select("id, status, publish_on, created_by").like("topic", topic + "%").order("publish_on");
    created.push(...rows!.map((r) => r.id));
    expect(rows!.map((r) => [r.status, r.publish_on])).toEqual([["Idea", "2030-03-03"], ["Idea", "2030-03-05"]]);
    const { data: ev } = await service().from("content_events").select("action, note").eq("content_id", rows![0].id).single();
    expect(ev).toEqual({ action: "Sugerida en el plan del mes", note: "Para no dejar la semana sin publicaciones" });
  });

  it("si una idea está mal no se guarda ninguna", async () => {
    const c = await as("creador");
    const topic = "Plan roto " + Date.now();
    const { error } = await c.rpc("add_plan_ideas", {
      p_brand_id: BRAND.espiga,
      p_items: [
        { publish_on: "2030-03-03", channel: "Instagram", format: "Post", goal: "Vender", topic: topic },
        { publish_on: "", channel: "Instagram", format: "Post", goal: "Vender", topic: topic },
      ],
    });
    expect(error?.message).toContain("tema y fecha");
    const { data } = await service().from("contents").select("id").eq("topic", topic);
    expect(data).toEqual([]);
  });

  it("el Revisor no arma planes", async () => {
    const r = await as("revisor");
    const { error } = await r.rpc("add_plan_ideas", { p_brand_id: BRAND.espiga, p_items: [{ publish_on: "2030-03-03", channel: "Instagram", format: "Post", goal: "Vender", topic: "x" }] });
    expect(error?.message).toContain("Tu rol no crea");
  });
});
