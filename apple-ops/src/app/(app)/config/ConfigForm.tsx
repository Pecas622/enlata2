"use client";

import { useState, useTransition } from "react";
import { DEFECTS } from "@/lib/catalog";
import { guardarConfig, type ConfigInput } from "./actions";

type Draft = Omit<ConfigInput, "fx" | "target_margin" | "max_discount_seller" | "warranty_new_days" | "warranty_used_days" | "base_values"> & {
  fx: string; target_margin: string; max_discount_seller: string; warranty_new_days: string; warranty_used_days: string;
  base_values: { model: string; capacity: string; value: string; fresh?: boolean }[];
};

const toDraft = (c: ConfigInput): Draft => ({
  ...c, fx: String(c.fx), target_margin: String(c.target_margin), max_discount_seller: String(c.max_discount_seller),
  warranty_new_days: String(c.warranty_new_days), warranty_used_days: String(c.warranty_used_days),
  base_values: c.base_values.map((b) => ({ model: b.model, capacity: String(b.capacity), value: String(b.value) })),
});

export function ConfigForm({ initial, fxAuto }: { initial: ConfigInput; fxAuto?: string }) {
  const [c, setC] = useState<Draft>(() => toDraft(initial));
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();
  const up = (patch: Partial<Draft>) => { setC({ ...c, ...patch }); setSaved(false); };
  const setBase = (i: number, patch: Partial<Draft["base_values"][number]>) => up({ base_values: c.base_values.map((r, k) => (k === i ? { ...r, ...patch } : r)) });

  const save = () => {
    setError(null);
    const payload: ConfigInput = {
      ...c, fx: Number(c.fx), target_margin: Number(c.target_margin), max_discount_seller: Number(c.max_discount_seller),
      warranty_new_days: Number(c.warranty_new_days), warranty_used_days: Number(c.warranty_used_days),
      base_values: c.base_values.filter((b) => b.model.trim() && b.value !== "").map((b) => ({ model: b.model.trim(), capacity: Number(b.capacity) || 0, value: Number(b.value) || 0 })),
    };
    startTransition(async () => {
      const res = await guardarConfig(payload);
      if (res.error) setError(res.error);
      else setSaved(true);
    });
  };

  const text = (label: string, k: "name" | "cuit" | "phone" | "address", testid?: string) => (
    <label className="field">{label}<input className="input" value={c[k]} onChange={(e) => up({ [k]: e.target.value })} data-testid={testid} /></label>
  );
  const num = (label: string, k: "fx" | "target_margin" | "max_discount_seller" | "warranty_new_days" | "warranty_used_days", testid?: string, step = "1", hint?: string, disabled = false) => (
    <label className="field">{label}<input className="input" type="number" step={step} value={c[k]} onChange={(e) => up({ [k]: e.target.value })} data-testid={testid} disabled={disabled} />{hint && <span>{hint}</span>}</label>
  );

  return (
    <div className="stack">
      <div className="grid-2">
        <div className="card stack">
          <h2 className="card-title" style={{ margin: 0 }}>Local y comprobantes</h2>
          {text("Nombre del local", "name", "cfg-name")}
          <div className="row">{text("CUIT", "cuit")}{text("Teléfono", "phone")}</div>
          {text("Dirección", "address")}
        </div>
        <div className="card stack">
          <h2 className="card-title" style={{ margin: 0 }}>Reglas comerciales</h2>
          <div className="row">
            {num("Cotización dólar (ARS)", "fx", "cfg-fx", "1", fxAuto ? `Automática (${fxAuto}).` : undefined, !!fxAuto)}
            {num("Margen objetivo de reventa", "target_margin", "cfg-margin", "0.01", "0.12 es 12%.")}
            {num("Descuento máx. vendedor (%)", "max_discount_seller", "cfg-discount")}
          </div>
          <div className="row">
            {num("Garantía nuevos (días)", "warranty_new_days")}
            {num("Garantía usados (días)", "warranty_used_days")}
          </div>
        </div>
      </div>
      <div className="card">
        <h2 className="card-title" style={{ marginBottom: 4 }}>Tabla de tasación (valores de referencia en USD)</h2>
        <p className="muted" style={{ marginTop: 0 }}>Es la base del plan canje y de la compra de usados. Actualizala cuando cambie el mercado.</p>
        <div className="base-grid" data-testid="base-values">
          {c.base_values.map((r, i) =>
            !r.fresh ? (
              <div key={i} className="base-row">
                <div style={{ flex: 1 }}>{r.model} <span className="muted">{Number(r.capacity) ? `${r.capacity}GB` : ""}</span></div>
                <input className="input" type="number" min={0} value={r.value} onChange={(e) => setBase(i, { value: e.target.value })} aria-label={`${r.model} ${r.capacity}GB`} data-testid={`base-${r.model}-${r.capacity}`} />
                <button type="button" className="remove" title="Quitar" onClick={() => up({ base_values: c.base_values.filter((_, k) => k !== i) })}>×</button>
              </div>
            ) : (
              <div key={i} className="base-row">
                <input className="input" style={{ flex: 1, width: "auto" }} placeholder="Modelo" value={r.model} onChange={(e) => setBase(i, { model: e.target.value })} data-testid="base-new-model" />
                <input className="input" type="number" placeholder="GB" value={r.capacity} onChange={(e) => setBase(i, { capacity: e.target.value })} style={{ width: 70 }} data-testid="base-new-capacity" />
                <input className="input" type="number" placeholder="USD" value={r.value} onChange={(e) => setBase(i, { value: e.target.value })} data-testid="base-new-value" />
                <button type="button" className="remove" title="Quitar" onClick={() => up({ base_values: c.base_values.filter((_, k) => k !== i) })}>×</button>
              </div>
            ),
          )}
        </div>
        <button type="button" className="link" style={{ marginTop: 8 }} onClick={() => up({ base_values: [...c.base_values, { model: "", capacity: "", value: "", fresh: true }] })} data-testid="base-add">+ Agregar modelo</button>
        <div className="row" style={{ marginTop: 16, gap: 24 }}>
          <div style={{ flex: 1, minWidth: 260 }}>
            <div className="muted" style={{ fontSize: 12, marginBottom: 8 }}>Descuento por defecto (USD)</div>
            {DEFECTS.map((d) => (
              <div key={d} className="row" style={{ justifyContent: "space-between", alignItems: "center", marginBottom: 6, fontSize: 13 }}>
                <span>{d}</span>
                <input className="input" type="number" min={0} style={{ width: 90 }} value={c.defect_costs[d] ?? 0} onChange={(e) => up({ defect_costs: { ...c.defect_costs, [d]: Number(e.target.value) || 0 } })} />
              </div>
            ))}
          </div>
          <div style={{ flex: 1, minWidth: 220 }}>
            <div className="muted" style={{ fontSize: 12, marginBottom: 8 }}>Multiplicador por condición</div>
            {Object.keys(c.cond_mult).map((k) => (
              <div key={k} className="row" style={{ justifyContent: "space-between", alignItems: "center", marginBottom: 6, fontSize: 13 }}>
                <span>{k}</span>
                <input className="input" type="number" step="0.01" min={0} style={{ width: 90 }} value={c.cond_mult[k]} onChange={(e) => up({ cond_mult: { ...c.cond_mult, [k]: Number(e.target.value) || 0 } })} />
              </div>
            ))}
          </div>
        </div>
      </div>
      {error && <div className="error" role="alert" data-testid="form-error">{error}</div>}
      {saved && !pending && <div className="ok" data-testid="cfg-saved">Configuración guardada.</div>}
      <div><button className="btn btn-primary" onClick={save} disabled={pending} data-testid="cfg-save">{pending ? "Guardando…" : "Guardar cambios"}</button></div>
    </div>
  );
}
