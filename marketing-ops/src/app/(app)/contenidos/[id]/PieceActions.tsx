"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { CHANNELS, formatLabel, formatsFor, type Channel, type Format } from "@/lib/channels";
import { adaptContent, deleteContent, duplicateContent } from "../actions";

// Duplicar, adaptar a otra red, regenerar el texto y borrar. Se usa en la pieza y en la vista del día del calendario.
export function PieceActions({ id, channel, format, canRegen, canDelete, back, compact }: {
  id: string; channel: Channel; format: Format; canRegen: boolean; canDelete: boolean; back?: string; compact?: boolean;
}) {
  const [mode, setMode] = useState<"" | "adapt" | "delete">("");
  const firstOther = CHANNELS.find((c) => c !== channel) ?? "Instagram";
  const [to, setTo] = useState<{ channel: Channel; format: Format }>({ channel: firstOther, format: formatsFor(firstOther).find((f) => f === format) ?? formatsFor(firstOther)[0] });
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<{ error?: string } | undefined>) => { setError(""); start(async () => { const r = await fn(); if (r?.error) setError(r.error); }); };

  return (
    <div className="stack" style={{ gap: 8 }} data-testid="piece-actions">
      <div className="row" style={{ gap: 6 }}>
        <button className="btn btn-secondary btn-sm" disabled={pending} onClick={() => run(() => duplicateContent(id))} data-testid="piece-duplicate">Duplicar</button>
        <button className={`btn btn-secondary btn-sm${mode === "adapt" ? " on" : ""}`} disabled={pending} onClick={() => setMode(mode === "adapt" ? "" : "adapt")} data-testid="piece-adapt">Adaptar a otra red</button>
        {canRegen && <Link className="btn btn-secondary btn-sm" href={`/generar?idea=${id}`} data-testid="piece-regen">Regenerar texto</Link>}
        {canDelete && <button className="btn btn-ghost btn-sm danger" disabled={pending} onClick={() => setMode(mode === "delete" ? "" : "delete")} data-testid="piece-delete">Borrar</button>}
      </div>
      {mode === "adapt" && (
        <div className="row" style={{ alignItems: "flex-end", gap: 8 }}>
          <label className="field" style={{ flex: "0 1 150px" }}>
            Red
            <select className="input" value={to.channel} onChange={(e) => { const c = e.target.value as Channel; setTo({ channel: c, format: formatsFor(c).includes(to.format) ? to.format : formatsFor(c)[0] }); }} data-testid="adapt-channel">
              {CHANNELS.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>
          <label className="field" style={{ flex: "0 1 170px" }}>
            Formato
            <select className="input" value={to.format} onChange={(e) => setTo({ ...to, format: e.target.value as Format })} data-testid="adapt-format">
              {formatsFor(to.channel).map((f) => <option key={f} value={f}>{formatLabel(f, to.channel)}</option>)}
            </select>
          </label>
          <button className="btn btn-primary btn-sm" disabled={pending} onClick={() => run(() => adaptContent(id, to.channel, to.format))} data-testid="adapt-go">
            {pending ? "Escribiendo…" : "Crear la versión"}
          </button>
        </div>
      )}
      {mode === "delete" && (
        <div className="row" style={{ alignItems: "center", gap: 8 }}>
          <span className="muted">¿Borrar esta pieza? Se va con su historial y no se puede deshacer.</span>
          <button className="btn btn-sm danger-solid" disabled={pending} onClick={() => run(() => deleteContent(id, back))} data-testid="piece-delete-confirm">Sí, borrar</button>
          <button className="btn btn-ghost btn-sm" onClick={() => setMode("")}>Cancelar</button>
        </div>
      )}
      {!compact && mode === "" && <span className="hint">Adaptar escribe la misma idea con la forma de la otra red y la deja como borrador el mismo día.</span>}
      {error && <div className="error" role="alert">{error}</div>}
    </div>
  );
}
