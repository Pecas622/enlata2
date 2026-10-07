"use client";

import { useActionState } from "react";
import { ROLES } from "@/lib/roles";
import { saveUser, type FormState } from "./actions";

export type UserRow = { id: string; name: string; role: string; commission_pct: number; active: boolean; email?: string };

export function UserForm({ user }: { user?: UserRow }) {
  const [state, action, pending] = useActionState<FormState, FormData>(saveUser, {});
  const isNew = !user;
  return (
    <form action={action} className="card stack" style={{ maxWidth: 520 }}>
      {user && <input type="hidden" name="id" value={user.id} />}
      <label className="field">Nombre<input className="input" name="name" defaultValue={user?.name} required data-testid="user-name" /></label>
      {isNew && (
        <div className="row">
          <label className="field">Email<input className="input" name="email" type="email" required data-testid="user-email" /></label>
          <label className="field">Contraseña inicial<input className="input" name="password" type="password" minLength={8} required data-testid="user-password" /><span>Al menos 8 caracteres.</span></label>
        </div>
      )}
      <div className="row">
        <label className="field">Rol
          <select className="input" name="role" defaultValue={user?.role ?? "Vendedor"} data-testid="user-role">{ROLES.map((r) => <option key={r}>{r}</option>)}</select>
        </label>
        <label className="field">Comisión (%)<input className="input" name="commission" type="number" min={0} max={100} step="any" defaultValue={user?.commission_pct ?? 0} data-testid="user-commission" /></label>
        <label className="field">
          {isNew ? "PIN de mostrador" : "PIN nuevo"}
          <input className="input" name="pin" inputMode="numeric" pattern="\d{4}" maxLength={4} required={isNew} data-testid="user-pin" />
          <span>{isNew ? "4 dígitos, para cambiar de usuario en el mostrador." : "Dejalo vacío para no cambiarlo."}</span>
        </label>
      </div>
      <label className="row" style={{ alignItems: "center", gap: 8, fontSize: 13 }}>
        <input type="checkbox" name="active" defaultChecked={user?.active ?? true} data-testid="user-active" /> Usuario activo
      </label>
      {state.error && <div className="error" role="alert" data-testid="form-error">{state.error}</div>}
      {state.ok && !pending && <div className="ok" data-testid="user-saved">Usuario guardado.</div>}
      <div><button className="btn btn-primary" disabled={pending} data-testid="user-save">{pending ? "Guardando…" : "Guardar"}</button></div>
    </form>
  );
}
