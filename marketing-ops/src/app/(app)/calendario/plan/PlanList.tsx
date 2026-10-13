"use client";

import { useState, useTransition } from "react";
import { Badge } from "@/components/ui";
import { longDate, type PlanItem } from "@/lib/calendar";
import { formatLabel } from "@/lib/channels";
import { addPlan, type PlanParams } from "../actions";

export function PlanList({ params, items }: { params: PlanParams; items: (PlanItem & { key: string })[] }) {
  const [chosen, setChosen] = useState(() => new Set(items.map((i) => i.key)));
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const toggle = (k: string) => setChosen((s) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n; });

  if (!items.length) {
    return <div className="card empty" data-testid="plan-empty">Este mes ya está cubierto: no hace falta sumar ideas con esta frecuencia.</div>;
  }
  return (
    <div className="card stack" data-testid="plan-list">
      <div className="table-wrap">
        <table className="table">
          <thead><tr><th></th><th>Día</th><th>Idea</th><th>Red</th><th>Objetivo</th><th>Por qué</th></tr></thead>
          <tbody>
            {items.map((i) => (
              <tr key={i.key} className="clickable" onClick={() => toggle(i.key)} data-testid="plan-item">
                <td><input type="checkbox" checked={chosen.has(i.key)} onChange={() => toggle(i.key)} onClick={(e) => e.stopPropagation()} aria-label={`Incluir ${i.topic}`} /></td>
                <td style={{ whiteSpace: "nowrap" }}>{longDate(i.publish_on)}</td>
                <td><b>{i.topic}</b></td>
                <td>{i.channel}<div className="sub">{formatLabel(i.format, i.channel)}</div></td>
                <td><Badge tone={i.goal === "Promoción" || i.goal === "Vender" ? "amber" : "blue"}>{i.goal}</Badge></td>
                <td className="sub">{i.reason}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {error && <div className="error" role="alert">{error}</div>}
      <div className="row" style={{ alignItems: "center" }}>
        <button
          className="btn btn-primary"
          disabled={pending || chosen.size === 0}
          onClick={() => start(async () => { const r = await addPlan(params, [...chosen]); if (r?.error) setError(r.error); })}
          data-testid="plan-add"
        >
          {pending ? "Agregando…" : `Agregar ${chosen.size} ${chosen.size === 1 ? "idea" : "ideas"} al calendario`}
        </button>
        <span className="muted">Quedan como ideas: después las escribís con el generador y pasan por aprobación como siempre.</span>
      </div>
    </div>
  );
}
