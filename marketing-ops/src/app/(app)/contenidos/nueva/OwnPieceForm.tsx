"use client";

import { useActionState, useState } from "react";
import { CHANNELS, GOALS, formatLabel, formatsFor, type Channel, type Format } from "@/lib/channels";
import { saveOwnPiece, type OwnPieceState } from "./actions";

type CampaignOpt = { id: string; name: string; brandId: string; goal: string };

// Un anuncio se carga con estos campos para que el brief de la campaña lo lea tal cual.
const AD_TEMPLATE = "Texto principal: \nTítulo: \nDescripción: \nBotón: ";

export function OwnPieceForm({ brands, campaigns, initialCampaign }: { brands: { id: string; name: string }[]; campaigns: CampaignOpt[]; initialCampaign?: string }) {
  const [state, action, pending] = useActionState<OwnPieceState, FormData>(saveOwnPiece, {});
  const start = campaigns.find((c) => c.id === initialCampaign);
  const [brandId, setBrandId] = useState(start?.brandId ?? brands[0]?.id ?? "");
  const [channel, setChannel] = useState<Channel>("Instagram");
  const [format, setFormat] = useState<Format>("Post");
  const [campaignId, setCampaignId] = useState(start?.id ?? "");
  const [body, setBody] = useState("");
  const brandCampaigns = campaigns.filter((c) => c.brandId === brandId);

  function pickChannel(c: Channel) {
    setChannel(c);
    const formats = formatsFor(c);
    if (!formats.includes(format)) pickFormat(formats[0]);
  }
  function pickFormat(f: Format) {
    setFormat(f);
    if (f === "Anuncio" && !body.trim()) setBody(AD_TEMPLATE);
    if (f !== "Anuncio" && body === AD_TEMPLATE) setBody("");
  }

  return (
    <form action={action} className="card stack" data-testid="own-form">
      <input type="hidden" name="channel" value={channel} />
      <input type="hidden" name="format" value={format} />
      <div className="row">
        <label className="field">
          Marca
          <select className="input" name="brand_id" value={brandId} onChange={(e) => { setBrandId(e.target.value); setCampaignId(""); }} data-testid="own-brand">
            {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </label>
        <label className="field">
          Objetivo
          <select className="input" name="goal" defaultValue={start?.goal ?? "Vender"} data-testid="own-goal">
            {GOALS.map((g) => <option key={g}>{g}</option>)}
          </select>
        </label>
        <label className="field">
          Campaña (opcional)
          <select className="input" name="campaign_id" value={campaignId} onChange={(e) => setCampaignId(e.target.value)} data-testid="own-campaign">
            <option value="">Sin campaña</option>
            {brandCampaigns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
      </div>
      <div className="field">
        Canal
        <div className="chips">
          {CHANNELS.map((c) => (
            <button type="button" key={c} className={`chip pick${channel === c ? " on" : ""}`} onClick={() => pickChannel(c)} data-testid={`own-channel-${c}`}>{c}</button>
          ))}
        </div>
      </div>
      <div className="field">
        Formato
        <div className="chips">
          {formatsFor(channel).map((f) => (
            <button type="button" key={f} className={`chip pick${format === f ? " on" : ""}`} onClick={() => pickFormat(f)} data-testid={`own-format-${f}`}>{formatLabel(f, channel)}</button>
          ))}
        </div>
      </div>
      <div className="row">
        <label className="field">
          Título
          <input className="input" name="title" placeholder="Carrusel de lanzamiento" required maxLength={120} data-testid="own-title" />
          <span className="hint">Para encontrarla en la lista y en el calendario.</span>
        </label>
        <label className="field" style={{ flex: "0 1 200px" }}>
          Fecha (opcional)
          <input className="input" type="date" name="publish_on" data-testid="own-date" />
        </label>
      </div>
      <label className="field">
        Texto
        <textarea className="input textarea" name="body" value={body} onChange={(e) => setBody(e.target.value)} rows={8} placeholder="Pegá el texto tal cual va a salir." required maxLength={4000} data-testid="own-body" />
        {format === "Anuncio" && <span className="hint">Completá cada campo: el brief de la campaña lee estos textos para Meta Ads.</span>}
      </label>
      <label className="field">
        Hashtags (opcional)
        <input className="input" name="hashtags" placeholder="#tumarca #rubro" data-testid="own-hashtags" />
      </label>
      <div className="row" style={{ alignItems: "center" }}>
        <button className="btn btn-primary" type="submit" disabled={pending || !brandId} data-testid="own-save">{pending ? "Guardando…" : "Guardar como borrador"}</button>
        <span className="muted">No usa acciones con IA. Las fotos o el video se suman desde la pieza.</span>
      </div>
      {state.error && <div className="error" role="alert">{state.error}</div>}
    </form>
  );
}
