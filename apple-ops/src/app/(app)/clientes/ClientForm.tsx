"use client";

import { useActionState } from "react";
import { saveClient, type FormState } from "./actions";

export type ClientValues = { id?: string; name: string; phone: string; dni: string; email: string; notes: string };

export function ClientForm({ client }: { client?: ClientValues }) {
  const [state, action, pending] = useActionState<FormState, FormData>(saveClient, {});
  return (
    <form action={action} className="stack">
      {client?.id && <input type="hidden" name="id" value={client.id} />}
      <label className="field">Nombre<input className="input" name="name" defaultValue={client?.name} required data-testid="cli-name" /></label>
      <div className="row">
        <label className="field">WhatsApp<input className="input" name="phone" defaultValue={client?.phone} placeholder="+54 9 261 ..." data-testid="cli-phone" /></label>
        <label className="field">DNI<input className="input" name="dni" defaultValue={client?.dni} data-testid="cli-dni" /></label>
        <label className="field">Email<input className="input" name="email" type="email" defaultValue={client?.email} /></label>
      </div>
      <label className="field">Notas<input className="input" name="notes" defaultValue={client?.notes} data-testid="cli-notes" /></label>
      {state.error && <div className="error" role="alert" data-testid="form-error">{state.error}</div>}
      {state.ok && !pending && <div className="ok" data-testid="cli-saved">Cliente actualizado.</div>}
      <div><button className="btn btn-primary" disabled={pending} data-testid="cli-save">{pending ? "Guardando…" : "Guardar"}</button></div>
    </form>
  );
}
