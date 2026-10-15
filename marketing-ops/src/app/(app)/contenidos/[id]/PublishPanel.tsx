"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Badge } from "@/components/ui";
import { fmtDateTime } from "@/lib/dates";
import { PUB_TONE } from "@/lib/publish";
import { cancelPublication, publishNow, schedulePublication, type PublishState } from "./publish-actions";

export type Publication = { status: string; scheduled_at: string; last_error: string; permalink: string; published_at: string | null } | null;

type Props = {
  id: string;
  account: { username: string; status: string } | null;
  publication: Publication;
  blocker: string | null;   // por qué todavía no se puede publicar (archivos, formato, estado)
  canPublish: boolean;      // rol
  defaultDay: string;
  defaultTime: string;
  minDay: string;
};

export function PublishPanel({ id, account, publication: pub, blocker, canPublish, defaultDay, defaultTime, minDay }: Props) {
  const [nowState, nowAction, nowPending] = useActionState<PublishState, FormData>(publishNow, {});
  const [schState, schAction, schPending] = useActionState<PublishState, FormData>(schedulePublication, {});
  const [canState, canAction, canPending] = useActionState<PublishState, FormData>(cancelPublication, {});
  const pending = nowPending || schPending || canPending;
  const msg = [nowState, schState, canState].find((s) => s.error || s.ok);

  const connected = account?.status === "Conectada";
  const open = !pub || pub.status === "Programada" || pub.status === "Error";
  const ready = canPublish && connected && !blocker && open;

  return (
    <div className="card stack" data-testid="publish-panel">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <h2 className="card-title" style={{ margin: 0 }}>Publicar en Instagram</h2>
        {pub && <Badge tone={PUB_TONE[pub.status] ?? "neutral"}><span data-testid="publish-status">{pub.status}</span></Badge>}
      </div>

      {pub?.status === "Publicada" && (
        <p style={{ margin: 0 }}>
          Salió el {fmtDateTime(pub.published_at)}.{" "}
          {pub.permalink && <a href={pub.permalink} target="_blank" rel="noreferrer" data-testid="publish-link">Verla en Instagram</a>}
        </p>
      )}
      {pub?.status === "Programada" && <p style={{ margin: 0 }} data-testid="publish-when">Sale el {fmtDateTime(pub.scheduled_at)}{account ? ` en @${account.username}` : ""}.</p>}
      {pub?.status === "Publicando" && <p style={{ margin: 0 }}>Instagram la está procesando. Cuando termine, queda publicada sola.</p>}
      {pub?.status === "Error" && <div className="error" role="alert" data-testid="publish-error">No salió: {pub.last_error}</div>}

      {pub?.status !== "Publicada" && pub?.status !== "Publicando" && (
        <>
          {!account ? (
            <p className="muted" style={{ margin: 0 }}>Conectá el Instagram de la marca en <Link href="/redes">Redes</Link> para publicar desde acá.</p>
          ) : !connected ? (
            <p className="muted" style={{ margin: 0 }}>La conexión con @{account.username} está {account.status.toLowerCase()}: reconectala en <Link href="/redes">Redes</Link>.</p>
          ) : blocker ? (
            <p className="muted" style={{ margin: 0 }} data-testid="publish-blocker">{blocker}</p>
          ) : !canPublish ? (
            <p className="muted" style={{ margin: 0 }}>Publica el Administrador o el Creador.</p>
          ) : pub?.status === "Programada" ? null : (
            <p className="muted" style={{ margin: 0 }}>Sale en @{account.username} con el texto, los hashtags y los archivos de la pieza.</p>
          )}
          {ready && (
            <div className="stack">
              <form action={nowAction}>
                <input type="hidden" name="id" value={id} />
                <button className="btn btn-primary" type="submit" disabled={pending} data-testid="publish-now">{nowPending ? "Publicando…" : "Publicar ahora"}</button>
              </form>
              <form action={schAction} className="row" style={{ alignItems: "flex-end" }}>
                <input type="hidden" name="id" value={id} />
                <label className="field">Día<input className="input" type="date" name="day" min={minDay} defaultValue={defaultDay} required data-testid="publish-day" /></label>
                <label className="field">Hora<input className="input" type="time" name="time" defaultValue={defaultTime} required data-testid="publish-time" /></label>
                <button className="btn" type="submit" disabled={pending} data-testid="publish-schedule">{pub?.status === "Programada" ? "Cambiar horario" : "Programar"}</button>
              </form>
            </div>
          )}
          {canPublish && pub && (pub.status === "Programada" || pub.status === "Error") && (
            <form action={canAction}>
              <input type="hidden" name="id" value={id} />
              <button className="btn btn-ghost" type="submit" disabled={pending} data-testid="publish-cancel">{pub.status === "Error" ? "Descartar" : "Cancelar la programación"}</button>
            </form>
          )}
        </>
      )}
      {msg?.error && <div className="error" role="alert">{msg.error}</div>}
      {msg?.ok && !msg.error && <div className="muted" data-testid="publish-msg">{msg.ok}</div>}
    </div>
  );
}
