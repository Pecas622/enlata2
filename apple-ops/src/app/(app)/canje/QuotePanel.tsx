"use client";

// Cotizador de mostrador: tasa el equipo del cliente contra uno del stock y arma el mensaje de WhatsApp.
import { useState } from "react";
import { AppraisalBox, DeviceEvalForm, newDraft, type DeviceDraft } from "@/components/DeviceEvalForm";
import { Notice } from "@/components/ui";
import { deviceShort, deviceTitle } from "@/lib/catalog";
import { fmtARS, fmtUSD } from "@/lib/money";
import { tradeInState } from "@/lib/sale";
import type { StoreConfig } from "@/lib/store";
import { waLink } from "@/lib/whatsapp";
import type { PosDevice } from "../ventas/pos-data";

export function QuotePanel({ cfg, devices, overTradeIn, requireImei = true }: { cfg: StoreConfig; devices: PosDevice[]; overTradeIn: boolean; requireImei?: boolean }) {
  const [draft, setDraft] = useState<DeviceDraft>(newDraft("Usado B"));
  const [targetId, setTargetId] = useState("");
  const [phone, setPhone] = useState("");
  const st = tradeInState(draft, cfg, "", overTradeIn, false, requireImei);
  const target = devices.find((d) => d.id === targetId);
  const value = st.valid ? st.value : 0;
  const diff = target ? target.price_usd - value : 0;
  const msg = target && st.valid
    ? `Hola! Cotización plan canje en ${cfg.name}: tu ${deviceShort(draft)} (${draft.cond}) lo tomamos a ${fmtUSD(value)}. El ${deviceTitle(target)} sale ${fmtUSD(target.price_usd)}. Diferencia a pagar: ${fmtUSD(diff)} (aprox. ${fmtARS(diff * cfg.fx)}). Cotización válida por 48 hs, sujeta a revisión del equipo en el local.`
    : "";

  return (
    <div className="grid-2">
      <div className="card">
        <h2 className="card-title">1. Equipo del cliente</h2>
        <DeviceEvalForm draft={draft} onChange={setDraft} kinds={["iPhone", "iPad", "Mac"]} imeiOptional={!requireImei} />
      </div>
      <div className="card stack">
        <h2 className="card-title" style={{ margin: 0 }}>2. Cotización</h2>
        <AppraisalBox ap={draft.model ? st.ap : null} />
        <label className="field">
          Equipo que quiere llevarse
          <select className="input" value={targetId} onChange={(e) => setTargetId(e.target.value)} data-testid="quote-target">
            <option value="">Elegí un equipo del stock</option>
            {devices.map((d) => <option key={d.id} value={d.id}>{deviceTitle(d)} · {d.condition} · {fmtUSD(d.price_usd)}</option>)}
          </select>
        </label>
        {target && (
          <div className="lines">
            <div><span>Precio del equipo</span><span>{fmtUSD(target.price_usd)}</span></div>
            <div className="ok"><span>Valor de tu equipo</span><span>−{fmtUSD(value)}</span></div>
            <div className="total" style={{ fontSize: 16 }}><span>Diferencia a pagar</span><b data-testid="quote-diff">{fmtUSD(diff)}</b></div>
            <div className="muted" style={{ justifyContent: "flex-end", fontSize: 11.5 }}>≈ {fmtARS(diff * cfg.fx)}</div>
          </div>
        )}
        {!st.valid && draft.model && (draft.imei || !requireImei) && <Notice>{st.errors[0]}</Notice>}
        {requireImei && !draft.imei && draft.model && <p className="muted" style={{ margin: 0 }}>Cargá el IMEI para validar el equipo.</p>}
        {msg && (
          <>
            <label className="field">WhatsApp del cliente (opcional)<input className="input" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+54 9 261 ..." /></label>
            <a className="btn btn-secondary" href={waLink(phone, msg)} target="_blank" rel="noreferrer" data-testid="quote-wa">Enviar cotización por WhatsApp</a>
          </>
        )}
      </div>
    </div>
  );
}
