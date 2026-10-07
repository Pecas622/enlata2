"use client";

import { useState, useTransition } from "react";
import { borrarDemo, cargarDemo } from "./actions";

// Demo para mostrarle el sistema a un cliente: se carga en un local vacío y se borra antes de entregarlo.
export function DemoCard({ demoSince, hasData }: { demoSince: string | null; hasData: boolean }) {
  const [confirm, setConfirm] = useState("");
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const run = (fn: () => Promise<{ error?: string }>) => {
    setError(null);
    startTransition(async () => {
      const res = await fn();
      if (res.error) setError(res.error);
      else { setAsking(false); setConfirm(""); }
    });
  };

  return (
    <div className="card stack" data-testid="demo-card">
      <h2 className="card-title" style={{ margin: 0 }}>Demo para clientes</h2>
      {demoSince ? (
        <>
          <p className="muted" style={{ margin: 0 }}>
            Este local tiene datos de demostración desde el{" "}
            {new Date(demoSince).toLocaleDateString("es-AR", { timeZone: "America/Argentina/Mendoza" })}. Antes de entregarlo,
            borrala: se eliminan equipos, accesorios, clientes, ventas, cajas, chats e historial. Quedan el local, los usuarios,
            la configuración, la tabla de tasación y el catálogo.
          </p>
          {!asking ? (
            <div><button className="btn btn-secondary" onClick={() => setAsking(true)} data-testid="demo-clear">Borrar demo y dejar el local en cero</button></div>
          ) : (
            <div className="stack">
              <label className="field">
                Escribí BORRAR para confirmar. No se puede deshacer.
                <input className="input" value={confirm} onChange={(e) => setConfirm(e.target.value)} data-testid="demo-confirm" />
              </label>
              <div className="row">
                <button className="btn btn-danger" disabled={confirm.trim().toUpperCase() !== "BORRAR" || pending} onClick={() => run(borrarDemo)} data-testid="demo-clear-confirm">
                  {pending ? "Borrando…" : "Borrar todo"}
                </button>
                <button className="btn btn-ghost" onClick={() => { setAsking(false); setConfirm(""); }} disabled={pending}>Cancelar</button>
              </div>
            </div>
          )}
        </>
      ) : hasData ? (
        <p className="muted" style={{ margin: 0 }}>La demo solo se puede cargar en un local sin datos. Este local ya tiene equipos, ventas o clientes propios.</p>
      ) : (
        <>
          <p className="muted" style={{ margin: 0 }}>
            Carga equipos, accesorios, clientes y una semana de ventas y cajas de ejemplo, para mostrar el sistema funcionando.
            Cuando el cliente lo compre, la borrás desde acá y el local queda en cero.
          </p>
          <div><button className="btn btn-primary" onClick={() => run(cargarDemo)} disabled={pending} data-testid="demo-load">{pending ? "Cargando…" : "Cargar demo"}</button></div>
        </>
      )}
      {error && <div className="error" role="alert" data-testid="demo-error">{error}</div>}
    </div>
  );
}
