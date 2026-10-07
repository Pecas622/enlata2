"use client";

import { useState, useTransition } from "react";
import { anularVenta } from "../actions";

export function VoidForm({ saleId, number, hasTradeIn }: { saleId: string; number: string; hasTradeIn: boolean }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (!open) {
    return (
      <button className="btn btn-ghost" style={{ color: "var(--red)", marginTop: 14, paddingLeft: 0 }} onClick={() => setOpen(true)} data-testid="void-open">
        Anular venta
      </button>
    );
  }
  const submit = () => {
    setError(null);
    startTransition(async () => {
      const res = await anularVenta(saleId, reason.trim());
      if (res.error) setError(res.error);
    });
  };
  return (
    <div className="stack" style={{ marginTop: 16, paddingTop: 14, borderTop: "1px solid var(--border)" }}>
      <h2 className="card-title" style={{ margin: 0 }}>Anular {number}</h2>
      <p className="muted" style={{ margin: 0 }}>
        Se devuelve el stock, se registra el egreso en caja y {hasTradeIn ? "el equipo recibido en canje se retira del stock." : "queda el registro de la anulación."}
      </p>
      <label className="field">Motivo (obligatorio)<input className="input" value={reason} onChange={(e) => setReason(e.target.value)} data-testid="void-reason" /></label>
      {error && <div className="error" role="alert" data-testid="form-error">{error}</div>}
      <div className="row">
        <button className="btn btn-primary" style={{ background: "var(--red)" }} disabled={!reason.trim() || pending} onClick={submit} data-testid="void-confirm">
          {pending ? "Anulando…" : "Anular venta"}
        </button>
        <button className="btn btn-ghost" onClick={() => setOpen(false)}>Cancelar</button>
      </div>
    </div>
  );
}
