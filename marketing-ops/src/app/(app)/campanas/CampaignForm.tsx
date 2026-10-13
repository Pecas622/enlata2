"use client";

import { useActionState } from "react";
import { GOALS } from "@/lib/channels";
import type { CampaignRow } from "@/lib/data";
import { saveCampaign, type CampaignState } from "./actions";

export function CampaignForm({ campaign, brands, initialBrand, canEdit, today }: {
  campaign?: CampaignRow; brands: { id: string; name: string }[]; initialBrand?: string; canEdit: boolean; today: string;
}) {
  const [state, action, pending] = useActionState<CampaignState, FormData>(saveCampaign, {});
  const c = campaign;
  return (
    <form action={action} className="stack" data-testid="campaign-form">
      {c && <input type="hidden" name="id" value={c.id} />}
      <fieldset disabled={!canEdit} style={{ border: 0, padding: 0, margin: 0 }} className="stack">
        <div className="card stack">
          <h2 className="card-title">La campaña</h2>
          <div className="row">
            <label className="field">
              Marca
              {c ? (
                <input className="input" value={c.brands?.name ?? ""} disabled />
              ) : (
                <select className="input" name="brand_id" defaultValue={initialBrand ?? brands[0]?.id} data-testid="camp-brand">
                  {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              )}
            </label>
            <label className="field">
              Nombre
              <input className="input" name="name" defaultValue={c?.name} placeholder="Día de la Madre, Liquidación de invierno…" required data-testid="camp-name" />
            </label>
          </div>
          <div className="row">
            <label className="field">
              Objetivo
              <select className="input" name="goal" defaultValue={c?.goal ?? "Vender"} data-testid="camp-goal">
                {GOALS.map((g) => <option key={g}>{g}</option>)}
              </select>
            </label>
            <label className="field">
              Desde
              <input className="input" type="date" name="starts_on" defaultValue={c?.starts_on ?? today} required data-testid="camp-starts" />
            </label>
            <label className="field">
              Hasta
              <input className="input" type="date" name="ends_on" defaultValue={c?.ends_on} required data-testid="camp-ends" />
            </label>
            <label className="field">
              Presupuesto de pauta (pesos)
              <input className="input" name="budget" inputMode="numeric" defaultValue={c && c.budget ? String(c.budget) : ""} placeholder="60000" data-testid="camp-budget" />
            </label>
          </div>
          <label className="field">
            Oferta o dato concreto
            <input className="input" name="offer" defaultValue={c?.offer} placeholder="Torta de frutillas encargando antes del jueves" data-testid="camp-offer" />
            <span className="hint">Los anuncios usan esto tal cual: nunca se inventan precios ni descuentos.</span>
          </label>
        </div>
        <div className="card stack">
          <h2 className="card-title">A quién le habla</h2>
          <label className="field">
            Público
            <textarea className="input textarea" name="audience" defaultValue={c?.audience} placeholder="Hijos e hijas que buscan un regalo rico para mamá" data-testid="camp-audience" />
            <span className="hint">Si lo dejás vacío, se usa el público de la marca.</span>
          </label>
          <div className="row">
            <label className="field">
              Dónde
              <input className="input" name="locations" defaultValue={c?.locations} placeholder="Godoy Cruz y Luján de Cuyo" data-testid="camp-locations" />
            </label>
            <label className="field" style={{ flex: "0 1 110px" }}>
              Edad desde
              <input className="input" type="number" min={13} max={65} name="age_min" defaultValue={c?.age_min ?? 18} data-testid="camp-age-min" />
            </label>
            <label className="field" style={{ flex: "0 1 110px" }}>
              Hasta
              <input className="input" type="number" min={13} max={65} name="age_max" defaultValue={c?.age_max ?? 65} data-testid="camp-age-max" />
            </label>
          </div>
          <label className="field">
            Intereses
            <input className="input" name="interests" defaultValue={c?.interests} placeholder="Repostería, regalos, Día de la Madre" data-testid="camp-interests" />
            <span className="hint">Separados por coma. Si no cargás ninguno, el brief sugiere algunos a partir de la marca.</span>
          </label>
          <label className="field">
            Notas
            <textarea className="input textarea" name="notes" defaultValue={c?.notes} placeholder="Qué no puede faltar, qué se probó antes…" />
          </label>
        </div>
      </fieldset>
      {canEdit && (
        <div className="row" style={{ alignItems: "center" }}>
          <button className="btn btn-primary" type="submit" disabled={pending} data-testid="camp-save">{pending ? "Guardando…" : c ? "Guardar cambios" : "Crear campaña"}</button>
          {state.error && <span className="error" role="alert">{state.error}</span>}
          {state.ok && <span className="ok" data-testid="camp-saved">{state.ok}</span>}
        </div>
      )}
    </form>
  );
}
