// Editar con IA: la propuesta se guarda con save_content como cualquier edición; el historial dice con qué pedido
// y una pieza aprobada vuelve a borrador.
import { afterAll, describe, expect, it } from "vitest";
import { as, newPiece, service } from "./helpers";

const created: string[] = [];
afterAll(async () => {
  if (created.length) await service().from("contents").delete().in("id", created);
});

async function lastEvent(id: string) {
  const c = await as("creador");
  const { data } = await c.from("content_events").select("action, note").eq("content_id", id).order("at", { ascending: false }).limit(1);
  return data![0];
}

describe("guardar lo editado con IA", () => {
  it("queda en el historial con el pedido; sin la marca es una edición común", async () => {
    const id = await newPiece("Medialunas recién salidas. Pedí por WhatsApp.");
    created.push(id);
    const c = await as("creador");
    expect((await c.rpc("save_content", { p_id: id, p: { body: "Medialunas del día. Pedí por WhatsApp.", edited_with: "ia", edit_note: "Más corto" } })).error).toBeNull();
    expect(await lastEvent(id)).toEqual({ action: "Editada con IA", note: "Más corto" });
    await c.rpc("save_content", { p_id: id, p: { body: "Medialunas del día.", edited_with: "reglas", edit_note: "Sacar emojis" } });
    expect(await lastEvent(id)).toEqual({ action: "Editada automáticamente", note: "Sacar emojis" });
    await c.rpc("save_content", { p_id: id, p: { body: "Otra cosa.", edited_with: "", edit_note: "no debería quedar" } });
    expect(await lastEvent(id)).toEqual({ action: "Editada", note: "" });
  });

  it("una pieza aprobada editada con IA vuelve a borrador", async () => {
    const id = await newPiece();
    created.push(id);
    await service().from("contents").update({ status: "Aprobado" }).eq("id", id);
    const c = await as("creador");
    await c.rpc("save_content", { p_id: id, p: { body: "Más vendedor. Pedí por WhatsApp.", edited_with: "ia", edit_note: "Más vendedor" } });
    expect(await lastEvent(id)).toEqual({ action: "Editada con IA (vuelve a borrador)", note: "Más vendedor" });
    expect((await c.from("contents").select("status").eq("id", id).single()).data!.status).toBe("Borrador");
  });

  it("el Revisor no edita, ni con IA", async () => {
    const id = await newPiece();
    created.push(id);
    const r = await as("revisor");
    expect((await r.rpc("save_content", { p_id: id, p: { body: "x", edited_with: "ia" } })).error?.message).toContain("Tu rol");
  });
});
