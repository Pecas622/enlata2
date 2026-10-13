"use client";

import { useActionState, useState } from "react";
import type { Action } from "@/lib/workflow";
import { moveContent, type ActionState } from "../actions";

export function StatusActions({ id, actions }: { id: string; actions: Action[] }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(moveContent, {});
  const [asking, setAsking] = useState<Action | null>(null);
  if (!actions.length) return null;
  return (
    <div className="stack">
      {asking ? (
        <form action={action} className="stack">
          <input type="hidden" name="id" value={id} />
          <input type="hidden" name="to" value={asking.to} />
          <input type="hidden" name="needsNote" value="1" />
          <label className="field">
            ¿Qué hay que cambiar?
            <textarea className="input textarea" name="note" required autoFocus data-testid="status-note" placeholder="Sacá el emoji del final y nombrá la promo en la primera línea." />
          </label>
          <div className="row">
            <button className="btn btn-primary" type="submit" disabled={pending} data-testid="status-note-send">{asking.label}</button>
            <button className="btn btn-ghost" type="button" onClick={() => setAsking(null)}>Cancelar</button>
          </div>
        </form>
      ) : (
        <div className="row">
          {actions.map((a) =>
            a.needsNote ? (
              <button key={a.to} type="button" className={`btn btn-${a.tone}`} onClick={() => setAsking(a)} data-testid={`status-${a.label}`}>{a.label}</button>
            ) : (
              <form key={a.to} action={action}>
                <input type="hidden" name="id" value={id} />
                <input type="hidden" name="to" value={a.to} />
                <button className={`btn btn-${a.tone}`} type="submit" disabled={pending} data-testid={`status-${a.label}`}>{a.label}</button>
              </form>
            ),
          )}
        </div>
      )}
      {state.error && <div className="error" role="alert">{state.error}</div>}
    </div>
  );
}
