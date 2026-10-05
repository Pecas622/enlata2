// Asistente de chat: lo anónimo registra su conversación pero no la lee; las opciones las cambia
// un encargado o administrador y quedan en el log.
import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { fresh, signInAll, type Who } from "./helpers";

let c: Record<Who, SupabaseClient>;
const chat = (id: string, messages: unknown, topic = "Plan canje", handoff = false) =>
  fresh().rpc("registrar_chat", { p_slug: "demo", p_id: id, p_topic: topic, p_messages: messages, p_handoff: handoff });

beforeAll(async () => {
  c = await signInAll();
});

afterAll(async () => {
  await c.admin.rpc("guardar_asistente", { p_on: true, p_name: "Asistente", p_greeting: "" });
});

describe("conversaciones", () => {
  it("un visitante registra su charla, se actualiza en la misma fila y no la puede leer", async () => {
    const id = randomUUID();
    expect((await chat(id, [{ role: "bot", text: "¡Hola!" }, { role: "user", text: "quiero cotizar mi iphone" }])).error).toBeNull();
    expect((await chat(id, [{ role: "user", text: "quiero cotizar mi iphone" }, { role: "bot", text: "¿Qué modelo?" }, { role: "user", text: "asesor" }], "Derivado", true)).error).toBeNull();
    expect((await chat(id, [{ role: "user", text: "gracias" }], "Otro", false)).error).toBeNull();
    const { data } = await c.encargado.from("assistant_chats").select("kind, topic, last_message, handoff, messages").eq("id", id).single();
    // El tema queda el primero que se detectó y la derivación no se borra.
    expect(data).toMatchObject({ kind: "chat", topic: "Plan canje", last_message: "gracias", handoff: true });
    expect(data!.messages).toEqual([{ role: "user", text: "gracias" }]);
    expect((await fresh().from("assistant_chats").select("id").eq("id", id)).data ?? []).toEqual([]);
    expect((await c.vendedor.from("assistant_chats").select("id").eq("id", id)).data).toEqual([]);
  });

  it("guarda solo texto, recortado, de los últimos 40 mensajes", async () => {
    const id = randomUUID();
    const msgs = Array.from({ length: 50 }, (_, i) => ({ role: i % 2 ? "bot" : "user", text: `m${i} ` + "x".repeat(700), extra: "no" }));
    await chat(id, [...msgs, { role: "system", text: "ignorar" }]);
    const { data } = await c.admin.from("assistant_chats").select("messages, last_message").eq("id", id).single();
    expect(data!.messages).toHaveLength(40);
    expect(data!.messages[0].text.startsWith("m10 ")).toBe(true);
    expect(data!.messages[39].text).toHaveLength(600);
    expect(Object.keys(data!.messages[0])).toEqual(["role", "text"]);
    expect(data!.last_message.startsWith("m48 ")).toBe(true);
  });

  it("con el asistente apagado o un link que no existe no registra nada", async () => {
    expect((await c.encargado.rpc("guardar_asistente", { p_on: false, p_name: "Asistente", p_greeting: "" })).error).toBeNull();
    const id = randomUUID();
    expect((await chat(id, [{ role: "user", text: "hola" }])).error).toBeNull();
    expect((await c.admin.from("assistant_chats").select("id").eq("id", id)).data).toEqual([]);
    expect((await c.encargado.rpc("guardar_asistente", { p_on: true, p_name: "Asistente", p_greeting: "" })).error).toBeNull();
    expect((await fresh().rpc("registrar_chat", { p_slug: "no-existe", p_id: id, p_topic: "x", p_messages: [], p_handoff: false })).error).toBeNull();
    expect((await c.admin.from("assistant_chats").select("id").eq("id", id)).data).toEqual([]);
  });
});

describe("opciones del asistente", () => {
  it("encargado cambia nombre y saludo, se ven en la vista pública y quedan en el log", async () => {
    expect((await c.encargado.rpc("guardar_asistente", { p_on: true, p_name: "  Sofi  ", p_greeting: "¡Hola! ¿En qué te ayudo?" })).error).toBeNull();
    const { data } = await fresh().from("catalogo_config_publica").select("assistant_on, assistant_name, greeting").eq("slug", "demo").single();
    expect(data).toEqual({ assistant_on: true, assistant_name: "Sofi", greeting: "¡Hola! ¿En qué te ayudo?" });
    expect((await c.encargado.rpc("guardar_asistente", { p_on: false, p_name: "", p_greeting: "" })).error).toBeNull();
    expect((await fresh().from("catalogo_config_publica").select("assistant_name").eq("slug", "demo").single()).data).toEqual({ assistant_name: "Asistente" });
    const { data: log } = await c.admin.from("audit_log").select("detail").eq("action", "Catálogo").eq("detail", "Asistente de chat desactivado");
    expect(log!.length).toBeGreaterThan(0);
  });

  it("valida el saludo y no deja a vendedor, cajero ni anónimo", async () => {
    expect((await c.admin.rpc("guardar_asistente", { p_on: true, p_name: "A", p_greeting: "x".repeat(301) })).error?.message).toBe("El saludo puede tener hasta 300 caracteres.");
    for (const who of ["vendedor", "cajero"] as Who[]) {
      expect((await c[who].rpc("guardar_asistente", { p_on: false, p_name: "X", p_greeting: "" })).error?.message).toBe("Tu rol no puede cambiar el catálogo.");
    }
    expect((await fresh().rpc("guardar_asistente", { p_on: false, p_name: "X", p_greeting: "" })).error).not.toBeNull();
  });
});
