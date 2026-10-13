"use client";

import { useState, useTransition } from "react";
import { Badge, Notice } from "@/components/ui";
import { CHANNELS, GOALS, formatLabel, formatsFor, type Channel, type Format } from "@/lib/channels";
import { generate, saveVariant, type GenInput, type GenResult } from "./actions";

type BrandOpt = { id: string; name: string; color: string };

export type IdeaInit = { id: string; title: string; brandId: string; channel: Channel; format: Format; goal: string; topic: string };

export type CampaignInit = { id: string; name: string; brandId: string; goal: string; offer: string };

export function GenerateForm({ brands, initialBrand, initialFormat, idea, campaign, aiEnabled }: {
  brands: BrandOpt[]; initialBrand?: string; initialFormat?: Format; idea?: IdeaInit; campaign?: CampaignInit; aiEnabled: boolean;
}) {
  const [input, setInput] = useState<GenInput>({
    brandId: idea?.brandId ?? campaign?.brandId ?? (initialBrand && brands.some((b) => b.id === initialBrand) ? initialBrand : brands[0]?.id ?? ""),
    channel: idea?.channel ?? "Instagram",
    format: idea?.format ?? initialFormat ?? "Post",
    goal: idea?.goal ?? campaign?.goal ?? "Vender",
    topic: idea?.topic ?? campaign?.name ?? "",
    offer: campaign?.offer ?? "",
    extra: "",
    seed: 0,
    ideaId: idea?.id,
    campaignId: campaign?.id,
  });
  // Si se escribe una idea del calendario, la marca, la red y el formato quedan fijos: son los de la idea.
  const locked = Boolean(idea);
  // En una campaña, la marca es la de la campaña.
  const brandLocked = locked || Boolean(campaign);
  const [result, setResult] = useState<GenResult | null>(null);
  const [saving, setSaving] = useState<number | null>(null);
  const [saveError, setSaveError] = useState("");
  const [pending, start] = useTransition();
  const set = (patch: Partial<GenInput>) => setInput((p) => ({ ...p, ...patch }));

  function pickChannel(c: Channel) {
    const formats = formatsFor(c);
    set({ channel: c, format: formats.includes(input.format as Format) ? input.format : formats[0] });
  }

  function run(seed: number) {
    const next = { ...input, seed };
    setInput(next);
    setSaveError("");
    start(async () => setResult(await generate(next)));
  }

  function save(i: number) {
    if (!result?.variants || !result.source) return;
    setSaving(i);
    start(async () => {
      const r = await saveVariant(input, result.variants![i], result.source!);
      if (r?.error) setSaveError(r.error);
      setSaving(null);
    });
  }

  return (
    <div className="stack" style={{ gap: 18 }}>
      <form className="card stack" onSubmit={(e) => { e.preventDefault(); run(0); }} data-testid="gen-form">
        {campaign && <Notice tone="blue">Pieza para la campaña “{campaign.name}”. La que guardes queda sumada a la campaña.</Notice>}
        {idea && <Notice tone="blue">Escribiendo la idea “{idea.title}” del calendario. La variante que guardes queda en esa misma pieza, con su fecha.</Notice>}
        <div className="row">
          <label className="field">
            Marca
            <select className="input" value={input.brandId} onChange={(e) => set({ brandId: e.target.value })} disabled={brandLocked} data-testid="gen-brand">
              {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </label>
          <label className="field">
            Objetivo
            <select className="input" value={input.goal} onChange={(e) => set({ goal: e.target.value })} data-testid="gen-goal">
              {GOALS.map((g) => <option key={g}>{g}</option>)}
            </select>
          </label>
        </div>
        <div className="field">
          Canal
          <div className="chips">
            {CHANNELS.map((c) => (
              <button type="button" key={c} className={`chip pick${input.channel === c ? " on" : ""}`} onClick={() => pickChannel(c)} disabled={locked && input.channel !== c} data-testid={`gen-channel-${c}`}>{c}</button>
            ))}
          </div>
        </div>
        <div className="field">
          Formato
          <div className="chips">
            {formatsFor(input.channel as Channel).map((f) => (
              <button type="button" key={f} className={`chip pick${input.format === f ? " on" : ""}`} onClick={() => set({ format: f })} disabled={locked && input.format !== f} data-testid={`gen-format-${f}`}>{formatLabel(f, input.channel as Channel)}</button>
            ))}
          </div>
        </div>
        <label className="field">
          ¿De qué querés hablar?
          <input className="input" value={input.topic} onChange={(e) => set({ topic: e.target.value })} placeholder="Medialunas de manteca, el service de bicis, la nueva colección…" required data-testid="gen-topic" />
        </label>
        <div className="row">
          <label className="field">
            Oferta o dato concreto (opcional)
            <input className="input" value={input.offer} onChange={(e) => set({ offer: e.target.value })} placeholder="2x1 los martes" data-testid="gen-offer" />
            <span className="hint">Solo se usa lo que escribas acá: nunca se inventan precios ni descuentos.</span>
          </label>
          <label className="field">
            Algo más para decir (opcional)
            <input className="input" value={input.extra} onChange={(e) => set({ extra: e.target.value })} placeholder="Abrimos el domingo a la mañana" data-testid="gen-extra" />
          </label>
        </div>
        <div className="row" style={{ alignItems: "center" }}>
          <button className="btn btn-primary" type="submit" disabled={pending || !input.brandId} data-testid="gen-submit">
            {pending && saving === null ? "Generando…" : "Generar 3 variantes"}
          </button>
          <span className="muted">{aiEnabled ? "Escribe con IA (Claude) usando los datos de la marca." : "Escribe con plantillas armadas con los datos de la marca."}</span>
        </div>
        {result?.error && <div className="error" role="alert">{result.error}</div>}
      </form>

      {result?.variants && (
        <div className="stack" data-testid="gen-results">
          <div className="page-head" style={{ marginBottom: 0 }}>
            <div className="status-bar">
              <h2 className="card-title" style={{ margin: 0 }}>Variantes</h2>
              <Badge tone={result.source === "ia" ? "blue" : "gray"}>{result.source === "ia" ? "Con IA" : "Con plantillas"}</Badge>
            </div>
            <button className="btn btn-secondary" type="button" onClick={() => run(input.seed + 1)} disabled={pending} data-testid="gen-again">Generar otras</button>
          </div>
          {result.notice && <Notice>{result.notice}</Notice>}
          {saveError && <div className="error" role="alert">{saveError}</div>}
          <div className="variants">
            {result.variants.map((v, i) => (
              <div className="card variant" key={i} data-testid="variant">
                <div className="variant-head">
                  <Badge tone="blue">{v.angle}</Badge>
                  <span className="muted">{(v.body + (v.hashtags ? "\n\n" + v.hashtags : "")).length} caracteres</span>
                </div>
                <pre className="copy">{v.body}{v.hashtags && <><br /><br /><span className="tags-line">{v.hashtags}</span></>}</pre>
                {v.warnings.length > 0 && <ul className="warn">{v.warnings.map((w) => <li key={w}>{w}</li>)}</ul>}
                <div className="row">
                  <button className="btn btn-primary" type="button" onClick={() => save(i)} disabled={pending} data-testid="variant-save">
                    {saving === i ? "Guardando…" : "Guardar en contenidos"}
                  </button>
                  <button className="btn btn-ghost" type="button" onClick={() => navigator.clipboard?.writeText(v.body + (v.hashtags ? "\n\n" + v.hashtags : ""))}>Copiar</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
