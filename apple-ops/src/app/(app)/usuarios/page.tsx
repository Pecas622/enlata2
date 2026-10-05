import Link from "next/link";
import { Badge, Notice, PageHeader } from "@/components/ui";
import { fmtDateTime } from "@/lib/dates";
import { requireSection } from "@/lib/guard";
import { PERM_MATRIX, ROLES } from "@/lib/roles";
import { createClient, createServiceClient } from "@/lib/supabase/server";

export default async function UsuariosPage({ searchParams }: { searchParams: Promise<{ nuevo?: string }> }) {
  const { nuevo } = await searchParams;
  await requireSection("usuarios");
  const supabase = await createClient();
  const [{ data: users }, { data: log }, { data: auth }] = await Promise.all([
    supabase.from("profiles").select("id, name, role, commission_pct, active").order("active", { ascending: false }).order("name"),
    supabase.from("audit_log").select("id, at, user_name, action, detail").order("at", { ascending: false }).limit(15),
    createServiceClient().auth.admin.listUsers({ perPage: 1000 }),
  ]);
  const emails = new Map(auth?.users.map((u) => [u.id, u.email]) ?? []);
  const created = nuevo && users?.find((u) => u.id === nuevo);

  return (
    <>
      <PageHeader title="Usuarios y roles" subtitle="Quién puede hacer qué en tu local" action={<Link href="/usuarios/nuevo" className="btn btn-primary" data-testid="user-new">+ Nuevo usuario</Link>} />
      {created && <div style={{ marginBottom: 12 }}><Notice tone="blue">{created.name} ya puede entrar con su email y cambiar de usuario con su PIN.</Notice></div>}
      <div className="card">
        <div className="table-wrap">
          <table className="table" data-testid="users-table">
            <thead><tr><th>Nombre</th><th>Email</th><th>Rol</th><th>Comisión</th><th>Estado</th><th /></tr></thead>
            <tbody>
              {(users ?? []).map((u) => (
                <tr key={u.id} data-testid="user-row">
                  <td><b>{u.name}</b></td>
                  <td className="muted">{emails.get(u.id) ?? "-"}</td>
                  <td><Badge tone={u.role === "Administrador" ? "green" : "neutral"}>{u.role}</Badge></td>
                  <td>{Number(u.commission_pct) ? `${Number(u.commission_pct)}%` : "-"}</td>
                  <td><Badge tone={u.active ? "green" : "gray"}>{u.active ? "Activo" : "Inactivo"}</Badge></td>
                  <td className="r"><Link href={`/usuarios/${u.id}`} style={{ color: "var(--accent)", fontSize: 12 }} data-testid={`edit-${u.name}`}>Editar</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <div className="card" style={{ marginTop: 16 }}>
        <h2 className="card-title">Permisos por rol</h2>
        <div className="table-wrap">
          <table className="table matrix" data-testid="perm-matrix">
            <thead><tr><th>Permiso</th>{ROLES.map((r) => <th key={r}>{r}</th>)}</tr></thead>
            <tbody>
              {PERM_MATRIX.map(([label, fn]) => (
                <tr key={label}><td>{label}</td>{ROLES.map((r) => <td key={r} style={{ color: fn(r) ? "var(--success)" : "var(--gray)" }}>{fn(r) ? "✓" : "–"}</td>)}</tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <div className="card" style={{ marginTop: 16 }}>
        <h2 className="card-title">Actividad reciente</h2>
        {!log?.length ? <div className="empty">Sin actividad.</div> : (
          <div className="table-wrap">
            <table className="table" data-testid="activity">
              <thead><tr><th>Cuándo</th><th>Usuario</th><th>Acción</th><th>Detalle</th></tr></thead>
              <tbody>{log.map((l) => <tr key={l.id}><td style={{ whiteSpace: "nowrap" }}>{fmtDateTime(l.at)}</td><td>{l.user_name}</td><td>{l.action}</td><td className="muted">{l.detail}</td></tr>)}</tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
