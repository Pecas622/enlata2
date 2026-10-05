"use client";

import { useState, useTransition } from "react";
import { MOVE_CONCEPTS } from "@/lib/cash";
import { METHODS, methodOf } from "@/lib/catalog";
import { registrarMovimiento } from "./actions";

export function MoveForm() {
  const [open, setOpen] = useState(false);
  const [method, setMethod] = useState<string>("Efectivo ARS");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [pending, startTransition] = useTransition();

  if (!open) {
    return (
      <div className="row" style={{ alignItems: "center" }}>
        <button className="btn btn-secondary" onClick={() => { setOpen(true); setDone(false); }} data-testid="move-open">+ Movimiento</button>
        {done && <span className="ok" data-testid="move-done">Movimiento registrado.</span>}
      </div>
    );
  }
  const submit = (fd: FormData) => {
    setError(null);
    startTransition(async () => {
      const res = await registrarMovimiento({}, fd);
      if (res.error) return setError(res.error);
      setOpen(false);
      setDone(true);
    });
  };
  return (
    <form action={submit} className="card stack" style={{ maxWidth: 520 }} data-testid="move-form">
      <h2 className="card-title" style={{ margin: 0 }}>Movimiento de caja</h2>
      <div className="row">
        <label className="field">Tipo<select className="input" name="type" defaultValue="Egreso" data-testid="mv-type"><option>Egreso</option><option>Ingreso</option></select></label>
        <label className="field">Medio
          <select className="input" name="method" value={method} onChange={(e) => setMethod(e.target.value)} data-testid="mv-method">
            {METHODS.map((m) => <option key={m.id}>{m.id}</option>)}
          </select>
        </label>
      </div>
      <label className="field">Concepto<select className="input" name="concept" data-testid="mv-concept">{MOVE_CONCEPTS.map((c) => <option key={c}>{c}</option>)}</select></label>
      <label className="field">Monto ({methodOf(method).cur})<input className="input" name="amount" type="number" min={1} step="any" required data-testid="mv-amount" /></label>
      {error && <div className="error" role="alert" data-testid="form-error">{error}</div>}
      <div className="row">
        <button className="btn btn-primary" disabled={pending} data-testid="mv-save">{pending ? "Registrando…" : "Registrar"}</button>
        <button type="button" className="btn btn-ghost" onClick={() => setOpen(false)}>Cancelar</button>
      </div>
    </form>
  );
}
