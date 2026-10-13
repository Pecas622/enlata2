"use client";

import Link from "next/link";
import { useState } from "react";
import { Badge } from "@/components/ui";
import { fmtARS, type Brief as BriefData } from "@/lib/campaigns";

export function Brief({ brief: b, text, generateHref }: { brief: BriefData; text: string; generateHref?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="card stack" data-testid="brief">
      <div className="status-bar" style={{ justifyContent: "space-between" }}>
        <h2 className="card-title" style={{ margin: 0 }}>Brief para Meta Ads</h2>
        <button
          className="btn btn-secondary"
          type="button"
          onClick={() => { navigator.clipboard?.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
          data-testid="brief-copy"
        >
          {copied ? "Copiado" : "Copiar brief"}
        </button>
      </div>
      <p className="muted" style={{ margin: 0 }}>Lo que hay que cargar en el Administrador de anuncios. Lo marcado como sugerido revisalo antes de publicar.</p>
      {b.missing.length > 0 && <ul className="warn" data-testid="brief-missing">{b.missing.map((m) => <li key={m}>{m}</li>)}</ul>}

      <div className="brief-block">
        <h3>Objetivo</h3>
        <div className="facts" style={{ margin: 0 }}>
          <span>Objetivo de la campaña</span><b data-testid="brief-objective">{b.objective.objective}</b>
          <span>A dónde lleva</span><b>{b.objective.destination}</b>
          <span>Botón</span><b>{b.objective.button}</b>
        </div>
        <p className="muted" style={{ margin: "6px 0 0" }}>{b.objective.why}</p>
      </div>

      <div className="brief-block">
        <h3>Presupuesto y fechas</h3>
        <div className="facts" style={{ margin: 0 }}>
          <span>Fechas</span><b>{b.dates} ({b.days} días)</b>
          <span>Total</span><b>{b.budget > 0 ? fmtARS(b.budget) : "A definir"}</b>
          <span>Por día</span><b data-testid="brief-daily">{b.budget > 0 ? fmtARS(b.daily) : "-"}</b>
        </div>
      </div>

      <div className="brief-block">
        <h3>Público</h3>
        <div className="facts" style={{ margin: 0 }}>
          <span>Ubicación</span><b>{b.locations || "A definir"}{b.locationsSuggested && b.locations && <> <Badge tone="gray">de la marca</Badge></>}</b>
          <span>Edad</span><b>{b.ages}</b>
          <span>A quién</span><b>{b.audience || "A definir"}</b>
        </div>
        <div className="field" style={{ marginTop: 8 }}>
          Intereses{b.interestsSuggested && " sugeridos: buscalos en Meta, que tiene su propia lista"}
          <div className="tags">{b.interests.map((i) => <Badge key={i} tone="blue">{i}</Badge>)}</div>
        </div>
      </div>

      <div className="brief-block">
        <h3>Ubicaciones</h3>
        <div className="tags">{b.placements.map((p) => <Badge key={p}>{p}</Badge>)}</div>
      </div>

      <div className="brief-block">
        <div className="status-bar" style={{ justifyContent: "space-between" }}>
          <h3>Textos de los anuncios</h3>
          <Badge tone={b.ads[0]?.source === "pieza" ? "green" : "gray"}>{b.ads[0]?.source === "pieza" ? "De las piezas de la campaña" : "Propuestos con plantillas"}</Badge>
        </div>
        {b.ads[0]?.source !== "pieza" && (
          <p className="muted" style={{ margin: "0 0 8px" }}>
            Todavía no hay anuncios escritos en la campaña.{generateHref && <> <Link href={generateHref} style={{ color: "var(--accent)" }}>Generá uno</Link> para revisarlo y aprobarlo.</>}
          </p>
        )}
        <div className="stack" style={{ gap: 10 }}>
          {b.ads.map((a, i) => (
            <div key={i} className="ad-mock" data-testid="brief-ad">
              <p>{a.primary}</p>
              <div className="ad-foot">
                <div><b>{a.title}</b><small>{a.description}</small></div>
                <span className="ad-btn">{a.button}</span>
              </div>
              {a.warnings.length > 0 && <ul className="warn" style={{ marginTop: 6 }}>{a.warnings.map((w) => <li key={w}>{w}</li>)}</ul>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
