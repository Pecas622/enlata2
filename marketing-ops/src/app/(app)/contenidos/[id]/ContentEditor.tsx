"use client";

import { useActionState, useState } from "react";
import { checkCopy, type Channel, type Format } from "@/lib/channels";
import { saveContent, type ActionState } from "../actions";

type Props = {
  id: string;
  channel: Channel;
  format: Format;
  wordsAvoid: string;
  initial: { title: string; body: string; hashtags: string; cta: string; publish_on: string; post_time: string; hook: string; structure: string; resources: string; rationale: string };
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
        <label className="field" style={{ flex: "0 1 130px" }}>
          Horario sugerido
          <input className="input" type="time" name="post_time" value={v.post_time} onChange={(e) => setV({ ...v, post_time: e.target.value })} data-testid="content-time" />
        </label>
      </div>
      <details className="plan-details" open={Boolean(initial.hook || initial.structure || initial.rationale)}>
        <summary>Gancho, estructura y recursos</summary>
        <div className="stack" style={{ marginTop: 10 }}>
          <label className="field">
            Gancho
            <input className="input" name="hook" value={v.hook} onChange={(e) => setV({ ...v, hook: e.target.value })} data-testid="content-hook" />
            <span className="hint">La primera frase o los primeros 3 segundos: lo que hace que frenen el scroll.</span>
          </label>
          <label className="field">
            Guion o estructura
            <textarea className="input textarea" name="structure" value={v.structure} onChange={(e) => setV({ ...v, structure: e.target.value })} data-testid="content-structure" />
          </label>
          <label className="field">
            Recursos
            <textarea className="input textarea" name="resources" value={v.resources} onChange={(e) => setV({ ...v, resources: e.target.value })} placeholder="Fotos, video, placas que hay que producir" />
          </label>
          <label className="field">
            Por qué esta pieza
            <textarea className="input textarea" name="rationale" value={v.rationale} onChange={(e) => setV({ ...v, rationale: e.target.value })} data-testid="content-rationale" />
          </label>
        </div>
      </details>
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
