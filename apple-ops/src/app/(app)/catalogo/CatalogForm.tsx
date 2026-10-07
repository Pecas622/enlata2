"use client";

import { useActionState } from "react";
import { saveCatalog, type FormState } from "./actions";

export type CatalogSettings = { slug: string; headline: string; tagline: string; whatsapp: string; published: boolean; show_accessories: boolean };

export function CatalogForm({ s }: { s: CatalogSettings }) {
  const [state, action, pending] = useActionState<FormState, FormData>(saveCatalog, {});
  return (
    <form action={action} className="card stack">
      <h2 className="card-title" style={{ margin: 0 }}>Textos, contacto y opciones</h2>
      <label className="field">Título<input className="input" name="headline" defaultValue={s.headline} data-testid="cat-headline" /></label>
      <label className="field">Subtítulo<input className="input" name="tagline" defaultValue={s.tagline} /></label>
      <div className="row">
        <label className="field">
          WhatsApp de ventas
          <input className="input" name="whatsapp" defaultValue={s.whatsapp} placeholder="5492615550000" data-testid="cat-wa" />
          <span>Con código de país. Si lo dejás vacío se usa el teléfono del local.</span>
        </label>
        <label className="field">
          Link
          <input className="input" name="slug" defaultValue={s.slug} required data-testid="cat-slug" />
          <span>Queda /catalogo/{s.slug}. Letras, números y guiones.</span>
        </label>
      </div>
      <label className="row" style={{ alignItems: "center", gap: 8, fontSize: 13 }}>
        <input type="checkbox" name="published" defaultChecked={s.published} data-testid="cat-published" /> Catálogo publicado
      </label>
      <label className="row" style={{ alignItems: "center", gap: 8, fontSize: 13 }}>
        <input type="checkbox" name="show_accessories" defaultChecked={s.show_accessories} data-testid="cat-acc-toggle" /> Mostrar accesorios
      </label>
      <p className="muted" style={{ margin: 0, fontSize: 12 }}>El catálogo nunca muestra costos, IMEI ni datos de clientes. Los equipos vendidos, reservados o en reparación se ocultan solos.</p>
      {state.error && <div className="error" role="alert" data-testid="form-error">{state.error}</div>}
      {state.ok && !pending && <div className="ok" data-testid="cat-saved">Catálogo guardado.</div>}
      <div><button className="btn btn-primary" disabled={pending} data-testid="cat-save">{pending ? "Guardando…" : "Guardar"}</button></div>
    </form>
  );
}
