"use client";

import { useState, useTransition } from "react";
import { pagar } from "./actions";

export function PayButton({ item, label, testId, className = "btn btn-primary" }: { item: string; label: string; testId: string; className?: string }) {
  const [error, setError] = useState<string>();
  const [pending, start] = useTransition();
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "flex-end" }}>
      <button type="button" className={className} disabled={pending} data-testid={testId}
        onClick={() => start(async () => { const r = await pagar(item); if (r?.error) setError(r.error); })}>
        {pending ? "Abriendo Mercado Pago…" : label}
      </button>
      {error && <div className="error" role="alert">{error}</div>}
    </div>
  );
}
