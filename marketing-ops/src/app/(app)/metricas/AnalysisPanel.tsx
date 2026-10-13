"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { Badge, Notice } from "@/components/ui";
import type { Analysis } from "@/lib/metrics";
import { analyzeWithAI } from "./actions";

export function AnalysisPanel({ initial, aiEnabled, mes, brandId, planHref }: { initial: Analysis; aiEnabled: boolean; mes: string | null; brandId: string | null; planHref?: string }) {
  const [analysis, setAnalysis] = useState(initial);
  const [source, setSource] = useState<"ia" | "reglas">("reglas");
  const [notice, setNotice] = useState("");
  const [pending, start] = useTransition();
  const hasData = initial.worked.length + initial.didnt.length > 0;

  return (
    <div className="card stack" data-testid="analysis" aria-busy={pending}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <h2 className="card-title" style={{ margin: 0 }}>Qué funcionó</h2>
        {source === "ia" ? <Badge tone="blue">Analizado con IA</Badge> : aiEnabled && hasData && (
          <button
            className="btn btn-secondary"
            disabled={pending}
            data-testid="analysis-ai"
            onClick={() => start(async () => {
              const r = await analyzeWithAI(mes, brandId);
              if (r.error) { setNotice(r.error); return; }
              if (r.analysis) { setAnalysis(r.analysis); setSource(r.source ?? "reglas"); }
              setNotice(r.notice ?? "");
            })}
          >
            {pending ? "Analizando…" : "Analizar con IA"}
          </button>
        )}
      </div>
      {notice && <Notice>{notice}</Notice>}
      <p style={{ margin: 0 }} data-testid="analysis-summary">{analysis.summary}</p>

      {analysis.worked.length > 0 && (
        <div className="insights">
          <h3>Funcionó</h3>
          {analysis.worked.map((w, i) => <div key={i} className="insight good" data-testid="insight-good"><b>{w.title}</b><span>{w.detail}</span></div>)}
        </div>
      )}
      {analysis.didnt.length > 0 && (
        <div className="insights">
          <h3>No funcionó</h3>
          {analysis.didnt.map((w, i) => <div key={i} className="insight bad" data-testid="insight-bad"><b>{w.title}</b><span>{w.detail}</span></div>)}
        </div>
      )}
      {analysis.next.length > 0 && (
        <div className="insights">
          <h3>Para el mes que viene</h3>
          <ul className="next-list" data-testid="insight-next">
            {analysis.next.map((n, i) => <li key={i}>{n}</li>)}
          </ul>
        </div>
      )}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        {planHref && <Link className="btn btn-primary" href={planHref} data-testid="analysis-plan">Armar el plan del mes que viene</Link>}
        <span className="hint">{source === "ia" ? "Lo escribió Claude con los resultados cargados; los números que no estaban en los datos se descartan." : "Sale de comparar los resultados cargados."}</span>
      </div>
    </div>
  );
}
