import Link from "next/link";
import { Badge, PageHeader } from "@/components/ui";
import { campaignStatus, dailyBudget, fmtARS, metaObjective, progress, statusTone, type CampaignStatus } from "@/lib/campaigns";
import { listBrands, listCampaigns, listContents } from "@/lib/data";
import { fmtDate, localDay } from "@/lib/dates";
import { requireSection } from "@/lib/guard";

const ORDER: CampaignStatus[] = ["En curso", "Planificada", "Terminada"];

export default async function CampanasPage() {
  const { perms } = await requireSection("campanas");
  const today = localDay();
  const [campaigns, contents, brands] = await Promise.all([listCampaigns(), listContents(), listBrands()]);
  const rows = campaigns
    .map((c) => ({ c, status: campaignStatus(c, today), pieces: contents.filter((p) => p.campaign_id === c.id), brand: brands.find((b) => b.id === c.brand_id) }))
    .sort((a, b) => ORDER.indexOf(a.status) - ORDER.indexOf(b.status) || a.c.starts_on.localeCompare(b.c.starts_on));
  return (
    <>
      <PageHeader
        title="Campañas"
        subtitle="Cada campaña junta objetivo, fechas, presupuesto y público, agrupa sus piezas y arma el brief para Meta Ads."
        action={perms.create ? <Link className="btn btn-primary" href="/campanas/nueva" data-testid="camp-new">Nueva campaña</Link> : undefined}
      />
      {rows.length === 0 ? (
        <div className="card empty">Todavía no hay campañas.{perms.create && " Creá la primera: por ejemplo, la de la próxima fecha comercial."}</div>
      ) : (
        <div className="camp-grid">
          {rows.map(({ c, status, pieces, brand }) => {
            const pr = progress(pieces);
            return (
              <Link key={c.id} href={`/campanas/${c.id}`} className="card camp-card" data-testid="camp-card">
                <div className="status-bar" style={{ justifyContent: "space-between" }}>
                  <span className="muted"><span className="dot" style={{ background: c.brands?.color, marginRight: 6, width: 8, height: 8 }} />{c.brands?.name}</span>
                  <Badge tone={statusTone(status)}>{status}</Badge>
                </div>
                <h3>{c.name}</h3>
                <div className="muted">{fmtDate(c.starts_on)} al {fmtDate(c.ends_on)} · {c.goal}</div>
                <div className="facts" style={{ margin: 0 }}>
                  <span>Presupuesto</span><b>{c.budget > 0 ? `${fmtARS(c.budget)} · ${fmtARS(dailyBudget(c))}/día` : "Sin cargar"}</b>
                  <span>En Meta</span><b>{brand ? metaObjective(c.goal, brand).objective : "-"}</b>
                </div>
                <div>
                  <div className="bar"><i style={{ width: `${pr.pct}%` }} /></div>
                  <small className="muted">{pr.total ? `${pr.ready} de ${pr.total} piezas listas` : "Sin piezas todavía"}</small>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </>
  );
}
