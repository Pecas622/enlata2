"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Notice } from "@/components/ui";
import { signup, type SignupState } from "./actions";

export function SignupForm({ token, email, name }: { token?: string; email?: string; name?: string }) {
  const [state, action, pending] = useActionState<SignupState, FormData>(signup, {});
  if (state.sent) {
    return (
      <div className="stack">
        <Notice tone="blue">{state.sent}</Notice>
        <Link className="btn btn-secondary" href="/login">Ir al login</Link>
      </div>
    );
  }
  return (
    <form action={action} className="auth-card">
      {token ? (
        <>
          <input type="hidden" name="token" value={token} />
          <label className="field">
            Email
            <input className="input" value={email} disabled data-testid="signup-email" />
          </label>
        </>
      ) : (
        <>
          <label className="field">
            Tu negocio o agencia
            <input className="input" name="business" required maxLength={80} placeholder="Ej.: Panadería La Espiga" data-testid="signup-business" />
          </label>
          <label className="field">
            Email
            <input className="input" name="email" type="email" autoComplete="username" required data-testid="signup-email" />
          </label>
        </>
      )}
      <label className="field">
        Tu nombre
        <input className="input" name="name" defaultValue={name} required data-testid="signup-name" />
      </label>
      <label className="field">
        Contraseña
        <input className="input" name="password" type="password" autoComplete="new-password" minLength={8} required data-testid="signup-password" />
        <span className="hint">Al menos 8 caracteres.</span>
      </label>
      {state.error && <div className="error" role="alert" data-testid="form-error">{state.error}</div>}
      <button className="btn btn-primary" type="submit" disabled={pending} data-testid="signup-submit">
        {pending ? "Creando…" : token ? "Crear mi usuario y entrar" : "Crear mi cuenta"}
      </button>
    </form>
  );
}
