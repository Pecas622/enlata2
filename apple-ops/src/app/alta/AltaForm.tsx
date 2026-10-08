"use client";

import { useActionState, useState } from "react";
import { slugify } from "@/lib/billing";
import { darDeAlta, type AltaState } from "./actions";

export function AltaForm({ price }: { price: string }) {
  const [state, action, pending] = useActionState<AltaState, FormData>(darDeAlta, {});
  const [store, setStore] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  return (
    <form action={action} className="auth-card">
      <label className="field">
        Nombre del local
        <input className="input" name="store" required value={store} data-testid="alta-store"
          onChange={(e) => { setStore(e.target.value); if (!slugTouched) setSlug(slugify(e.target.value)); }} />
      </label>
      <label className="field">
        Link de tu catálogo
        <input className="input" name="slug" required value={slug} data-testid="alta-slug"
          onChange={(e) => { setSlugTouched(true); setSlug(e.target.value.toLowerCase()); }} />
        <span className="muted">/catalogo/{slug || "tu-local"}</span>
      </label>
      <label className="field">
        Tu nombre
        <input className="input" name="name" required autoComplete="name" data-testid="alta-name" />
      </label>
      <label className="field">
        Email
        <input className="input" name="email" type="email" required autoComplete="email" data-testid="alta-email" />
      </label>
      <label className="field">
        Contraseña
        <input className="input" name="password" type="password" required minLength={8} autoComplete="new-password" data-testid="alta-password" />
      </label>
      <label className="field">
        PIN de 4 números (para cambiar de usuario en el local)
        <input className="input" name="pin" inputMode="numeric" pattern="\d{4}" maxLength={4} required data-testid="alta-pin" />
      </label>
      {state.error && <div className="error" role="alert" data-testid="form-error">{state.error}</div>}
      <button className="btn btn-primary" type="submit" disabled={pending} data-testid="alta-submit">
        {pending ? "Creando tu cuenta…" : `Crear cuenta y pagar ${price}/mes`}
      </button>
      <p className="muted" style={{ margin: 0, textAlign: "center" }}>Pagás con Mercado Pago. Podés cancelar cuando quieras.</p>
    </form>
  );
}
