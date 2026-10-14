"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { Badge } from "@/components/ui";
import { longDate } from "@/lib/calendar";
import { formatLabel } from "@/lib/channels";
import type { PlanPiece } from "@/lib/planner";
import { addPlanPieces } from "../actions";

export function PlanBoard({ planId, items, today, back }: { planId: string; items: PlanPiece[]; today: string; back: { month: string; brandId: string } }) {
  const open = items.map((p, i) => ({ p, i })).filter(({ p }) => !p.content_id && p.publish_on >= today);
  const [chosen, setChosen] = useState(() => new Set(open.map(({ i }) => i)));
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const toggle = (i: number) => setChosen((s) => { const n = new Set(s); if (n.has(i)) n.delete(i); else n.add(i); return n; });

  return (
    <div className="stack" data-testid="plan-list">
      {items.map((p, i) => {
        const done = Boolean(p.content_id);
        const past = p.publish_on < today;
        return (
          <div key={i} className={`card plan-piece${done || past ? " muted-card" : ""}`} data-testid="plan-item">
            <div className="plan-piece-head">
              {!done && !past && (
                <input type="checkbox" checked={chosen.has(i)} onChange={() => toggle(i)} aria-label={`Incluir ${p.topic}`} data-testid="plan-check" />
              )}
              <div className="plan-when">
                <b>{longDate(p.publish_on)}</b>
                <span className="sub">{p.post_time} · sugerido</span>
              </div>
              <div style={{ flex: 1, minWidth: 200 }}>
                <b>{p.topic}</b>
                <div className="sub">{p.channel} · {formatLabel(p.format, p.channel)}</div>
              </div>
              <Badge tone={p.goal === "Promoción" || p.goal === "Vender" ? "amber" : "blue"}>{p.goal}</Badge>
              {done && <Link className="badge badge-green" href={`/contenidos/${p.content_id}`} data-testid="plan-added">En el calendario</Link>}
              {past && !done && <Badge tone="gray">Ya pasó</Badge>}
            </div>
            <p className="plan-why"><b>Por qué:</b> {p.rationale}</p>
            <details>
              <summary>Gancho, guion, texto y recursos</summary>
              <div className="facts wide" style={{ marginTop: 10 }}>
                <span>Gancho</span><b>{p.hook}</b>
                <span>Llamado</span><b>{p.cta}</b>
                <span>Recursos</span><b>{p.resources}</b>
              </div>
              <div className="grid-2 plan-texts">
                <div><div className="sub">Guion o estructura</div><pre className="copy">{p.structure}</pre></div>
                <div><div className="sub">Texto</div><pre className="copy">{p.body}{p.hashtags && <><br /><br /><span className="tags-line">{p.hashtags}</span></>}</pre></div>
              </div>
            </details>
          </div>
        );
      })}
      {error && <div className="error" role="alert">{error}</div>}
      {open.length > 0 ? (
        <div className="row sticky-actions" style={{ alignItems: "center" }}>
          <button
            className="btn btn-primary"
            disabled={pending || chosen.size === 0}
            onClick={() => start(async () => { const r = await addPlanPieces(planId, [...chosen], back); if (r?.error) setError(r.error); })}
            data-testid="plan-add"
          >
            {pending ? "Agregando…" : `Agregar ${chosen.size} ${chosen.size === 1 ? "pieza" : "piezas"} al calendario`}
          </button>
          <span className="muted">Entran como borradores con su texto: los editás, los mandás a revisión y se aprueban como siempre.</span>
        </div>
      ) : (
        <p className="muted">Todas las piezas de este plan ya están en el calendario o son de días que pasaron.</p>
      )}
    </div>
  );
}
