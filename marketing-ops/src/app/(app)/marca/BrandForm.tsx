"use client";

import { useActionState } from "react";
import { TONES } from "@/lib/channels";
import type { BrandRow } from "@/lib/data";
import { saveBrand, type BrandState } from "./actions";

type Field = { name: keyof BrandRow; label: string; hint?: string; long?: boolean; placeholder?: string };

const SECTIONS: { title: string; fields: Field[] }[] = [
  {
    title: "El negocio",
    fields: [
      { name: "name", label: "Nombre de la marca" },
      { name: "industry", label: "Rubro", placeholder: "Panadería, estudio contable, tienda de ropa…" },
      { name: "city", label: "Ciudad o zona", placeholder: "Godoy Cruz, Mendoza" },
      { name: "description", label: "Qué hace", long: true, hint: "Contalo como se lo dirías a un cliente nuevo." },
      { name: "products", label: "Productos o servicios", long: true, hint: "Separados por coma. El generador los usa tal cual." },
    ],
  },
  {
    title: "A quién le habla y por qué la eligen",
    fields: [
      { name: "audience", label: "Público", long: true, placeholder: "Vecinos de la zona, familias, oficinas…" },
      { name: "value_prop", label: "Por qué te eligen", long: true, hint: "Lo que te diferencia, en una o dos frases. Es la base de casi todas las piezas." },
    ],
  },
  {
    title: "Cómo habla",
    fields: [
      { name: "cta", label: "Llamado a la acción", placeholder: "Pedí por WhatsApp y retirá sin hacer fila" },
      { name: "words_avoid", label: "Palabras que no usa", hint: "Separadas por coma. Si aparecen en una pieza, te avisamos." },
      { name: "hashtags", label: "Hashtags de la marca", placeholder: "laespiga, masamadre" },
    ],
  },
  {
    title: "Dónde está",
    fields: [
      { name: "instagram", label: "Instagram", placeholder: "@tumarca" },
      { name: "whatsapp", label: "WhatsApp", placeholder: "+54 9 261 555 0000" },
      { name: "website", label: "Web" },
    ],
  },
];

export function BrandForm({ brand, canEdit }: { brand?: BrandRow; canEdit: boolean }) {
  const [state, action, pending] = useActionState<BrandState, FormData>(saveBrand, {});
  return (
    <form action={action} className="stack" data-testid="brand-form">
      {brand && <input type="hidden" name="id" value={brand.id} />}
      <fieldset disabled={!canEdit} style={{ border: 0, padding: 0, margin: 0 }} className="stack">
        {SECTIONS.map((s, i) => (
          <div className="card stack" key={s.title}>
            <h2 className="card-title">{s.title}</h2>
            {s.fields.map((f) => (
              <label className="field" key={f.name}>
                {f.label}
                {f.long ? (
                  <textarea className="input textarea" name={f.name} defaultValue={String(brand?.[f.name] ?? "")} placeholder={f.placeholder} data-testid={`brand-${f.name}`} />
                ) : (
                  <input className="input" name={f.name} defaultValue={String(brand?.[f.name] ?? "")} placeholder={f.placeholder} required={f.name === "name"} data-testid={`brand-${f.name}`} />
                )}
                {f.hint && <span className="hint">{f.hint}</span>}
              </label>
            ))}
            {i === 2 && (
              <div className="field">
                Tono
                <div className="chips">
                  {TONES.map((t) => (
                    <label key={t} className="check" style={{ marginRight: 8 }}>
                      <input type="checkbox" name="tone" value={t} defaultChecked={brand?.tone.includes(t)} data-testid={`tone-${t}`} /> {t}
                    </label>
                  ))}
                </div>
                <span className="hint">Cercano o Divertido suman emojis. Profesional los saca.</span>
              </div>
            )}
            {i === 3 && (
              <label className="field" style={{ maxWidth: 160 }}>
                Color de la marca
                <input className="input" type="color" name="color" defaultValue={brand?.color ?? "#5E5CE6"} style={{ height: 40, padding: 4 }} />
              </label>
            )}
          </div>
        ))}
      </fieldset>
      {state.error && <div className="error" role="alert">{state.error}</div>}
      {state.ok && <div className="ok" role="status" data-testid="brand-saved">Guardado.</div>}
      {canEdit && (
        <div>
          <button className="btn btn-primary" type="submit" disabled={pending} data-testid="brand-save">
            {pending ? "Guardando…" : brand ? "Guardar cambios" : "Crear marca"}
          </button>
        </div>
      )}
    </form>
  );
}
