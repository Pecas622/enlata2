"use client";

// Formulario de evaluación de equipo, compartido por ingreso, canje y cotizador (como en el prototipo).
import { CAPACITIES, COLORS, CONDITIONS, DEFECTS, GRADE_NOTES, KINDS, MODELS, hasBattery, idLooksOk, usesIMEI, type Condition, type Kind } from "@/lib/catalog";
import { fmtUSD } from "@/lib/money";
import { Notice } from "./ui";

export type DeviceDraft = {
  kind: Kind;
  model: string;
  capacity: number;
  color: string;
  cond: Condition;
  battery: number;
  imei: string;
  defects: string[];
  icloudFree: boolean;
  imeiClean: boolean;
  note: string;
};

export function newDraft(cond: Condition = "Usado A"): DeviceDraft {
  return { kind: "iPhone", model: "", capacity: 128, color: "Negro", cond, battery: 90, imei: "", defects: [], icloudFree: true, imeiClean: true, note: "" };
}

export function DeviceEvalForm({ draft, onChange, allowSealed = false, duplicate }: {
  draft: DeviceDraft;
  onChange: (d: DeviceDraft) => void;
  allowSealed?: boolean;
  duplicate?: string | null;
}) {
  const up = (patch: Partial<DeviceDraft>) => onChange({ ...draft, ...patch });
  const toggleDefect = (def: string) => up({ defects: draft.defects.includes(def) ? draft.defects.filter((x) => x !== def) : [...draft.defects, def] });
  const conditions = allowSealed ? CONDITIONS : CONDITIONS.slice(1);
  return (
    <div className="stack">
      <div className="row">
        <label className="field">
          Tipo
          <select className="input" value={draft.kind} data-testid="ev-kind"
            onChange={(e) => { const kind = e.target.value as Kind; up({ kind, model: "", capacity: CAPACITIES[kind][0] }); }}>
            {KINDS.map((k) => <option key={k}>{k}</option>)}
          </select>
        </label>
        <label className="field">
          Modelo
          <select className="input" value={draft.model} onChange={(e) => up({ model: e.target.value })} data-testid="ev-model">
            <option value="">Elegí un modelo</option>
            {MODELS[draft.kind].map((m) => <option key={m}>{m}</option>)}
          </select>
        </label>
        {CAPACITIES[draft.kind][0] !== 0 && (
          <label className="field">
            Capacidad
            <select className="input" value={draft.capacity} onChange={(e) => up({ capacity: Number(e.target.value) })} data-testid="ev-cap">
              {CAPACITIES[draft.kind].map((c) => <option key={c} value={c}>{c} GB</option>)}
            </select>
          </label>
        )}
      </div>
      <div className="row">
        <label className="field">
          Color
          <select className="input" value={draft.color} onChange={(e) => up({ color: e.target.value })}>
            {COLORS.map((c) => <option key={c}>{c}</option>)}
          </select>
        </label>
        <label className="field">
          Condición
          <select className="input" value={draft.cond} onChange={(e) => up({ cond: e.target.value as Condition })} data-testid="ev-cond">
            {conditions.map((c) => <option key={c}>{c}</option>)}
          </select>
          {GRADE_NOTES[draft.cond] && <span>{GRADE_NOTES[draft.cond]}</span>}
        </label>
        {hasBattery(draft.kind) && draft.cond !== "Nuevo sellado" && (
          <label className="field">
            Batería (%)
            <input className="input" type="number" min={40} max={100} value={draft.battery} onChange={(e) => up({ battery: Number(e.target.value) })} data-testid="ev-battery" />
          </label>
        )}
      </div>
      <label className="field">
        {usesIMEI(draft.kind) ? "IMEI (15 dígitos)" : "N.º de serie"}
        <input className="input" value={draft.imei} placeholder="Ej: 353912080123456" onChange={(e) => up({ imei: e.target.value.replace(/\s/g, "") })} data-testid="ev-imei" />
        {draft.imei && !idLooksOk(draft.kind, draft.imei) && <span style={{ color: "var(--amber)" }}>Revisá el número: formato inválido</span>}
      </label>
      {duplicate && <Notice tone="red">Este IMEI ya figura en stock ({duplicate}). Revisá antes de continuar.</Notice>}
      <div>
        <div className="muted" style={{ fontSize: 12, marginBottom: 8 }}>Defectos detectados</div>
        <div className="row" style={{ gap: 8 }}>
          {DEFECTS.map((def) => (
            <button type="button" key={def} className={`chip${draft.defects.includes(def) ? " on" : ""}`} onClick={() => toggleDefect(def)}>{def}</button>
          ))}
        </div>
      </div>
      <div className="row" style={{ gap: 18 }}>
        <label className="check"><input type="checkbox" checked={draft.icloudFree} onChange={(e) => up({ icloudFree: e.target.checked })} data-testid="ev-icloud" />iCloud / Buscar mi iPhone desactivado</label>
        <label className="check"><input type="checkbox" checked={draft.imeiClean} onChange={(e) => up({ imeiClean: e.target.checked })} />IMEI sin denuncia ni bloqueo</label>
      </div>
      <label className="field">
        Observaciones
        <input className="input" value={draft.note} onChange={(e) => up({ note: e.target.value })} placeholder="Opcional: incluye caja, cargador, factura de compra..." />
      </label>
    </div>
  );
}

export function AppraisalBox({ ap }: { ap: { ok: boolean; blocked?: boolean; reason?: string; value: number; lines: { label: string; amount: number }[] } | null }) {
  if (!ap) return null;
  if (!ap.ok) return <Notice tone={ap.blocked ? "red" : "amber"}>{ap.reason}</Notice>;
  return (
    <div className="lines" data-testid="appraisal">
      {ap.lines.map((l, i) => (
        <div key={i} className={l.amount < 0 ? "neg" : undefined}><span>{l.label}</span><span>{l.amount < 0 ? "−" : ""}{fmtUSD(Math.abs(l.amount))}</span></div>
      ))}
      <div className="total"><span>Valor sugerido de toma</span><b>{fmtUSD(ap.value)}</b></div>
    </div>
  );
}
