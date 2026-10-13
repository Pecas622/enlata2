"use client";

import { useActionState } from "react";
import { login, type LoginState } from "./actions";

export function LoginForm({ initialError }: { initialError?: string }) {
  const [state, action, pending] = useActionState<LoginState, FormData>(login, { error: initialError });
  return (
    <form action={action} className="auth-card">
      <label className="field">
        Email
        <input className="input" name="email" type="email" autoComplete="username" required data-testid="login-email" />
      </label>
      <label className="field">
        Contraseña
        <input className="input" name="password" type="password" autoComplete="current-password" required data-testid="login-password" />
      </label>
      {state.error && <div className="error" role="alert" data-testid="form-error">{state.error}</div>}
      <button className="btn btn-primary" type="submit" disabled={pending} data-testid="login-submit">
        {pending ? "Entrando…" : "Entrar"}
      </button>
    </form>
  );
}
