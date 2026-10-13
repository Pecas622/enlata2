// Permisos en la base: RLS y funciones SQL, con usuarios reales del seed.
import { afterAll, describe, expect, it } from "vitest";
import { as, BRAND, fresh, newPiece, service, WS } from "./helpers";

const created: string[] = [];
afterAll(async () => {
  if (created.length) await service().from("contents").delete().in("id", created);
  await service().from("workspaces").delete().eq("name", "Otro estudio");
});

describe("lectura", () => {
  it("sin sesión no se lee nada", async () => {
    const c = fresh();
    for (const t of ["workspaces", "profiles", "brands", "contents", "content_events"]) {
      const { data } = await c.from(t).select("id");
      expect(data ?? [], t).toEqual([]);
    }
  });

  it("cada espacio de trabajo ve solo lo suyo", async () => {
    const s = service();
    const { data: ws } = await s.from("workspaces").insert({ name: "Otro estudio" }).select("id").single();
    const { data: b } = await s.from("brands").insert({ workspace_id: ws!.id, name: "Marca ajena" }).select("id").single();
    const admin = await as("admin");
    const { data } = await admin.from("brands").select("id, name");
    expect(data!.map((x) => x.id)).not.toContain(b!.id);
    expect(data!.length).toBeGreaterThanOrEqual(2);
    const { error } = await admin.rpc("save_content", { p_id: null, p: { brand_id: b!.id, channel: "Instagram", format: "Post", goal: "Vender", body: "x" } });
    expect(error?.message).toContain("Marca inexistente");
  });
});

describe("escritura", () => {
  it("nadie escribe las tablas directo, ni el Administrador", async () => {
    const admin = await as("admin");
    const ins = await admin.from("contents").insert({ workspace_id: WS, brand_id: BRAND.espiga, channel: "Instagram", format: "Post", goal: "Vender" });
    expect(ins.error).not.toBeNull();
    const upd = await admin.from("brands").update({ name: "Hackeada" }).eq("id", BRAND.espiga).select();
    expect(upd.data ?? []).toEqual([]);
    const { data } = await admin.from("brands").select("name").eq("id", BRAND.espiga).single();
    expect(data!.name).toBe("La Espiga");
  });

  it("solo el Administrador edita marcas", async () => {
    for (const who of ["creador", "revisor"] as const) {
      const c = await as(who);
      const { error } = await c.rpc("save_brand", { p_id: BRAND.espiga, p: { name: "Otra" } });
      expect(error?.message, who).toContain("Solo el Administrador");
    }
    const admin = await as("admin");
    const { error } = await admin.rpc("save_brand", { p_id: BRAND.rodar, p: { name: "Rodar Bikes", city: "Ciudad de Mendoza", tone: ["Directo", "Profesional"], color: "#047857", cta: "Sacá turno por WhatsApp", hashtags: "rodarbikes, ciclismomendoza, mtb", words_avoid: "barato, chino", value_prop: "Service en 48 h con turno online y garantía escrita en cada arreglo.", description: "Venta de bicicletas urbanas y de montaña, repuestos y taller con turno.", industry: "Bicicletería y taller", audience: "Ciclistas urbanos y de fin de semana de 20 a 50 años que usan la bici para moverse o para salir a la montaña.", products: "Bicicletas urbanas, mountain bikes, service completo, cascos, luces, cubiertas", website: "rodarbikes.com.ar", instagram: "@rodar.bikes", whatsapp: "+54 9 261 555 0202" } });
    expect(error).toBeNull();
  });

  it("el Revisor no crea ni edita piezas", async () => {
    const c = await as("revisor");
    const { error } = await c.rpc("save_content", { p_id: null, p: { brand_id: BRAND.espiga, channel: "Instagram", format: "Post", goal: "Vender", body: "x" } });
    expect(error?.message).toContain("Tu rol no crea");
  });
});

describe("circuito de aprobación", () => {
  it("borrador → revisión → aprobado → publicado, con registro de quién y cuándo", async () => {
    const id = await newPiece();
    created.push(id);
    const creador = await as("creador");
    const revisor = await as("revisor");

    expect((await creador.rpc("set_content_status", { p_id: id, p_status: "Aprobado" })).error?.message).toContain("No podés");
    expect((await creador.rpc("set_content_status", { p_id: id, p_status: "En revisión" })).error).toBeNull();
    expect((await creador.rpc("set_content_status", { p_id: id, p_status: "Aprobado" })).error?.message).toContain("No podés");
    expect((await revisor.rpc("set_content_status", { p_id: id, p_status: "Aprobado" })).error).toBeNull();
    expect((await revisor.rpc("set_content_status", { p_id: id, p_status: "Publicado" })).error?.message).toContain("No podés");
    expect((await creador.rpc("set_content_status", { p_id: id, p_status: "Publicado" })).error).toBeNull();

    const { error } = await creador.rpc("save_content", { p_id: id, p: { body: "otro" } });
    expect(error?.message).toContain("publicada no se edita");

    const { data: ev } = await creador.from("content_events").select("action, by_profile, at").eq("content_id", id).order("at");
    expect(ev!.map((e) => e.action)).toEqual(["Creada con plantilla", "Mandó a revisión", "Aprobó", "Marcó como publicada"]);
    expect(ev!.every((e) => e.by_profile && e.at)).toBe(true);
  });

  it("pedir cambios vuelve a borrador con la nota, y editar algo aprobado obliga a aprobarlo de nuevo", async () => {
    const id = await newPiece();
    created.push(id);
    const creador = await as("creador");
    const revisor = await as("revisor");
    await creador.rpc("set_content_status", { p_id: id, p_status: "En revisión" });
    expect((await revisor.rpc("set_content_status", { p_id: id, p_status: "Borrador", p_note: "Sacá el emoji" })).error).toBeNull();
    const { data: note } = await creador.from("content_events").select("action, note").eq("content_id", id).eq("action", "Pidió cambios").single();
    expect(note!.note).toBe("Sacá el emoji");

    await creador.rpc("set_content_status", { p_id: id, p_status: "En revisión" });
    await revisor.rpc("set_content_status", { p_id: id, p_status: "Aprobado" });
    await creador.rpc("save_content", { p_id: id, p: { body: "Texto corregido. Pedí por WhatsApp." } });
    const { data } = await creador.from("contents").select("status, body").eq("id", id).single();
    expect(data).toEqual({ status: "Borrador", body: "Texto corregido. Pedí por WhatsApp." });
  });

  it("una idea sin texto no va a revisión", async () => {
    const id = await newPiece("");
    created.push(id);
    const creador = await as("creador");
    const { data } = await creador.from("contents").select("status").eq("id", id).single();
    expect(data!.status).toBe("Idea");
    const { error } = await creador.rpc("set_content_status", { p_id: id, p_status: "En revisión" });
    expect(error?.message).toContain("Escribí el texto");
  });
});
