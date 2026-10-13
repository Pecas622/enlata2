"use client";

import { useActionState } from "react";
import { fmtARS } from "@/lib/campaigns";
import { fmtInt, fmtPct, rates, type Results } from "@/lib/metrics";
import { saveResults, type ResultsState } from "../../metricas/actions";

const FIELDS: { key: keyof Results; label: string; hint: string }[] = [
  { key: "reach", label: "Personas alcanzadas", hint: "En un mensaje, a cuántos se lo mandaste." },
  { key: "interactions", label: "Interacciones", hint: "Me gusta, comentarios, guardados y compartidos." },
  { key: "clicks", label: "Clics", hint: "En el enlace, el botón o al perfil." },
  { key: "inquiries", label: "Consultas", hint: "Mensajes o llamadas por esta pieza." },
  { key: "sales", label: "Ventas", hint: "Las que sabés que vinieron de acá." },
  { key: "spend", label: "Inversión en pauta (pesos)", hint: "0 si no la promocionaste." },
];

export function ResultsForm({ contentId, initial, notes, canEdit }: { contentId: string; initial: Results | null; notes: string; canEdit: boolean }) {
  const [state, action, pending] = useActionState<ResultsState, FormData>(saveResults, {});
  const r = initial ? rates(initial) : null;

  if (!canEdit) {
    return (
      <div className="card stack" id="resultados" data-testid="results">
        <h2 className="card-title">Resultados</h2>
        {!initial ? <p className="muted" style={{ margin: 0 }}>Todavía no se cargaron los resultados de esta pieza.</p> : (
          <div className="facts" style={{ margin: 0 }}>
            <span>Personas alcanzadas</span><b>{fmtInt(initial.reach)}</b>
            <span>Interacciones</span><b>{fmtInt(initial.interactions)} ({fmtPct(r!.engagement)})</b>
            <span>Clics</span><b>{fmtInt(initial.clicks)}</b>
            <span>Consultas</span><b>{fmtInt(initial.inquiries)}</b>
            <span>Ventas</span><b>{fmtInt(initial.sales)}</b>
            <span>Inversión</span><b>{initial.spend ? `${fmtARS(initial.spend)}${r!.cpi ? ` (${fmtARS(r!.cpi)} por consulta)` : ""}` : "Sin pauta"}</b>
          </div>
        )}
        {notes && <p className="muted" style={{ margin: 0 }}>{notes}</p>}
      </div>
    );
  }

  return (
    <form action={action} className="card stack" id="resultados" data-testid="results-form">
      <input type="hidden" name="content_id" value={contentId} />
      <div>
        <h2 className="card-title" style={{ marginBottom: 4 }}>Resultados</h2>
        <p className="hint" style={{ margin: 0 }}>Copialos de las estadísticas de Meta Business Suite (o de la red que sea) a los 7 días de publicar.</p>
      </div>
      <div className="row">
        {FIELDS.map((f) => (
          <label key={f.key} className="field">
            {f.label}
            <input className="input" name={f.key} inputMode="numeric" defaultValue={initial ? String(initial[f.key]) : ""} placeholder="0" data-testid={`res-${f.key}`} />
            <span className="hint">{f.hint}</span>
          </label>
        ))}
      </div>
      <label className="field">
        Nota
        <input className="input" name="notes" defaultValue={notes} placeholder="Por ejemplo: la compartió una cuenta grande del barrio" data-testid="res-notes" />
      </label>
      {r && <div className="hint" data-testid="res-rates">Interacción: {fmtPct(r.engagement)}{r.per1000 !== null ? ` · ${String(r.per1000).replace(".", ",")} consultas cada 1.000 alcanzadas` : ""}{r.cpi ? ` · ${fmtARS(r.cpi)} por consulta` : ""}</div>}
      {state.error && <div className="error" role="alert">{state.error}</div>}
      {state.ok && <div className="ok" role="status" data-testid="res-ok">{state.ok}</div>}
      <div><button className="btn btn-primary" disabled={pending} data-testid="res-save">{pending ? "Guardando…" : initial ? "Actualizar resultados" : "Guardar resultados"}</button></div>
    </form>
  );
}
