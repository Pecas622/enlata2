"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { addDays } from "@/lib/calendar";
import { formatLabel } from "@/lib/channels";
import { generatorHref } from "@/lib/links";
import type { ResearchIdea, Source } from "@/lib/research";
import { addResearchIdea } from "./actions";

function IdeaRow({ researchId, brandId, idea, index, sources, today }: { researchId: string; brandId: string; idea: ResearchIdea; index: number; sources: Source[]; today: string }) {
  const [day, setDay] = useState(addDays(today, 2));
  const [contentId, setContentId] = useState(idea.content_id);
  const [error, setError] = useState("");
  const [pending, start] = useTransition();

  return (
    <div className="idea-row" data-testid="inv-idea">
      <div style={{ flex: "1 1 260px", minWidth: 0 }}>
        <b>{idea.topic}</b>
        <div className="sub">{idea.why}</div>
        <div className="sub">
          {idea.channel} · {formatLabel(idea.format, idea.channel)} · {idea.goal}
          {idea.sources.length > 0 && <> · <span className="sources">{idea.sources.map((u) => <a key={u} href={u} target="_blank" rel="noopener noreferrer" title={sources.find((s) => s.url === u)?.title || u}>fuente</a>)}</span></>}
        </div>
        {error && <div className="error" role="alert" style={{ marginTop: 6 }}>{error}</div>}
      </div>
      <div className="idea-actions">
        {contentId ? (
          <>
            <span className="ok" data-testid="inv-idea-added">En el calendario</span>
            <Link className="btn btn-secondary" href={`/generar?idea=${contentId}`}>Escribir</Link>
          </>
        ) : (
          <>
            <input className="input" type="date" value={day} min={today} onChange={(e) => setDay(e.target.value)} aria-label={`Día para ${idea.topic}`} data-testid="inv-idea-day" />
            <button
              className="btn btn-secondary"
              disabled={pending || !day}
              data-testid="inv-idea-add"
              onClick={() => start(async () => {
                setError("");
                const r = await addResearchIdea(researchId, index, day);
                if (r.error) setError(r.error); else setContentId(r.contentId);
              })}
            >
              {pending ? "Sumando…" : "Sumar al calendario"}
            </button>
            <Link className="btn btn-ghost" href={generatorHref(brandId, idea)}>Escribir ahora</Link>
          </>
        )}
      </div>
    </div>
  );
}

export function IdeaList({ researchId, brandId, ideas, sources, today }: { researchId: string; brandId: string; ideas: ResearchIdea[]; sources: Source[]; today: string }) {
  return (
    <div className="card stack" data-testid="inv-ideas">
      <h2 className="card-title" style={{ margin: 0 }}>Ideas para publicar</h2>
      {!ideas.length ? <div className="empty" style={{ padding: 16 }}>Esta investigación no trajo ideas.</div> : ideas.map((idea, i) => (
        <IdeaRow key={i} researchId={researchId} brandId={brandId} idea={idea} index={i} sources={sources} today={today} />
      ))}
      <p className="hint" style={{ margin: 0 }}>Al sumarla queda como idea en el calendario; después la escribís con el generador y pasa por aprobación como siempre.</p>
    </div>
  );
}
