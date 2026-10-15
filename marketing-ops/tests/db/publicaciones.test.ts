// Publicar y programar contra la base: solo se programa lo aprobado de Instagram, con cuenta conectada y archivos;
// publicar lo hace solo el servidor con la clave de servicio, y la pieza pasa a Publicado cuando Instagram confirma.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { as, BRAND, newPiece, service, WS } from "./helpers";

const created: string[] = [];
let account = "";
afterAll(async () => {
  const s = service();
  await s.from("media_files").delete().like("path", `${WS}/${BRAND.espiga}/test-pub-%`);
  if (created.length) await s.from("contents").delete().in("id", created);
  if (account) await s.from("social_accounts").delete().eq("id", account);
});

beforeAll(async () => {
  const s = service();
  await s.from("social_accounts").delete().eq("brand_id", BRAND.espiga);
  const { data, error } = await s.from("social_accounts").insert({
    workspace_id: WS, brand_id: BRAND.espiga, platform: "Instagram", external_id: "test-pub-1784", username: "laespiga", token_enc: "v1.iv.tag.cifrado",
  }).select("id").single();
  if (error) throw error;
  account = data.id;
});

// Pieza aprobada de La Espiga, con (o sin) una foto registrada.
async function approved(withPhoto = true, format = "Post") {
  const id = await newPiece("Medialunas recién salidas. Pedí por WhatsApp.");
  created.push(id);
  const s = service();
  await s.from("contents").update({ status: "Aprobado", format }).eq("id", id);
  if (withPhoto) {
    await s.from("media_files").insert({ workspace_id: WS, brand_id: BRAND.espiga, content_id: id, path: `${WS}/${BRAND.espiga}/test-pub-${id}.jpg`, mime: "image/jpeg", size_bytes: 1000, kind: "foto" });
  }
  return id;
}

const inHours = (h: number) => new Date(Date.now() + h * 3600000).toISOString();

describe("programar", () => {
  it("el Creador programa una pieza aprobada; el calendario toma el día y la hora", async () => {
    const id = await approved();
    const creador = await as("creador");
    const at = "2030-03-10T22:30:00.000Z"; // 19:30 en Argentina
    const { error } = await creador.rpc("schedule_publication", { p_content_id: id, p_at: at });
    expect(error?.message).toContain("90 días");
    const soon = new Date(Date.now() + 2 * 86400000);
    soon.setUTCHours(22, 30, 0, 0);
    expect((await creador.rpc("schedule_publication", { p_content_id: id, p_at: soon.toISOString() })).error).toBeNull();
    const { data: pub } = await creador.from("publications").select("status, scheduled_at").eq("content_id", id).single();
    expect(pub!.status).toBe("Programada");
    const { data: c } = await creador.from("contents").select("status, post_time").eq("id", id).single();
    expect(c).toEqual({ status: "Aprobado", post_time: "19:30:00" });
    const { data: ev } = await creador.from("content_events").select("action").eq("content_id", id).order("at", { ascending: false }).limit(1);
    expect(ev![0].action).toBe("Programó en Instagram");
  });

  it("no se programa sin aprobar, sin archivos, en otra red, en el pasado ni siendo Revisor", async () => {
    const creador = await as("creador");
    const draft = await newPiece();
    created.push(draft);
    expect((await creador.rpc("schedule_publication", { p_content_id: draft, p_at: inHours(1) })).error?.message).toContain("aprobada");
    const bare = await approved(false);
    expect((await creador.rpc("schedule_publication", { p_content_id: bare, p_at: inHours(1) })).error?.message).toContain("Subí las fotos");
    const ad = await approved(true, "Anuncio");
    expect((await creador.rpc("schedule_publication", { p_content_id: ad, p_at: inHours(1) })).error?.message).toContain("Meta Ads");
    const ok = await approved();
    expect((await creador.rpc("schedule_publication", { p_content_id: ok, p_at: inHours(-2) })).error?.message).toContain("no hayan pasado");
    const revisor = await as("revisor");
    expect((await revisor.rpc("schedule_publication", { p_content_id: ok, p_at: inHours(1) })).error?.message).toContain("Tu rol no publica");
  });

  it("sin la cuenta conectada no se programa", async () => {
    const id = await approved();
    await service().from("social_accounts").update({ status: "Vencida" }).eq("id", account);
    const creador = await as("creador");
    expect((await creador.rpc("schedule_publication", { p_content_id: id, p_at: inHours(1) })).error?.message).toContain("vencida");
    await service().from("social_accounts").update({ status: "Conectada" }).eq("id", account);
  });

  it("mover la pieza en el calendario mueve la publicación a la misma hora; cancelar la saca", async () => {
    const id = await approved();
    const creador = await as("creador");
    const at = new Date(Date.now() + 3 * 86400000);
    at.setUTCHours(13, 0, 0, 0); // 10:00 en Argentina
    await creador.rpc("schedule_publication", { p_content_id: id, p_at: at.toISOString() });
    const later = new Date(at.getTime() + 2 * 86400000).toISOString().slice(0, 10);
    expect((await creador.rpc("schedule_content", { p_id: id, p_day: later })).error).toBeNull();
    const { data: pub } = await creador.from("publications").select("scheduled_at").eq("content_id", id).single();
    expect(new Date(pub!.scheduled_at).toISOString()).toBe(`${later}T13:00:00.000Z`);
    expect((await creador.rpc("cancel_publication", { p_content_id: id })).error).toBeNull();
    expect((await creador.from("publications").select("id").eq("content_id", id)).data).toEqual([]);
  });
});

