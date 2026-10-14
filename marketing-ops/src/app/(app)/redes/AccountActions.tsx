"use client";

import { useState, useTransition } from "react";
import { checkSocial, disconnectSocial } from "./actions";

export function AccountActions({ id, canDisconnect }: { id: string; canDisconnect: boolean }) {
  const [msg, setMsg] = useState<{ ok?: string; error?: string }>({});
  const [confirm, setConfirm] = useState(false);
  const [pending, start] = useTransition();
  return (
    <div className="stack" style={{ gap: 6 }} aria-busy={pending}>
      <div className="row" style={{ gap: 6 }}>
        <button className="btn btn-secondary btn-sm" disabled={pending} onClick={() => start(async () => setMsg(await checkSocial(id)))} data-testid="social-check">
          {pending ? "Probando…" : "Probar conexión"}
        </button>
        {canDisconnect && !confirm && <button className="btn btn-ghost btn-sm danger" onClick={() => setConfirm(true)} data-testid="social-disconnect">Desconectar</button>}
        {confirm && (
          <>
            <button className="btn btn-sm danger-solid" disabled={pending} onClick={() => start(async () => setMsg(await disconnectSocial(id)))} data-testid="social-disconnect-confirm">Sí, desconectar</button>
            <button className="btn btn-ghost btn-sm" onClick={() => setConfirm(false)}>No</button>
          </>
        )}
      </div>
      {msg.ok && <span className="ok" style={{ fontSize: 13 }} data-testid="social-msg">{msg.ok}</span>}
      {msg.error && <span className="error" role="alert" style={{ fontSize: 13 }} data-testid="social-msg">{msg.error}</span>}
    </div>
  );
}
