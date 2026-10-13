"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Notice } from "@/components/ui";
import { runResearch } from "./actions";

export function ResearchForm({ brandId, brandName, city, aiEnabled }: { brandId: string; brandName: string; city: string; aiEnabled: boolean }) {
  const router = useRouter();
  const [focus, setFocus] = useState("");
  const [error, setError] = useState("");
  const [pending, start] = useTransition();

  return (
    <form
      className="card stack"
      aria-busy={pending}
      data-testid="inv-form"
      onSubmit={(e) => {
        e.preventDefault();
        setError("");
        start(async () => {
          const r = await runResearch(brandId, focus);
          if (r.error) { setError(r.error); return; }
          setFocus("");
          router.push(`/investigar?marca=${brandId}&id=${r.id}`);
        });
      }}
    >
      <label className="field">
        ¿Algo en particular? <span className="muted">(opcional)</span>
        <input
          className="input"
          value={focus}
          onChange={(e) => setFocus(e.target.value)}
          maxLength={300}
          placeholder="Competidores que querés mirar, una fecha que se viene o un producto"
          data-testid="inv-focus"
          disabled={!aiEnabled || pending}
        />
      </label>
      {!aiEnabled && <Notice tone="blue">Para investigar en internet hace falta la clave de Anthropic (ANTHROPIC_API_KEY) en el servidor. Mientras tanto tenés las ideas de abajo.</Notice>}
      {error && <div className="error" role="alert">{error}</div>}
      <div className="row" style={{ alignItems: "center" }}>
        <button className="btn btn-primary" type="submit" disabled={!aiEnabled || pending} data-testid="inv-run">
          {pending ? "Investigando…" : "Investigar con IA"}
        </button>
        <span className="muted">
          {pending ? "Está buscando en internet. Puede tardar uno o dos minutos." : `Busca competidores de ${brandName}${city ? ` en ${city}` : ""} y lo que se está hablando del rubro.`}
        </span>
      </div>
    </form>
  );
}
