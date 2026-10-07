"use client";

import { useState, useTransition } from "react";
import { FX_SOURCE_LABEL, FX_SOURCES, type FxSource } from "@/lib/fx";
import { fmtARS } from "@/lib/money";
import { actualizarCotizacion, guardarDolarYAlertas } from "./actions";

export function FxCard({ source, extra, staleDays, fx, updatedAt }: { source: FxSource; extra: number; staleDays: number; fx: number; updatedAt: string | null }) {
  const [src, setSrc] = useState<FxSource>(source);
  const [ext, setExt] = useState(String(extra));
  const [days, setDays] = useState(String(staleDays));
  const [msg, setMsg] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const run = (fn: () => Promise<{ error?: string; warning?: string }>, ok: string) => {
    setMsg(null);
    startTransition(async () => {
      const r = await fn();
      setMsg(r.error ? { tone: "error", text: r.error } : { tone: r.warning ? "error" : "ok", text: r.warning ?? ok });
    });
  };
  const save = () => run(() => guardarDolarYAlertas({ source: src, extra: Number(ext) || 0, staleDays: Number(days) || 0 }), "Guardado.");

  return (
    <div className="card stack" data-testid="fx-card">
      <h2 className="card-title" style={{ margin: 0 }}>Dólar y alertas</h2>
      <div className="row">
        <label className="field">
          Cotización del dólar
          <select className="input" value={src} onChange={(e) => setSrc(e.target.value as FxSource)} data-testid="fx-source">
            {FX_SOURCES.map((s) => <option key={s} value={s}>{FX_SOURCE_LABEL[s]}</option>)}
          </select>
          <span>{src === "manual" ? "La cargás vos en Reglas comerciales." : "Precio de venta, se actualiza sola cada media hora mientras se usa la app y una vez por día."}</span>
        </label>
        {src !== "manual" && (
          <label className="field">
            Ajuste (ARS)
            <input className="input" type="number" step="1" value={ext} onChange={(e) => setExt(e.target.value)} data-testid="fx-extra" />
            <span>Se suma a la cotización. Puede ser negativo.</span>
          </label>
        )}
        <label className="field">
          Avisar equipo parado a los (días)
          <input className="input" type="number" min={1} max={365} value={days} onChange={(e) => setDays(e.target.value)} data-testid="stale-days" />
        </label>
      </div>
      {source !== "manual" && (
        <p className="muted" style={{ margin: 0 }} data-testid="fx-status">
          Hoy: {fmtARS(fx)} por dólar ({FX_SOURCE_LABEL[source]}{extra ? ` ${extra > 0 ? "+" : "−"} ${fmtARS(Math.abs(extra))}` : ""}).{" "}
          {updatedAt ? `Actualizada el ${new Date(updatedAt).toLocaleString("es-AR", { timeZone: "America/Argentina/Mendoza", dateStyle: "short", timeStyle: "short" })}.` : "Todavía no se consultó."}
        </p>
      )}
      {msg && <div className={msg.tone} role={msg.tone === "error" ? "alert" : undefined} data-testid="fx-msg">{msg.text}</div>}
      <div className="row">
        <button className="btn btn-primary" onClick={save} disabled={pending} data-testid="fx-save">{pending ? "Guardando…" : "Guardar"}</button>
        {source !== "manual" && <button className="btn btn-secondary" onClick={() => run(actualizarCotizacion, "Cotización actualizada.")} disabled={pending} data-testid="fx-refresh">Actualizar ahora</button>}
      </div>
    </div>
  );
}
