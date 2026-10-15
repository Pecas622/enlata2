// Equipo contra la base: invitaciones, registro con el email invitado, roles y marcas que ve cada uno.
import { afterAll, describe, expect, it } from "vitest";
import { as, BRAND, fresh, PASSWORD, PROFILE, service, WS } from "./helpers";

const CARLA = "carla@demo.marketing-ops.test"; // Revisor que solo ve La Espiga (seed)
const C3_RODAR_EN_REVISION = "00000000-0000-4000-8000-0000000000c3";
const createdUsers: string[] = [];
afterAll(async () => {
  const s = service();
  for (const id of createdUsers) await s.auth.admin.deleteUser(id);
  await s.from("invitations").delete().like("email", "%@prueba.test");
});

const newEmail = () => `persona${Date.now()}${Math.floor(Math.random() * 1000)}@prueba.test`;

async function signUp(email: string, name = "Persona de prueba") {
  const c = fresh();
  const { data, error } = await c.auth.signUp({ email, password: PASSWORD, options: { data: { name } } });
  if (error) throw error;
  createdUsers.push(data.user!.id);
  return c;
}

describe("invitaciones", () => {
  it("solo el Administrador invita; nadie lee las invitaciones salvo él", async () => {
    const creador = await as("creador");
    expect((await creador.rpc("invite_member", { p_email: newEmail(), p_name: "X", p_role: "Creador" })).error?.message).toContain("Solo el Administrador");
    const admin = await as("admin");
    const email = newEmail();
    const { data: token, error } = await admin.rpc("invite_member", { p_email: email.toUpperCase(), p_name: "Nueva", p_role: "Creador" });
    expect(error).toBeNull();
    expect(String(token)).toMatch(/^[0-9a-f]{36}$/);
    const { data: seen } = await admin.from("invitations").select("email").eq("email", email);
    expect(seen).toEqual([{ email }]);
    expect((await creador.from("invitations").select("id").eq("email", email)).data).toEqual([]);
    expect((await fresh().from("invitations").select("id")).data ?? []).toEqual([]);
  });

  it("el link muestra la invitación sin sesión, y la persona entra con ese email y su nombre", async () => {
    const admin = await as("admin");
    const email = newEmail();
    const { data: token } = await admin.rpc("invite_member", { p_email: email, p_name: "Nombre de la invitación", p_role: "Creador" });
    const { data: info } = await fresh().rpc("invitation_info", { p_token: token });
    expect(info).toEqual([{ email, name: "Nombre de la invitación", role: "Creador", workspace: "Estudio Demo" }]);

    const c = await signUp(email, "Juana");
    expect((await c.rpc("accept_invitation")).data).toBe(true);
    const { data: me } = await c.from("profiles").select("name, role, email, workspace_id").eq("email", email).single();
    expect(me).toEqual({ name: "Juana", role: "Creador", email, workspace_id: WS });
    expect((await c.rpc("accept_invitation")).data).toBe(false); // ya tiene perfil
    expect((await fresh().rpc("invitation_info", { p_token: token })).data).toEqual([]); // el link ya no sirve
    const { data: inv } = await service().from("invitations").select("status").eq("token", token).single();
    expect(inv!.status).toBe("Aceptada");
  });

  it("alguien con otro email no toma la invitación, y una cancelada no sirve", async () => {
    const admin = await as("admin");
    const invited = newEmail();
    const { data: token } = await admin.rpc("invite_member", { p_email: invited, p_name: "", p_role: "Revisor" });
    const intruso = await signUp(newEmail());
    expect((await intruso.rpc("accept_invitation")).data).toBe(false);
    expect((await intruso.from("brands").select("id")).data).toEqual([]);

    const { data: inv } = await admin.from("invitations").select("id").eq("token", token).single();
    expect((await admin.rpc("cancel_invitation", { p_id: inv!.id })).error).toBeNull();
    const late = await signUp(invited);
    expect((await late.rpc("accept_invitation")).data).toBe(false);
  });

  it("no invita a alguien que ya está, ni con marcas a quien no es Revisor", async () => {
    const admin = await as("admin");
    expect((await admin.rpc("invite_member", { p_email: "lucia@demo.marketing-ops.test", p_name: "", p_role: "Creador" })).error?.message).toContain("ya es parte del equipo");
    expect((await admin.rpc("invite_member", { p_email: newEmail(), p_name: "", p_role: "Creador", p_brand_ids: [BRAND.espiga] })).error?.message).toContain("Solo un Revisor");
    expect((await admin.rpc("invite_member", { p_email: "sin-arroba", p_name: "", p_role: "Creador" })).error?.message).toContain("no es válido");
  });
});