describe("publicar (servidor)", () => {
  it("las funciones del publicador no se le dan a nadie con sesión", async () => {
    const admin = await as("admin");
    expect((await admin.rpc("claim_publications", { p_limit: 5 })).error).not.toBeNull();
    expect((await admin.rpc("finish_publication", { p_id: account, p: { ok: true } })).error).not.toBeNull();
  });

  it("toma lo que toca con el token y los archivos; al confirmar, la pieza queda Publicado", async () => {
    const id = await approved();
    const creador = await as("creador");
    await creador.rpc("schedule_publication", { p_content_id: id, p_at: new Date().toISOString() });
    const s = service();
    const { data: jobs, error } = await s.rpc("claim_publications", { p_limit: 5, p_only: id });
    expect(error).toBeNull();
    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({ format: "Post", token_enc: "v1.iv.tag.cifrado", ig_user_id: "test-pub-1784", caption: expect.stringContaining("Medialunas") });
    expect(jobs[0].media).toEqual([{ path: `${WS}/${BRAND.espiga}/test-pub-${id}.jpg`, mime: "image/jpeg" }]);
    // Tomada: otro proceso no la repite.
    expect((await s.rpc("claim_publications", { p_limit: 5, p_only: id })).data).toEqual([]);
    expect((await creador.rpc("cancel_publication", { p_content_id: id })).error?.message).toContain("Ya se está publicando");
    await s.rpc("finish_publication", { p_id: jobs[0].id, p: { ok: true, external_id: "1790", permalink: "https://www.instagram.com/p/abc/" } });
    const { data: c } = await creador.from("contents").select("status").eq("id", id).single();
    expect(c!.status).toBe("Publicado");
    const { data: pub } = await creador.from("publications").select("status, permalink").eq("content_id", id).single();
    expect(pub).toEqual({ status: "Publicada", permalink: "https://www.instagram.com/p/abc/" });
    const { data: ev } = await creador.from("content_events").select("action").eq("content_id", id).order("at", { ascending: false }).limit(1);
    expect(ev![0].action).toBe("Publicó en Instagram");
  });

  it("si falla queda Error con el motivo y la pieza sigue aprobada; si el token murió, la conexión queda Vencida", async () => {
    const id = await approved();
    const creador = await as("creador");
    await creador.rpc("schedule_publication", { p_content_id: id, p_at: new Date().toISOString() });
    const s = service();
    const { data: jobs } = await s.rpc("claim_publications", { p_limit: 5, p_only: id });
    await s.rpc("finish_publication", { p_id: jobs[0].id, p: { error: "Session has expired", expired: true } });
    expect((await creador.from("contents").select("status").eq("id", id).single()).data!.status).toBe("Aprobado");
    expect((await creador.from("publications").select("status, last_error").eq("content_id", id).single()).data).toEqual({ status: "Error", last_error: "Session has expired" });
    expect((await creador.from("social_accounts").select("status").eq("id", account).single()).data!.status).toBe("Vencida");
    await s.from("social_accounts").update({ status: "Conectada" }).eq("id", account);
    // Se puede volver a programar después de un error.
    expect((await creador.rpc("schedule_publication", { p_content_id: id, p_at: inHours(1) })).error).toBeNull();
  });

  it("una pieza que volvió a borrador no se publica aunque estuviera programada", async () => {
    const id = await approved();
    const creador = await as("creador");
    await creador.rpc("schedule_publication", { p_content_id: id, p_at: new Date().toISOString() });
    expect((await creador.rpc("set_content_status", { p_id: id, p_status: "Borrador" })).error).toBeNull();
    const s = service();
    expect((await s.rpc("claim_publications", { p_limit: 5, p_only: id })).data).toEqual([]);
    const { data: pub } = await creador.from("publications").select("status, last_error").eq("content_id", id).single();
    expect(pub!.status).toBe("Error");
    expect(pub!.last_error).toContain("dejó de estar aprobada");
  });
});
