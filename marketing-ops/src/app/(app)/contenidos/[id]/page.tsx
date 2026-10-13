import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge, Notice } from "@/components/ui";
import { formatLabel } from "@/lib/channels";
import { CONTENT_COLS, listCampaigns, type ContentRow } from "@/lib/data";
import { fmtDate, fmtDateTime } from "@/lib/dates";
import { requireSection } from "@/lib/guard";
import { createClient } from "@/lib/supabase/server";
import { STATUSES, actionsFor, canEdit, statusTone } from "@/lib/workflow";
import { CampaignPicker } from "./CampaignPicker";
import { ContentEditor } from "./ContentEditor";
import { Preview } from "./Preview";
import { StatusActions } from "./StatusActions";

type Event = { id: string; action: string; note: string; at: string; profiles: { name: string } | null };

export default async function ContenidoPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ nueva?: string }> }) {
  const { id } = await params;
  const { nueva } = await searchParams;
  const { user } = await requireSection("contenidos");
  const supabase = await createClient();
  const [{ data }, { data: events }, campaigns] = await Promise.all([
    supabase.from("contents").select(CONTENT_COLS + ", brand:brands(words_avoid, instagram)").eq("id", id).maybeSingle(),
    supabase.from("content_events").select("id, action, note, at, profiles(name)").eq("content_id", id).order("at", { ascending: false }),
    listCampaigns(),
  ]);
  if (!data) notFound();
  const c = data as unknown as ContentRow & { brand: { words_avoid: string; instagram: string } | null };
  const editable = canEdit(c.status, user.role);
  const actions = actionsFor(c.status, user.role);
  const idx = STATUSES.indexOf(c.status);
  const lastNote = ((events ?? []) as unknown as Event[]).find((e) => e.action === "Pidió cambios" && e.note);

  return (
    <>
      <Link href="/contenidos" className="back">← Contenidos</Link>
      <div className="page-head" style={{ marginBottom: 6 }}>
        <div>
          <h1 className="page-title" data-testid="page-title">{c.title || c.topic || "Sin título"}</h1>
          <div className="status-bar">
            <span className="dot" style={{ background: c.brands?.color }} />
            <span className="muted">{c.brands?.name} · {c.channel} · {formatLabel(c.format, c.channel)} · {c.goal}</span>
            <Badge tone={statusTone(c.status)}>{c.status}</Badge>
            {c.source === "ia" && <Badge tone="blue">Con IA</Badge>}
          </div>
        </div>
      </div>
      <div className="steps" aria-label="Circuito">
        {STATUSES.map((s, i) => <span key={s} className={i === idx ? "on" : i < idx ? "done" : ""}>{s}</span>)}
      </div>
      {nueva && <div style={{ marginBottom: 12 }}><Notice tone="blue">Guardada como borrador. Editala si querés y mandala a revisión.</Notice></div>}
      {c.status === "Borrador" && lastNote && <div style={{ marginBottom: 12 }}><Notice>Cambios pedidos por {lastNote.profiles?.name}: “{lastNote.note}”</Notice></div>}

      <div className="grid-2">
        <div className="stack">
          {editable ? (
            <ContentEditor
              id={c.id}
              channel={c.channel}
              format={c.format}
              wordsAvoid={c.brand?.words_avoid ?? ""}
              approved={c.status === "Aprobado"}
              initial={{ title: c.title, body: c.body, hashtags: c.hashtags, cta: c.cta, publish_on: c.publish_on ?? "" }}
            />
          ) : (
            <div className="card stack">
              <h2 className="card-title">Texto</h2>
              <pre className="copy" data-testid="content-readonly">{c.body || "Sin texto todavía."}{c.hashtags && <><br /><br /><span className="tags-line">{c.hashtags}</span></>}</pre>
              <div className="facts" style={{ margin: 0 }}>
                <span>Publicar</span><b>{c.publish_on ? fmtDate(c.publish_on) : "Sin fecha"}</b>
              </div>
            </div>
          )}
        </div>
        <div className="stack">
          {c.status === "Idea" && editable && (
            <div className="card stack">
              <h2 className="card-title">Escribila</h2>
              <p className="muted" style={{ margin: 0 }}>Es una idea{c.publish_on ? ` para el ${fmtDate(c.publish_on)}` : ""}. El generador te da 3 versiones con los datos de la marca y la que elijas queda en esta pieza.</p>
              <div><Link className="btn btn-primary" href={`/generar?idea=${c.id}`} data-testid="idea-generate">Escribir con el generador</Link></div>
            </div>
          )}
          {actions.length > 0 && (
            <div className="card stack">
              <h2 className="card-title">Siguiente paso</h2>
              <StatusActions id={c.id} actions={actions} />
            </div>
          )}
          {(campaigns.some((x) => x.brand_id === c.brand_id) || c.campaign_id) && (
            <div className="card">
              <h2 className="card-title">Campaña</h2>
              <CampaignPicker
                contentId={c.id}
                current={c.campaign_id}
                options={campaigns.filter((x) => x.brand_id === c.brand_id).map((x) => ({ id: x.id, name: x.name }))}
                canEdit={user.role !== "Revisor"}
              />
            </div>
          )}
          <div className="card stack">
            <h2 className="card-title">Vista previa</h2>
            <Preview channel={c.channel} format={c.format} brand={c.brands?.name ?? ""} color={c.brands?.color ?? "#5E5CE6"} instagram={c.brand?.instagram ?? ""} title={c.title} body={c.body} hashtags={c.hashtags} />
          </div>
          <div className="card">
            <h2 className="card-title">Historial</h2>
            <div className="timeline" data-testid="history">
              {((events ?? []) as unknown as Event[]).map((e) => (
                <div key={e.id}>
                  <b>{e.action}{e.profiles ? ` · ${e.profiles.name}` : ""}</b>
                  {e.note && <q>{e.note}</q>}
                  <span>{fmtDateTime(e.at)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
