import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge, Notice } from "@/components/ui";
import { briefText, buildBrief, splitList, campaignStatus, fmtARS, progress, statusTone } from "@/lib/campaigns";
import { getBrand, getCampaign, listContents, listResults } from "@/lib/data";
import { fmtInt, fmtPct, rates, sum } from "@/lib/metrics";
import { fmtDate, fmtDateTime, localDay } from "@/lib/dates";
import { requireSection } from "@/lib/guard";
import { createClient } from "@/lib/supabase/server";
import { CampaignForm } from "../CampaignForm";
import { Brief } from "./Brief";
import { CampaignPieces } from "./CampaignPieces";

type Event = { id: string; action: string; at: string; profiles: { name: string } | null };

export default async function CampanaPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ nueva?: string }> }) {
  const { id } = await params;
  const { nueva } = await searchParams;
  const { perms } = await requireSection("campanas");
  const c = await getCampaign(id);
  if (!c) notFound();
  const supabase = await createClient();
  const [brand, contents, { data: events }, results] = await Promise.all([
    getBrand(c.brand_id),
    listContents(),
    supabase.from("campaign_events").select("id, action, at, profiles(name)").eq("campaign_id", id).order("at", { ascending: false }).limit(20),
    listResults(),
  ]);
  if (!brand) notFound();
  const today = localDay();
  const status = campaignStatus(c, today);
  const pieces = contents.filter((p) => p.campaign_id === c.id).sort((a, b) => (a.publish_on ?? "9999").localeCompare(b.publish_on ?? "9999"));
  const candidates = contents.filter((p) => p.brand_id === c.brand_id && p.campaign_id !== c.id);
  const brief = buildBrief(c, brand, pieces);
  const pr = progress(pieces);
  const generateHref = `/generar?campana=${c.id}`;
  const published = pieces.filter((p) => p.status === "Publicado");
  const withResults = published.filter((p) => results.has(p.id));
  const totals = sum(withResults.map((p) => results.get(p.id)!));
  const tr = rates(totals);

  return (
    <>
      <Link href="/campanas" className="back">← Campañas</Link>
      <div className="page-head" style={{ marginBottom: 14 }}>
        <div>
          <h1 className="page-title" data-testid="page-title">{c.name}</h1>
          <div className="status-bar">
            <span className="dot" style={{ background: c.brands?.color }} />
            <span className="muted">{c.brands?.name} · {fmtDate(c.starts_on)} al {fmtDate(c.ends_on)} · {c.goal}</span>
            <Badge tone={statusTone(status)}>{status}</Badge>
            <span className="muted">{pr.total ? `${pr.ready} de ${pr.total} piezas listas` : "Sin piezas"}</span>
          </div>
        </div>
        {perms.create && (
          <div className="page-action">
            <Link className="btn btn-secondary" href={`/contenidos/nueva?campana=${c.id}`} data-testid="camp-own">Cargar pieza propia</Link>
            <Link className="btn btn-secondary" href={`${generateHref}&formato=Anuncio`} data-testid="camp-generate-ad">Generar anuncio</Link>
            <Link className="btn btn-primary" href={generateHref} data-testid="camp-generate">Generar pieza</Link>
          </div>
        )}
      </div>
      {nueva && <div style={{ marginBottom: 12 }}><Notice tone="blue">Campaña creada. Sumale las piezas que van a salir o generá nuevas desde acá.</Notice></div>}

      <div className="grid-2">
        <div className="stack">
          <CampaignPieces
            campaignId={c.id}
            canEdit={perms.create}
            pieces={pieces.map((p) => ({ id: p.id, title: p.title || p.topic || "Sin título", channel: p.channel, format: p.format, status: p.status, publish_on: p.publish_on }))}
            candidates={candidates.map((p) => ({ id: p.id, title: p.title || p.topic || "Sin título", status: p.status, other: Boolean(p.campaign_id) }))}
          />
          {published.length > 0 && (
            <div className="card" data-testid="camp-results">
              <h2 className="card-title">Resultados</h2>
              {!withResults.length ? <p className="muted" style={{ margin: 0 }}>Hay {published.length} {published.length === 1 ? "pieza publicada" : "piezas publicadas"} sin resultados. Cargalos desde cada pieza.</p> : (
                <>
                  <div className="facts" style={{ margin: 0 }}>
                    <span>Personas alcanzadas</span><b>{fmtInt(totals.reach)}</b>
                    <span>Interacción</span><b>{fmtPct(tr.engagement)}</b>
                    <span>Consultas</span><b data-testid="camp-inquiries">{fmtInt(totals.inquiries)}</b>
                    <span>Ventas</span><b>{fmtInt(totals.sales)}</b>
                    <span>Invertido en pauta</span><b>{fmtARS(totals.spend)}{c.budget > 0 ? ` de ${fmtARS(c.budget)}` : ""}</b>
                    <span>Por consulta</span><b>{tr.cpi ? fmtARS(tr.cpi) : "-"}</b>
                  </div>
                  {c.budget > 0 && <div className="bar" style={{ marginTop: 12 }} title="Presupuesto usado"><i style={{ width: `${Math.min(100, Math.round((totals.spend / c.budget) * 100))}%` }} /></div>}
                  <p className="hint" style={{ margin: "8px 0 0" }}>{withResults.length} de {published.length} piezas publicadas con resultados. <Link href={`/metricas?marca=${c.brand_id}`} style={{ color: "var(--accent)" }}>Ver métricas</Link></p>
                </>
              )}
            </div>
          )}
          <CampaignForm campaign={c} brands={[]} products={splitList(brand.products)} canEdit={perms.create} today={today} />
          <div className="card">
            <h2 className="card-title">Historial</h2>
            <div className="timeline" data-testid="camp-history">
              {((events ?? []) as unknown as Event[]).map((e) => (
                <div key={e.id}><b>{e.action}{e.profiles ? ` · ${e.profiles.name}` : ""}</b><span>{fmtDateTime(e.at)}</span></div>
              ))}
            </div>
          </div>
        </div>
        <Brief brief={brief} text={briefText(c.name, brand.name, brief)} generateHref={perms.create ? `${generateHref}&formato=Anuncio` : undefined} />
      </div>
    </>
  );
}
