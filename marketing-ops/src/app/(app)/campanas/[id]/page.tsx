import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge, Notice } from "@/components/ui";
import { briefText, buildBrief, campaignStatus, progress, statusTone } from "@/lib/campaigns";
import { getBrand, getCampaign, listContents } from "@/lib/data";
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
  const [brand, contents, { data: events }] = await Promise.all([
    getBrand(c.brand_id),
    listContents(),
    supabase.from("campaign_events").select("id, action, at, profiles(name)").eq("campaign_id", id).order("at", { ascending: false }).limit(20),
  ]);
  if (!brand) notFound();
  const today = localDay();
  const status = campaignStatus(c, today);
  const pieces = contents.filter((p) => p.campaign_id === c.id).sort((a, b) => (a.publish_on ?? "9999").localeCompare(b.publish_on ?? "9999"));
  const candidates = contents.filter((p) => p.brand_id === c.brand_id && p.campaign_id !== c.id);
  const brief = buildBrief(c, brand, pieces);
  const pr = progress(pieces);
  const generateHref = `/generar?campana=${c.id}`;

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
          <CampaignForm campaign={c} brands={[]} canEdit={perms.create} today={today} />
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
