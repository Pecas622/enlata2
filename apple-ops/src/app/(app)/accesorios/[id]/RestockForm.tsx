"use client";

import { useActionState } from "react";
import { fmtARS } from "@/lib/money";
import { restockAccessory, type FormState } from "../actions";

export function RestockForm({ id, cost }: { id: string; cost: number | null }) {
  const [state, action, pending] = useActionState<FormState, FormData>(restockAccessory, {});
  return (
    <form action={action} className="stack" key={state.ok ? "done" : "form"}>
      <input type="hidden" name="id" value={id} />
      <div className="row">
        <label className="field">Cantidad que ingresa<input className="input" name="qty" type="number" min={1} required data-testid="restock-qty" /></label>
        <label className="field">
          Costo unitario (ARS)
          <input className="input" name="unit_cost" type="number" min={0} placeholder={cost != null ? String(cost) : ""} />
          <span>{cost != null ? `Actual: ${fmtARS(cost)}. Se recalcula el costo promedio.` : "Se recalcula el costo promedio."}</span>
        </label>
      </div>
      {state.error && <div className="error" role="alert" data-testid="form-error">{state.error}</div>}
      {state.ok && !pending && <div className="ok" data-testid="restock-done">Stock actualizado.</div>}
      <div><button className="btn btn-secondary" disabled={pending} data-testid="restock-save">{pending ? "Ingresando…" : "Ingresar stock"}</button></div>
    </form>
  );
}
