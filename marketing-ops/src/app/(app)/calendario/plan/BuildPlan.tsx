"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { buildPlan } from "../actions";

export function BuildPlan({ brandId, month, aiEnabled, disabled, again }: { brandId: string; month: string; aiEnabled: boolean; disabled: boolean; again: boolean }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const label = aiEnabled ? (again ? "Armar otro plan con IA" : "Armar plan con IA") : again ? "Armar otro plan" : "Armar plan";
  return (
    <div className="stack" aria-busy={pending}>
      {error && <div className="error" role="alert">{error}</div>}
      <div className="row" style={{ alignItems: "center" }}>
        <button
          className="btn btn-primary"
          disabled={pending || disabled}
          data-testid="plan-build"
          onClick={() => {
            setError("");
            start(async () => {
              const r = await buildPlan(brandId, month);
              if (r.error) setError(r.error);
              else router.refresh();
            });
          }}
        >
          {pending ? "Armando el plan…" : label}
        </button>
        <span className="muted">
          {pending
            ? aiEnabled ? "La IA está pensando el mes y escribiendo cada pieza. Puede tardar uno o dos minutos." : "Armando…"
            : aiEnabled ? "Usa la marca, su última investigación, lo que funcionó y las fechas comerciales." : "Sin clave de IA lo arman las reglas y las plantillas."}
        </span>
      </div>
    </div>
  );
}
