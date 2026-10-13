"use client";

import { useActionState, useState } from "react";
import { checkCopy, type Channel, type Format } from "@/lib/channels";
import { saveContent, type ActionState } from "../actions";

type Props = {
  id: string;
  channel: Channel;
  format: Format;
  wordsAvoid: string;
  initial: { title: string; body: string; hashtags: string; cta: string; publish_on: string };
  approved: boolean;
};

export function ContentEditor({ id, channel, format, wordsAvoid, initial, approved }: Props) {
  const [state, action, pending] = useActionState<ActionState, FormData>(saveContent, {});
  const [v, setV] = useState(initial);
  const warnings = checkCopy(v, channel, format, { words_avoid: wordsAvoid });
  const len = (v.body + (v.hashtags ? "\n\n" + v.hashtags : "")).length;
  return (
    <form action={action} className="card stack" data-testid="content-editor">
      <input type="hidden" name="id" value={id} />
      <label className="field">
        Título interno
        <input className="input" name="title" value={v.title} onChange={(e) => setV({ ...v, title: e.target.value })} data-testid="content-title" />
      </label>
      <label className="field">
        Texto
        <textarea className="input textarea tall" name="body" value={v.body} onChange={(e) => setV({ ...v, body: e.target.value })} data-testid="content-body" />
        <span className="hint">{len} caracteres</span>
      </label>
      <div className="row">
        <label className="field">
          Hashtags
          <input className="input" name="hashtags" value={v.hashtags} onChange={(e) => setV({ ...v, hashtags: e.target.value })} data-testid="content-hashtags" />
        </label>
        <label className="field">
          Llamado a la acción
          <input className="input" name="cta" value={v.cta} onChange={(e) => setV({ ...v, cta: e.target.value })} />
        </label>
        <label className="field" style={{ flex: "0 1 170px" }}>
          Fecha para publicar
          <input className="input" type="date" name="publish_on" value={v.publish_on} onChange={(e) => setV({ ...v, publish_on: e.target.value })} data-testid="content-date" />
        </label>
      </div>
      {warnings.length > 0 && <ul className="warn" data-testid="content-warnings">{warnings.map((w) => <li key={w}>{w}</li>)}</ul>}
      {approved && <p className="muted" style={{ margin: 0 }}>Está aprobada: si guardás cambios vuelve a borrador y hay que aprobarla de nuevo.</p>}
      {state.error && <div className="error" role="alert">{state.error}</div>}
      {state.ok && <div className="ok" role="status" data-testid="content-saved">{state.ok}</div>}
      <div>
        <button className="btn btn-primary" type="submit" disabled={pending} data-testid="content-save">{pending ? "Guardando…" : "Guardar cambios"}</button>
      </div>
    </form>
  );
}
