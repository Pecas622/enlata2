"use client";

import { useActionState } from "react";
import { abrirCaja, type FormState } from "./actions";

export function OpenForm({ lastArs, lastUsd }: { lastArs: number | null; lastUsd: number | null }) {
  const [state, action, pending] = useActionState<FormState, FormData>(abrirCaja, {});
  return (
    <form action={action} className="card stack" style={{ maxWidth: 520 }}>
      <h2 className="card-title" style={{ margin: 0 }}>Abrir caja</h2>
      <p className="muted" style={{ margin: 0 }}>Contá el efectivo con el que arrancás el turno.{lastArs != null ? " Cargamos lo que quedó en el último cierre." : ""}</p>
      <div className="row">
        <label className="field">Efectivo ARS<input className="input" name="ars" type="number" min={0} defaultValue={lastArs ?? 0} data-testid="open-ars" /></label>
        <label className="field">Efectivo USD<input className="input" name="usd" type="number" min={0} defaultValue={lastUsd ?? 0} data-testid="open-usd" /></label>
      </div>
      {state.error && <div className="error" role="alert" data-testid="form-error">{state.error}</div>}
      <div><button className="btn btn-primary" disabled={pending} data-testid="open-confirm">{pending ? "Abriendo…" : "Abrir caja"}</button></div>
    </form>
  );
}
