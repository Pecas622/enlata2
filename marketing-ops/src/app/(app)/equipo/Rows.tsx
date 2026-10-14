"use client";

import { useState, useTransition } from "react";
import { Badge } from "@/components/ui";
import { ROLES, type Role } from "@/lib/roles";
import { cancelInvitation, updateMember } from "./actions";

export function CopyButton({ text, label = "Copiar" }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className="btn btn-secondary"
      onClick={async () => {
        try { await navigator.clipboard.writeText(text); setDone(true); setTimeout(() => setDone(false), 1500); } catch { /* sin permiso de portapapeles: queda el texto a la vista */ }
      }}
    >
      {done ? "Copiado" : label}
    </button>
  );
}

type Member = { id: string; name: string; email: string; role: Role; active: boolean; brand_ids: string[] | null };

export function MemberRow({ member, brands, isMe, label }: { member: Member; brands: { id: string; name: string }[]; isMe: boolean; label: string }) {
  const [open, setOpen] = useState(false);
  const [role, setRole] = useState<Role>(member.role);
  const [picked, setPicked] = useState<string[]>(member.brand_ids ?? []);
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const save = (active: boolean) => start(async () => {
    setError("");
    const r = await updateMember(member.id, role, active, picked);
    if (r.error) setError(r.error);
    else setOpen(false);
  });

  return (
    <div className="member" data-testid="member" aria-busy={pending}>
      <div className="member-head">
        <div>
          <b>{member.name}{isMe ? " (vos)" : ""}</b>
          <div className="sub muted">{member.email || "sin email"} · {label}</div>
        </div>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <Badge tone={member.active ? (member.role === "Administrador" ? "blue" : "neutral") : "gray"}>{member.active ? member.role : "Inactiva"}</Badge>
          <button className="btn btn-ghost" type="button" onClick={() => setOpen(!open)} data-testid="member-edit">{open ? "Cerrar" : "Cambiar"}</button>
        </div>
      </div>
      {open && (
        <div className="stack" style={{ gap: 10, marginTop: 10 }}>
          <label className="field">
            Rol
            <select className="input" value={role} onChange={(e) => setRole(e.target.value as Role)} data-testid="member-role">
              {ROLES.map((r) => <option key={r}>{r}</option>)}
            </select>
          </label>
          {role === "Revisor" && brands.length > 0 && (
            <div className="field">
              Marcas que ve
              <div className="chips">
                {brands.map((b) => (
                  <label key={b.id} className="chip check-chip">
                    <input type="checkbox" checked={picked.includes(b.id)} onChange={(e) => setPicked(e.target.checked ? [...picked, b.id] : picked.filter((x) => x !== b.id))} data-testid="member-brand" />
                    {b.name}
                  </label>
                ))}
              </div>
              <span className="hint">Sin marcar ninguna, ve todas.</span>
            </div>
          )}
          {error && <div className="error" role="alert">{error}</div>}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button className="btn btn-primary" type="button" disabled={pending} onClick={() => save(member.active)} data-testid="member-save">Guardar</button>
            {member.active
              ? <button className="btn btn-danger" type="button" disabled={pending} onClick={() => save(false)} data-testid="member-deactivate">Desactivar</button>
              : <button className="btn btn-secondary" type="button" disabled={pending} onClick={() => save(true)} data-testid="member-activate">Reactivar</button>}
          </div>
          {member.active && <span className="hint">Una persona desactivada no puede entrar, pero su historial queda.</span>}
        </div>
      )}
    </div>
  );
}

export function InvitationRow({ id, email, detail, link }: { id: string; email: string; detail: string; link: string }) {
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  return (
    <div className="member" data-testid="invite">
      <div className="member-head">
        <div>
          <b>{email}</b>
          <div className="sub muted">{detail}</div>
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <CopyButton text={link} label="Copiar link" />
          <button className="btn btn-ghost" type="button" disabled={pending} onClick={() => start(async () => { const r = await cancelInvitation(id); if (r.error) setError(r.error); })} data-testid="invite-cancel">Cancelar</button>
        </div>
      </div>
      {error && <div className="error" role="alert">{error}</div>}
    </div>
  );
}
