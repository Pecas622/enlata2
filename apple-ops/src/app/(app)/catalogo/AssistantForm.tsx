"use client";

import { useActionState } from "react";
import { saveAssistant, type FormState } from "./actions";

export type AssistantSettings = { slug: string; assistant_on: boolean; assistant_name: string; greeting: string };

export function AssistantForm({ s, ai }: { s: AssistantSettings; ai: boolean }) {
  const [state, action, pending] = useActionState<FormState, FormData>(saveAssistant, {});
  return (
    <form action={action} className="stack">
      <input type="hidden" name="slug" value={s.slug} />
      <label className="row" style={{ alignItems: "center", gap: 8, fontSize: 13 }}>
        <input type="checkbox" name="assistant_on" defaultChecked={s.assistant_on} data-testid="assist-on" /> Mostrar el botón &quot;Preguntanos&quot; en el catálogo
      </label>
      <div className="row">
        <label className="field">Nombre del asistente<input className="input" name="assistant_name" defaultValue={s.assistant_name} maxLength={40} data-testid="assist-name" /></label>
        <label className="field">
          Saludo inicial
          <input className="input" name="greeting" defaultValue={s.greeting} maxLength={300} data-testid="assist-greeting" />
          <span>Vacío = saludo por defecto.</span>
        </label>
      </div>
      <p className="muted" style={{ margin: 0, fontSize: 12 }} data-testid="assist-engine">
        {ai
          ? "Responde con IA (Claude), consultando el stock y la tabla de canje del local. Si la IA no responde, sigue el motor automático."
          : "Responde con el motor automático (reglas). Para usar IA, cargá ANTHROPIC_API_KEY en las variables del servidor."}
        {" "}Nunca inventa precios: todo sale del stock y de la tabla de tasación. Deriva a WhatsApp ante reclamos, descuentos, cuotas o equipos sin referencia.
      </p>
      {state.error && <div className="error" role="alert" data-testid="form-error">{state.error}</div>}
      {state.ok && !pending && <div className="ok" data-testid="assist-saved">Asistente guardado.</div>}
      <div><button className="btn btn-primary" disabled={pending} data-testid="assist-save">{pending ? "Guardando…" : "Guardar asistente"}</button></div>
    </form>
  );
}
