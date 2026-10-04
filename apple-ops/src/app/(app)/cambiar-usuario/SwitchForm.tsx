"use client";

import { useActionState, useState } from "react";
import { switchUser, type SwitchState } from "./actions";

type Option = { id: string; name: string; role: string };

export function SwitchForm({ users }: { users: Option[] }) {
  const [state, action, pending] = useActionState<SwitchState, FormData>(switchUser, {});
  const [picked, setPicked] = useState<string>("");
  return (
    <form action={action} className="card" style={{ maxWidth: 460, display: "flex", flexDirection: "column", gap: 14 }}>
      <div className="user-grid">
        {users.map((u) => (
          <button
            type="button"
            key={u.id}
            className={`user-pick${picked === u.id ? " active" : ""}`}
            onClick={() => setPicked(u.id)}
            data-testid={`pick-${u.name}`}
          >
            <b>{u.name}</b>
            <span>{u.role}</span>
          </button>
        ))}
      </div>
      <input type="hidden" name="profile" value={picked} />
      <label className="field">
        PIN
        <input className="input" name="pin" type="password" inputMode="numeric" pattern="\d{4}" maxLength={4} autoComplete="off" required data-testid="pin" />
      </label>
      {state.error && <div className="error" role="alert" data-testid="form-error">{state.error}</div>}
      <button className="btn btn-primary" type="submit" disabled={pending || !picked} data-testid="pin-submit">
        {pending ? "Cambiando…" : "Cambiar"}
      </button>
    </form>
  );
}
