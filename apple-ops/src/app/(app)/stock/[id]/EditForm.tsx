"use client";

import { useActionState } from "react";
import { DEVICE_STATUSES } from "@/lib/catalog";
import { editDevice, type EditState } from "./actions";

export function EditForm({ id, price, status, notes }: { id: string; price: number; status: string; notes: string }) {
  const [state, action, pending] = useActionState<EditState, FormData>(editDevice, {});
  return (
    <form action={action} className="stack" style={{ marginBottom: 16 }}>
      <input type="hidden" name="id" value={id} />
      <div className="row">
        <label className="field">
          Precio (USD)
          <input className="input" name="price" type="number" min="1" step="1" defaultValue={price} required data-testid="dev-price" />
        </label>
        <label className="field">
          Estado
          <select className="input" name="status" defaultValue={status} data-testid="dev-status">
            {DEVICE_STATUSES.filter((s) => s !== "Vendido").map((s) => <option key={s}>{s}</option>)}
          </select>
        </label>
      </div>
      <label className="field">
        Notas
        <input className="input" name="notes" defaultValue={notes} data-testid="dev-notes" />
      </label>
      {state.error && <div className="error" role="alert" data-testid="form-error">{state.error}</div>}
      {state.ok && !pending && <div className="ok" data-testid="dev-saved">Equipo actualizado.</div>}
      <div><button className="btn btn-primary" disabled={pending} data-testid="dev-save">{pending ? "Guardando…" : "Guardar"}</button></div>
    </form>
  );
}
