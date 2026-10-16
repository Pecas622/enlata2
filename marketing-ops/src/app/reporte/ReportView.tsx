"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { analyzeWithAI } from "@/app/(app)/metricas/actions";
import { fmtARS } from "@/lib/campaigns";
import { fmtDate } from "@/lib/dates";
import { fmtInt, fmtPct, plural } from "@/lib/metrics";
import { ALL_SHOWN, NOTE_MAX, SECTIONS, reportText, reportTitle, type Report, type Shown } from "@/lib/report";

export function ReportView({ report: initial, dates, madeOn, color, logoUrl, mes, brandId, brands, aiEnabled }: {
  report: Report; dates: string; madeOn: string; color: string | null; logoUrl: string | null;
  mes: string | null; brandId: string | null; brands: { id: string; name: string }[]; aiEnabled: boolean;
}) {
  const [report, setReport] = useState(initial);
  const [note, setNote] = useState("");
  const [shown, setShown] = useState<Shown>(ALL_SHOWN);
  const [copied, setCopied] = useState(false);
  const [source, setSource] = useState<"ia" | "reglas">("reglas");
  const [notice, setNotice] = useState("");
  const [pending, start] = useTransition();
  const back = `/metricas${mes || brandId ? `?${new URLSearchParams({ ...(mes ? { mes } : {}), ...(brandId ? { marca: brandId } : {}) })}` : ""}`;
  const a = report.analysis;

  async function copy() {
    try {
      await navigator.clipboard.writeText(reportText(report, note, shown));
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      setNotice("El navegador no dejó copiar: usá Imprimir o guardar PDF.");
    }
  }

  return (
    <div className="report-page">
      <aside className="report-tools noprint" data-testid="report-tools">
        <Link href={back} className="btn btn-ghost btn-sm">‹ Volver a Métricas</Link>
        <div>
          <h1 className="card-title" style={{ margin: "4px 0 2px" }}>Reporte para el cliente</h1>
          <span className="hint">Revisalo, sumale unas líneas y mandalo en PDF o como texto por WhatsApp o email.</span>
        </div>
        {brands.length > 0 && (
          <div className="stack" style={{ gap: 6 }}>
            <span className="hint">{brandId ? "Marca" : "Es el reporte de todas las marcas. Para un cliente, elegí su marca:"}</span>
            <div className="pills" style={{ margin: 0 }}>
              {brands.map((b) => (
                <Link key={b.id} className={`pill${b.id === brandId ? " active" : ""}`} href={`/reporte?${new URLSearchParams({ ...(mes ? { mes } : {}), marca: b.id })}`} data-testid="report-brand">{b.name}</Link>
              ))}
            </div>
          </div>
        )}
        <label className="field">
          Unas líneas para el cliente (opcional)
          <textarea className="input textarea" value={note} maxLength={NOTE_MAX} onChange={(e) => setNote(e.target.value)} placeholder="Ej.: Hola Marta, te paso cómo nos fue este mes. Lo más fuerte fueron los Reels del horno." data-testid="report-note" />
        </label>
        <div className="stack" style={{ gap: 4 }}>
          <span className="hint">Qué va en el reporte</span>
          {SECTIONS.map((s) => (
            <label key={s.key} className="check">
              <input type="checkbox" checked={shown[s.key]} onChange={(e) => setShown({ ...shown, [s.key]: e.target.checked })} data-testid={`report-show-${s.key}`} /> {s.label}
            </label>
          ))}
        </div>
        {aiEnabled && report.withResults > 0 && source === "reglas" && (
          <button
            className="btn btn-secondary" disabled={pending} data-testid="report-ai"
            onClick={() => start(async () => {
              const r = await analyzeWithAI(mes, brandId);
              if (r.error) { setNotice(r.error); return; }
              if (r.analysis) { setReport({ ...report, analysis: r.analysis }); setSource(r.source ?? "reglas"); }
              setNotice(r.notice ?? "");
            })}
          >
            {pending ? "Analizando…" : "Escribir el análisis con IA"}
          </button>
        )}
        {notice && <div className="notice notice-amber">{notice}</div>}
        <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
          <button className="btn btn-primary" onClick={() => window.print()} data-testid="report-print">Imprimir o guardar PDF</button>
          <button className="btn btn-secondary" onClick={copy} data-testid="report-copy">{copied ? "¡Copiado!" : "Copiar como texto"}</button>
        </div>
        <span className="hint">Para el PDF, en la ventana de imprimir elegí &quot;Guardar como PDF&quot;.</span>
      </aside>

      <article className="report-sheet" data-testid="report-sheet" style={color ? ({ "--report-accent": color } as React.CSSProperties) : undefined}>
        <header className="report-head">
          <div>
            <span className="report-kicker">Reporte de redes</span>
            <h1 data-testid="report-title">{reportTitle(report)}</h1>
            <span className="report-muted">{dates}{report.preparedBy ? ` · Preparado por ${report.preparedBy}` : ""} · {madeOn}</span>
          </div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {logoUrl && <img src={logoUrl} alt="" className="report-logo" />}
        </header>

        {note.trim() && <p className="report-note" data-testid="report-note-out">{note.trim()}</p>}

        <section className="report-kpis" data-testid="report-kpis">
          {report.kpis.map((k) => (
            <div key={k.key} className="report-kpi"><span>{k.label}</span><b>{k.value}</b><small>{k.note}</small></div>
          ))}
        </section>

        <section>
          <h2>Resumen</h2>
          <p data-testid="report-summary">{a.summary}</p>
          {source === "ia" && <span className="report-muted">Análisis escrito con IA a partir de los resultados cargados.</span>}
        </section>

        {shown.analysis && (a.worked.length > 0 || a.didnt.length > 0) && (
          <section className="report-two" data-testid="report-analysis">
            {a.worked.length > 0 && (
              <div>
                <h2>Qué funcionó</h2>
                {a.worked.map((i, n) => <div key={n} className="report-item good"><b>{i.title}</b><span>{i.detail}</span></div>)}
              </div>
            )}
            {a.didnt.length > 0 && (
              <div>
                <h2>Qué no funcionó</h2>
                {a.didnt.map((i, n) => <div key={n} className="report-item bad"><b>{i.title}</b><span>{i.detail}</span></div>)}
              </div>
            )}
          </section>
        )}

        {shown.top && report.top.length > 0 && (
          <section data-testid="report-top">
            <h2>Lo mejor del período</h2>
            <table className="report-table">
              <thead><tr><th>Pieza</th><th>Publicada</th><th className="r">Alcanzadas</th><th className="r">Interacción</th><th className="r">Consultas</th></tr></thead>
              <tbody>
                {report.top.map((p) => (
                  <tr key={p.id}><td><b>{p.title}</b><div className="report-muted">{p.where}</div></td><td>{fmtDate(p.day)}</td><td className="r">{fmtInt(p.reach)}</td><td className="r">{p.engagement}</td><td className="r">{fmtInt(p.inquiries)}</td></tr>
                ))}
              </tbody>
            </table>
          </section>
        )}

        {shown.breakdown && (report.formats.length > 0 || report.channels.length > 0) && (
          <section className="report-two" data-testid="report-breakdown">
            <div>
              <h2>Por formato</h2>
              {report.formats.map((g) => <div key={g.key} className="report-line"><span>{plural(g.key)} <small>({g.count})</small></span><b>{fmtPct(g.engagement)}</b></div>)}
              <span className="report-muted">Interacción sobre las personas alcanzadas.</span>
            </div>
            <div>
              <h2>Por red</h2>
              {report.channels.map((g) => <div key={g.key} className="report-line"><span>{g.key}</span><b>{fmtInt(g.totals.reach)} alcanzadas · {fmtInt(g.totals.inquiries)} consultas</b></div>)}
            </div>
          </section>
        )}

        {shown.campaigns && report.campaigns.length > 0 && (
          <section data-testid="report-campaigns">
            <h2>Campañas</h2>
            <table className="report-table">
              <thead><tr><th>Campaña</th><th className="r">Alcanzadas</th><th className="r">Consultas</th><th className="r">Invertido</th><th className="r">Por consulta</th></tr></thead>
              <tbody>
                {report.campaigns.map((c) => (
                  <tr key={c.name}><td><b>{c.name}</b><div className="report-muted">{c.pieces} {c.pieces === 1 ? "pieza" : "piezas"}</div></td><td className="r">{fmtInt(c.reach)}</td><td className="r">{fmtInt(c.inquiries)}</td><td className="r">{c.spend ? fmtARS(c.spend) : "-"}</td><td className="r">{c.cpi ? fmtARS(c.cpi) : "-"}</td></tr>
                ))}
              </tbody>
            </table>
          </section>
        )}

        {shown.next && a.next.length > 0 && (
          <section data-testid="report-next">
            <h2>Para el mes que viene</h2>
            <ul>{a.next.map((n, i) => <li key={i}>{n}</li>)}</ul>
          </section>
        )}

        {report.published > report.withResults && (
          <p className="report-muted">{report.published - report.withResults} de {report.published} piezas publicadas todavía no tienen resultados cargados y no entran en los números.</p>
        )}
      </article>
    </div>
  );
}
