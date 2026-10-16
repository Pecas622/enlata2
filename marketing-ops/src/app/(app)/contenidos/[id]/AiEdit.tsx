"use client";

import { useState, useTransition } from "react";
import { EDIT_ACTIONS, EDIT_MAX_INSTRUCTION, type EditCopy } from "@/lib/editor";
import { proposeEdit, type EditProposal } from "./edit-actions";

// "Editar con IA": pide una versión del texto que está en el editor y la muestra al lado. Usarla la pasa al editor;
// queda guardada recién cuando se guardan los cambios.
export function AiEdit({ id, current, approved, onApply }: {
  id: string; current: EditCopy; approved: boolean; onApply: (copy: EditCopy, meta: { source: "ia" | "reglas"; label: string }) => void;
}) {
  const [free, setFree] = useState("");
  const [asked, setAsked] = useState("");
  const [res, setRes] = useState<EditProposal | null>(null);
  const [pending, start] = useTransition();
  const ask = (action: string) => {
    setAsked(action);
    start(async () => setRes(await proposeEdit(id, current, action, action ? "" : free)));
  };
  const p = res?.copy ? res : null;

  return (
    <div className="ai-edit stack" data-testid="ai-edit">
      <div>
        <h3 className="card-title" style={{ marginBottom: 2 }}>Editar con IA</h3>
        <span className="hint">Pedile un cambio al texto de arriba. Te muestra la propuesta y vos decidís si la usás.</span>
      </div>
      <div className="chips">
        {EDIT_ACTIONS.map((a) => (
          <button key={a.id} type="button" className={`chip pick${asked === a.id && (pending || p) ? " on" : ""}`} disabled={pending} onClick={() => ask(a.id)} data-testid={`ai-edit-${a.id}`}>
            {a.label}
          </button>
        ))}
      </div>
      <div className="row" style={{ gap: 8, alignItems: "flex-end" }}>
        <label className="field">
          Otro pedido
          <input
            className="input" value={free} maxLength={EDIT_MAX_INSTRUCTION} onChange={(e) => setFree(e.target.value)} placeholder="Ej.: nombrá que hacemos envíos a domicilio"
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); if (free.trim()) ask(""); } }} data-testid="ai-edit-free"
          />
        </label>
        <button type="button" className="btn btn-secondary" disabled={pending || !free.trim()} onClick={() => ask("")} data-testid="ai-edit-ask" style={{ flex: "0 0 auto" }}>
          {pending && !asked ? "Editando…" : "Pedir"}
        </button>
      </div>
      {pending && <span className="hint" role="status">Editando el texto…</span>}
      {!pending && res?.error && <div className="error" role="alert" data-testid="ai-edit-error">{res.error}</div>}
      {!pending && p && (
        <div className="ai-proposal stack" data-testid="ai-edit-proposal">
          <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
            <b>Propuesta · {p.label}</b>
            <span className="hint" data-testid="ai-edit-source">{p.source === "ia" ? "Con IA" : "Con reglas"}</span>
          </div>
          {p.notice && <span className="hint">{p.notice}</span>}
          <pre className="copy" data-testid="ai-edit-text">{p.copy!.body}{p.copy!.hashtags && <><br /><br /><span className="tags-line">{p.copy!.hashtags}</span></>}</pre>
          {p.summary && <span className="muted" data-testid="ai-edit-summary">{p.summary}</span>}
          {p.warnings && p.warnings.length > 0 && <ul className="warn" data-testid="ai-edit-warnings">{p.warnings.map((w) => <li key={w}>{w}</li>)}</ul>}
          <div className="row" style={{ gap: 8 }}>
            <button type="button" className="btn btn-primary btn-sm" onClick={() => { onApply(p.copy!, { source: p.source!, label: p.label! }); setRes(null); setAsked(""); }} data-testid="ai-edit-apply">
              Usar esta versión
            </button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setRes(null); setAsked(""); }} data-testid="ai-edit-discard">Descartar</button>
          </div>
          {approved && <span className="hint">Está aprobada: si la guardás vuelve a borrador.</span>}
        </div>
      )}
    </div>
  );
}
