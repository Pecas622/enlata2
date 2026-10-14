"use client";

import { useActionState, useState } from "react";
import { ROLES, type Role } from "@/lib/roles";
import { inviteMember, type InviteState } from "./actions";
import { CopyButton } from "./Rows";

export function InviteForm({ brands }: { brands: { id: string; name: string }[] }) {
  const [state, action, pending] = useActionState<InviteState, FormData>(inviteMember, {});
  const [role, setRole] = useState<Role>("Creador");
  return (
    <form action={action} className="card stack" data-testid="invite-form">
      <h2 className="card-title" style={{ margin: 0 }}>Invitar a alguien</h2>
      <div className="row">
        <label className="field">
          Email
          <input className="input" name="email" type="email" required placeholder="carla@laespiga.com" data-testid="invite-email" />
        </label>
        <label className="field">
          Nombre
          <input className="input" name="name" placeholder="Carla" data-testid="invite-name" />
        </label>
        <label className="field">
          Rol
          <select className="input" name="role" value={role} onChange={(e) => setRole(e.target.value as Role)} data-testid="invite-role">
            {ROLES.map((r) => <option key={r}>{r}</option>)}
          </select>
        </label>
      </div>
      {role === "Revisor" && brands.length > 0 && (
        <div className="field">
          Marcas que ve
          <div className="chips">
            {brands.map((b) => (
              <label key={b.id} className="chip check-chip"><input type="checkbox" name="brands" value={b.id} data-testid="invite-brand" />{b.name}</label>
            ))}
          </div>
          <span className="hint">Sin marcar ninguna, ve todas. Para el cliente de una agencia, marcá solo las suyas.</span>
        </div>
      )}
      {state.error && <div className="error" role="alert">{state.error}</div>}
      {state.link && (
        <div className="notice notice-blue stack" style={{ gap: 8 }} data-testid="invite-result">
          <span>Listo. Mandale este link a {state.email}: con él crea su contraseña y entra.</span>
          <code className="invite-link" data-testid="invite-link">{state.link}</code>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <CopyButton text={state.link} label="Copiar link" />
            <a className="btn btn-secondary" href={`https://wa.me/?text=${encodeURIComponent(state.message ?? state.link)}`} target="_blank" rel="noreferrer">Mandar por WhatsApp</a>
            <a className="btn btn-ghost" href={`mailto:${state.email}?subject=${encodeURIComponent("Te invito al equipo")}&body=${encodeURIComponent(state.message ?? state.link)}`}>Mandar por mail</a>
          </div>
        </div>
      )}
      <div><button className="btn btn-primary" disabled={pending} data-testid="invite-submit">{pending ? "Invitando…" : "Crear invitación"}</button></div>
    </form>
  );
}
