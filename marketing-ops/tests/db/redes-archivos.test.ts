// Redes y archivos contra la base: el token cifrado no se lee desde el navegador, solo el Administrador conecta, y los
// archivos quedan en la carpeta del espacio con su registro y el tope del plan.
import { afterAll, describe, expect, it } from "vitest";
import { as, BRAND, fresh, PASSWORD, service, WS } from "./helpers";

const CARLA = "carla@demo.marketing-ops.test"; // Revisor que solo ve La Espiga
const paths: string[] = [];
const users: string[] = [];
const workspaces: string[] = [];
afterAll(async () => {
  const s = service();
  await s.from("social_accounts").delete().like("external_id", "test-%");
  await s.from("media_files").delete().in("path", paths);
  if (paths.length) await s.storage.from("media").remove(paths);
  for (const id of users) await s.auth.admin.deleteUser(id);
  if (workspaces.length) await s.from("workspaces").delete().in("id", workspaces);
});

const account = (extra: Record<string, unknown> = {}) => ({
  platform: "Instagram", external_id: `test-${Date.now()}-${Math.random()}`, username: "laespiga", account_type: "BUSINESS", followers: 1200,
  token_enc: "v1.iv.tag.cifrado", token_expires_at: new Date(Date.now() + 50 * 86400000).toISOString(), ...extra,
});

describe("redes conectadas", () => {
  it("solo el Administrador conecta; el token no se lee por la API, solo con social_token", async () => {
    const creador = await as("creador");
    expect((await creador.rpc("connect_social", { p_brand_id: BRAND.espiga, p: account() })).error?.message).toContain("Solo el Administrador");
    const admin = await as("admin");
    const { data: id, error } = await admin.rpc("connect_social", { p_brand_id: BRAND.espiga, p: account() });
    expect(error).toBeNull();
    const { data: row } = await admin.from("social_accounts").select("username, status, followers").eq("id", id).single();
    expect(row).toEqual({ username: "laespiga", status: "Conectada", followers: 1200 });
    expect((await admin.from("social_accounts").select("token_enc").eq("id", id)).error).not.toBeNull();
    expect((await admin.from("social_accounts").select("*").eq("id", id)).error).not.toBeNull();
    expect((await creador.rpc("social_token", { p_id: id })).data[0].token_enc).toBe("v1.iv.tag.cifrado");
    const revisor = await as("revisor");
    expect((await revisor.rpc("social_token", { p_id: id })).data).toEqual([]);
    expect((await fresh().from("social_accounts").select("id")).data ?? []).toEqual([]);
    const { data: ev } = await service().from("social_events").select("action").eq("brand_id", BRAND.espiga).order("at", { ascending: false }).limit(1);
    expect(ev![0].action).toBe("Conectó Instagram @laespiga");
  });

  it("reconectar reemplaza la cuenta de la marca; la misma cuenta no va en dos marcas", async () => {
    const admin = await as("admin");
    const a = account({ external_id: `test-dup-${Date.now()}` });
    const { data: first } = await admin.rpc("connect_social", { p_brand_id: BRAND.rodar, p: a });
    const { data: again } = await admin.rpc("connect_social", { p_brand_id: BRAND.rodar, p: { ...a, username: "rodar", token_enc: "v1.otro" } });
    expect(again).toBe(first);
    expect((await admin.from("social_accounts").select("username").eq("id", first).single()).data!.username).toBe("rodar");
    expect((await admin.rpc("connect_social", { p_brand_id: BRAND.espiga, p: a })).error?.message).toContain("otra marca");
    expect((await admin.rpc("connect_social", { p_brand_id: BRAND.espiga, p: { ...account(), platform: "MySpace" } })).error?.message).toContain("no existe");
  });

  it("probar la conexión guarda el estado; desconectar deja registro", async () => {
    const admin = await as("admin");
    const { data: id } = await admin.rpc("connect_social", { p_brand_id: BRAND.rodar, p: account() });
    const creador = await as("creador");
    expect((await creador.rpc("save_social_check", { p_id: id, p: { status: "Vencida", last_error: "Session has expired" } })).error).toBeNull();
    expect((await admin.from("social_accounts").select("status, last_error").eq("id", id).single()).data).toEqual({ status: "Vencida", last_error: "Session has expired" });
    expect((await creador.rpc("disconnect_social", { p_id: id })).error?.message).toContain("Solo el Administrador");
    expect((await admin.rpc("disconnect_social", { p_id: id })).error).toBeNull();
    expect((await admin.from("social_accounts").select("id").eq("id", id)).data).toEqual([]);
  });

  it("la clienta con marcas elegidas no ve las cuentas de otras marcas", async () => {
    const admin = await as("admin");
    await admin.rpc("connect_social", { p_brand_id: BRAND.rodar, p: account() });
    const carla = fresh();
    await carla.auth.signInWithPassword({ email: CARLA, password: PASSWORD });
    const { data } = await carla.from("social_accounts").select("brand_id");
    expect((data ?? []).every((r) => r.brand_id === BRAND.espiga)).toBe(true);
  });
});

