"use client";

import { useActionState } from "react";
import { ACC_CATEGORIES } from "@/lib/catalog";
import { saveAccessory, type FormState } from "./actions";

export type AccValues = { id?: string; sku: string; name: string; category: string; price_ars: number | ""; cost_ars: number | ""; min_stock: number; supplier: string };

export function AccForm({ acc, seeCost }: { acc?: AccValues; seeCost: boolean }) {
  const [state, action, pending] = useActionState<FormState, FormData>(saveAccessory, {});
  const isNew = !acc?.id;
  return (
    <form action={action} className="stack">
      {acc?.id && <input type="hidden" name="id" value={acc.id} />}
      <div className="row">
        <label className="field" style={{ flex: "3 1 220px" }}>Nombre<input className="input" name="name" defaultValue={acc?.name} required data-testid="acc-name" /></label>
        <label className="field">SKU<input className="input" name="sku" defaultValue={acc?.sku} placeholder="Automático" data-testid="acc-sku" /></label>
      </div>
      <div className="row">
        <label className="field">
          Categoría
          <select className="input" name="category" defaultValue={acc?.category ?? "Fundas"} data-testid="acc-category">
            {ACC_CATEGORIES.map((c) => <option key={c}>{c}</option>)}
          </select>
        </label>
        <label className="field">Proveedor<input className="input" name="supplier" defaultValue={acc?.supplier} /></label>
      </div>
      <div className="row">
        {seeCost && <label className="field">Costo (ARS)<input className="input" name="cost" type="number" min={0} defaultValue={acc?.cost_ars} data-testid="acc-cost" /></label>}
        <label className="field">Precio (ARS)<input className="input" name="price" type="number" min={1} defaultValue={acc?.price_ars} required data-testid="acc-price" /></label>
        {isNew && <label className="field">Stock inicial<input className="input" name="stock" type="number" min={0} defaultValue={0} data-testid="acc-stock" /></label>}
        <label className="field">Stock mínimo<input className="input" name="min_stock" type="number" min={0} defaultValue={acc?.min_stock ?? 3} data-testid="acc-min" /></label>
      </div>
      {state.error && <div className="error" role="alert" data-testid="form-error">{state.error}</div>}
      {state.ok && !pending && <div className="ok" data-testid="acc-saved">Accesorio actualizado.</div>}
      <div><button className="btn btn-primary" disabled={pending} data-testid="acc-save">{pending ? "Guardando…" : "Guardar"}</button></div>
    </form>
  );
}
