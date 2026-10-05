"use client";

import { useActionState, useState } from "react";
import { closeState } from "@/lib/cash";
import { fmtARS, fmtUSD } from "@/lib/money";
import { cerrarCaja, type FormState } from "./actions";

type Props = { number: string; blind: boolean; expectedArs: number | null; expectedUsd: number | null };

export function CloseForm({ number, blind, expectedArs, expectedUsd }: Props) {
  const [open, setOpen] = useState(false);
  const [ars, setArs] = useState("");
  const [usd, setUsd] = useState("");
  const [note, setNote] = useState("");
  const [state, action, pending] = useActionState<FormState, FormData>(cerrarCaja, {});
  const s = closeState({ blind, expectedArs, expectedUsd, countedArs: ars, countedUsd: usd, note });

  if (!open) return <button className="btn btn-primary" onClick={() => setOpen(true)} data-testid="close-open">Cerrar caja</button>;
  return (
    <form action={action} className="card stack" style={{ maxWidth: 520 }} data-testid="close-form">
      <h2 className="card-title" style={{ margin: 0 }}>Cerrar caja {number}</h2>
      <p className="muted" style={{ margin: 0 }}>Contá el efectivo que hay físicamente en la caja.</p>
      <div className="row">
        <label className="field">
          Efectivo ARS contado
          <input className="input" name="ars" type="number" min={0} step="any" value={ars} onChange={(e) => setArs(e.target.value)} data-testid="count-ars" />
          {!blind && expectedArs != null && <span>Esperado: {fmtARS(expectedArs)}</span>}
        </label>
        <label className="field">
          Efectivo USD contado
          <input className="input" name="usd" type="number" min={0} step="any" value={usd} onChange={(e) => setUsd(e.target.value)} data-testid="count-usd" />
          {!blind && expectedUsd != null && <span>Esperado: {fmtUSD(expectedUsd)}</span>}
        </label>
      </div>
      {!blind && s.filled && (
        <div className={s.hasDiff ? "error" : "ok"} data-testid="close-diff">
          {s.hasDiff ? `Diferencia: ${fmtARS(s.diffArs ?? 0)} / ${fmtUSD(s.diffUsd ?? 0)}` : "La caja cuadra."}
        </div>
      )}
      {(s.needNote || blind) && (
        <label className="field">
          {blind ? "Observaciones" : "Motivo de la diferencia (obligatorio)"}
          <input className="input" name="note" value={note} onChange={(e) => setNote(e.target.value)} data-testid="close-note" />
        </label>
      )}
      {state.error && <div className="error" role="alert" data-testid="form-error">{state.error}</div>}
      <div className="row">
        <button className="btn btn-primary" disabled={!s.canConfirm || pending} data-testid="close-confirm">{pending ? "Cerrando…" : "Confirmar cierre"}</button>
        <button type="button" className="btn btn-ghost" onClick={() => setOpen(false)}>Cancelar</button>
      </div>
    </form>
  );
}