const png = () => new Blob([Uint8Array.from(Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64"))], { type: "image/png" });

describe("archivos", () => {
  it("el Creador sube a la carpeta de su espacio y lo registra; tamaño y tipo salen de Storage", async () => {
    const c = await as("creador");
    const path = `${WS}/${BRAND.espiga}/${Date.now()}-foto.png`;
    paths.push(path);
    expect((await c.storage.from("media").upload(path, png(), { contentType: "image/png" })).error).toBeNull();
    const { data: id, error } = await c.rpc("add_media", { p: { path, name: "Foto.png", kind: "foto" } });
    expect(error).toBeNull();
    const { data: row } = await c.from("media_files").select("mime, size_bytes, kind, name").eq("id", id).single();
    expect(row).toEqual({ mime: "image/png", size_bytes: 70, kind: "foto", name: "Foto.png" });
    expect((await c.storage.from("media").createSignedUrl(path, 60)).data?.signedUrl).toContain("token=");
    expect((await fresh().storage.from("media").download(path)).error).not.toBeNull();
  });

  it("nadie sube fuera de su carpeta, el Revisor no sube, y no se registra lo que no está en Storage", async () => {
    const c = await as("creador");
    const otherWs = "00000000-0000-4000-8000-0000000000ff";
    expect((await c.storage.from("media").upload(`${otherWs}/${BRAND.espiga}/x.png`, png(), { contentType: "image/png" })).error).not.toBeNull();
    expect((await c.storage.from("media").upload(`${WS}/no-es-marca/x.png`, png(), { contentType: "image/png" })).error).not.toBeNull();
    const r = await as("revisor");
    expect((await r.storage.from("media").upload(`${WS}/${BRAND.espiga}/r.png`, png(), { contentType: "image/png" })).error).not.toBeNull();
    expect((await c.rpc("add_media", { p: { path: `${WS}/${BRAND.espiga}/fantasma.png`, kind: "foto" } })).error?.message).toContain("No encontré");
    expect((await c.rpc("add_media", { p: { path: `${otherWs}/${BRAND.espiga}/x.png`, kind: "foto" } })).error?.message).toContain("no es de este espacio");
  });

  it("borrar saca el registro y devuelve la ruta; la clienta solo ve archivos de su marca", async () => {
    const c = await as("creador");
    const path = `${WS}/${BRAND.rodar}/${Date.now()}-bici.png`;
    paths.push(path);
    await c.storage.from("media").upload(path, png(), { contentType: "image/png" });
    const { data: id } = await c.rpc("add_media", { p: { path, kind: "logo" } });
    const carla = fresh();
    await carla.auth.signInWithPassword({ email: CARLA, password: PASSWORD });
    expect((await carla.from("media_files").select("id").eq("id", id)).data).toEqual([]);
    expect((await carla.storage.from("media").createSignedUrl(path, 60)).error).not.toBeNull();
    expect((await c.rpc("delete_media", { p_id: id })).data).toBe(path);
  });

  it("el tope de espacio del plan frena el archivo que no entra", async () => {
    const owner = fresh();
    const { data: u } = await owner.auth.signUp({ email: `archivos${Date.now()}@planes.test`, password: PASSWORD, options: { data: { name: "Dueña", workspace: "Mini" } } });
    users.push(u.user!.id);
    await owner.rpc("create_own_workspace");
    const { data: me } = await owner.from("profiles").select("workspace_id").single();
    workspaces.push(me!.workspace_id);
    const { data: brandId } = await owner.rpc("save_brand", { p_id: null, p: { name: "Mini", tone: ["Cercano"], color: "#5E5CE6", channels: ["Instagram"] } });
    await service().from("plans").update({ max_storage_mb: 1 }).eq("id", "prueba");
    try {
      await service().from("media_files").insert({ workspace_id: me!.workspace_id, brand_id: brandId, path: `${me!.workspace_id}/${brandId}/grande`, mime: "image/png", size_bytes: 1048576, kind: "foto" });
      const path = `${me!.workspace_id}/${brandId}/chica.png`;
      paths.push(path);
      expect((await owner.storage.from("media").upload(path, png(), { contentType: "image/png" })).error).toBeNull();
      expect((await owner.rpc("add_media", { p: { path, kind: "foto" } })).error?.message).toContain("1 MB");
      expect((await owner.rpc("plan_usage")).data[0]).toMatchObject({ max_storage_mb: 1, storage_bytes: 1048576 });
    } finally {
      await service().from("plans").update({ max_storage_mb: 200 }).eq("id", "prueba");
    }
  });
});