describe("cliente con marcas elegidas", () => {
  it("Carla solo ve La Espiga: marcas, piezas, historial, campañas y resultados", async () => {
    const carla = fresh();
    expect((await carla.auth.signInWithPassword({ email: CARLA, password: PASSWORD })).error).toBeNull();
    const { data: brands } = await carla.from("brands").select("id");
    expect(brands).toEqual([{ id: BRAND.espiga }]);
    const { data: contents } = await carla.from("contents").select("brand_id");
    expect(contents!.length).toBeGreaterThan(0);
    expect(new Set(contents!.map((c) => c.brand_id))).toEqual(new Set([BRAND.espiga]));
    const { data: camps } = await carla.from("campaigns").select("brand_id");
    expect(new Set(camps!.map((c) => c.brand_id))).toEqual(new Set([BRAND.espiga]));
    expect((await carla.from("content_events").select("id").eq("content_id", C3_RODAR_EN_REVISION)).data).toEqual([]);
    const { data: results } = await carla.from("content_results").select("content_id, contents(brand_id)");
    expect(results!.length).toBeGreaterThan(0);
    // Mati, Revisor sin marcas elegidas, ve las dos.
    const mati = await as("revisor");
    expect((await mati.from("brands").select("id")).data).toHaveLength(2);
  });

  it("Carla no aprueba piezas de otra marca", async () => {
    const carla = fresh();
    await carla.auth.signInWithPassword({ email: CARLA, password: PASSWORD });
    const { error } = await carla.rpc("set_content_status", { p_id: C3_RODAR_EN_REVISION, p_status: "Aprobado" });
    expect(error?.message).toContain("Contenido inexistente");
    const { data } = await service().from("contents").select("status").eq("id", C3_RODAR_EN_REVISION).single();
    expect(data!.status).toBe("En revisión");
  });
});

describe("cambios en el equipo", () => {
  it("el Administrador cambia rol y marcas, con registro; siempre queda un Administrador", async () => {
    const admin = await as("admin");
    const email = newEmail();
    await admin.rpc("invite_member", { p_email: email, p_name: "", p_role: "Creador" });
    const c = await signUp(email, "Rotativa");
    await c.rpc("accept_invitation");
    const { data: p } = await service().from("profiles").select("id").eq("email", email).single();
    expect((await admin.rpc("update_member", { p_id: p!.id, p_role: "Revisor", p_active: true, p_brand_ids: [BRAND.rodar] })).error).toBeNull();
    expect((await c.from("brands").select("id")).data).toEqual([{ id: BRAND.rodar }]);
    expect((await admin.rpc("update_member", { p_id: p!.id, p_role: "Revisor", p_active: false, p_brand_ids: null })).error).toBeNull();
    expect((await c.from("brands").select("id")).data).toEqual([]); // desactivada: no ve nada
    const { data: ev } = await admin.from("team_events").select("action").order("at", { ascending: false }).limit(2);
    expect(ev!.map((e) => e.action)).toEqual(["Desactivó a Rotativa", "Cambió a Rotativa de Creador a Revisor"]);

    expect((await admin.rpc("update_member", { p_id: PROFILE.admin, p_role: "Creador", p_active: true, p_brand_ids: null })).error?.message).toContain("al menos un Administrador");
    const creador = await as("creador");
    expect((await creador.rpc("update_member", { p_id: PROFILE.revisor, p_role: "Creador", p_active: true, p_brand_ids: null })).error?.message).toContain("Solo el Administrador");
  });
});
