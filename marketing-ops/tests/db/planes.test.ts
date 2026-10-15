// Registro propio y límites del plan contra la base: quien se registra sin invitación crea su espacio en Prueba, y los
// topes de marcas, personas y acciones con IA se aplican en la base, no solo en la pantalla.
import { afterAll, describe, expect, it } from "vitest";
import { as, fresh, PASSWORD, service, WS } from "./helpers";

const users: string[] = [];
const workspaces: string[] = [];
afterAll(async () => {
  const s = service();
  for (const id of users) await s.auth.admin.deleteUser(id);
  if (workspaces.length) await s.from("workspaces").delete().in("id", workspaces);
  await s.from("invitations").delete().like("email", "%@planes.test");
});

const email = () => `dueno${Date.now()}${Math.floor(Math.random() * 1000)}@planes.test`;

async function owner(business = "Kiosco La Esquina") {
  const c = fresh();
  const { data, error } = await c.auth.signUp({ email: email(), password: PASSWORD, options: { data: { name: "Dueña", workspace: business } } });
  if (error) throw error;
  users.push(data.user!.id);
  const { data: created } = await c.rpc("create_own_workspace");
  expect(created).toBe(true);
  const { data: me } = await c.from("profiles").select("workspace_id, role, name").single();
  workspaces.push(me!.workspace_id);
  return { c, ws: me!.workspace_id as string, me: me! };
}

const brand = (name: string) => ({ name, tone: ["Cercano"], color: "#5E5CE6", channels: ["Instagram"] });

describe("registro propio", () => {
  it("sin invitación crea su espacio en Prueba y queda como Administrador; una sola vez", async () => {
    const { c, ws, me } = await owner();
    expect(me).toMatchObject({ role: "Administrador", name: "Dueña" });
    expect((await service().from("workspaces").select("name, plan_id").eq("id", ws).single()).data).toEqual({ name: "Kiosco La Esquina", plan_id: "prueba" });
    expect((await c.rpc("create_own_workspace")).data).toBe(false);
    // No ve nada del espacio demo.
    expect((await c.from("brands").select("id")).data).toEqual([]);
    expect((await c.from("contents").select("id")).data).toEqual([]);
    const { data: ev } = await service().from("team_events").select("action").eq("workspace_id", ws);
    expect(ev).toEqual([{ action: "Creó el espacio de trabajo" }]);
  });

  it("sin nombre de negocio, o con una invitación pendiente, no crea espacio", async () => {
    const c = fresh();
    const { data } = await c.auth.signUp({ email: email(), password: PASSWORD, options: { data: { name: "Sin negocio" } } });
    users.push(data.user!.id);
    expect((await c.rpc("create_own_workspace")).data).toBe(false);

    const admin = await as("admin");
    const invited = email();
    await admin.rpc("invite_member", { p_email: invited, p_name: "Invitada", p_role: "Creador" });
    const d = fresh();
    const { data: u } = await d.auth.signUp({ email: invited, password: PASSWORD, options: { data: { name: "Invitada", workspace: "Otro negocio" } } });
    users.push(u.user!.id);
    expect((await d.rpc("create_own_workspace")).data).toBe(false);
    expect((await d.rpc("accept_invitation")).data).toBe(true);
    expect((await d.from("profiles").select("workspace_id").eq("id", u.user!.id).single()).data!.workspace_id).toBe(WS);
  });
});

describe("límites del plan", () => {
  it("Prueba: una marca y dos personas, contando las invitaciones pendientes", async () => {
    const { c } = await owner("Verdulería Don Tito");
    expect((await c.rpc("save_brand", { p_id: null, p: brand("Don Tito") })).error).toBeNull();
    expect((await c.rpc("save_brand", { p_id: null, p: brand("Otra") })).error?.message).toContain("permite 1 marca");
    expect((await c.rpc("invite_member", { p_email: email(), p_name: "A", p_role: "Creador" })).error).toBeNull();
    expect((await c.rpc("invite_member", { p_email: email(), p_name: "B", p_role: "Creador" })).error?.message).toContain("permite 2 personas");
    const { data: u } = await c.rpc("plan_usage");
    expect(u[0]).toMatchObject({ plan: "prueba", brands: 1, max_brands: 1, members: 2, max_members: 2, ai_used: 0 });
  });

  it("las acciones con IA se cuentan por mes y sin cupo devuelven false sin contar", async () => {
    const { c, ws } = await owner("Ferretería");
    expect((await c.rpc("plan_usage")).data[0].ai_per_month).toBe(30);
    for (let i = 0; i < 30; i++) expect((await c.rpc("use_ai", { p_kind: i % 2 ? "generar" : "plan" })).data).toBe(true);
    expect((await c.rpc("use_ai", { p_kind: "investigar" })).data).toBe(false);
    expect((await c.rpc("plan_usage")).data[0].ai_used).toBe(30);
    expect((await c.rpc("use_ai", { p_kind: "otra" })).error?.message).toContain("desconocida");
    // Nadie escribe el uso directo.
    expect((await c.from("ai_usage").update({ uses: 0 }).eq("workspace_id", ws).select()).data ?? []).toEqual([]);
    expect((await fresh().rpc("use_ai", { p_kind: "generar" })).error).not.toBeNull();
  });

  it("el espacio demo está en Agencia", async () => {
    const admin = await as("admin");
    expect((await admin.rpc("plan_usage")).data[0]).toMatchObject({ plan: "agencia", plan_name: "Agencia" });
  });
});
