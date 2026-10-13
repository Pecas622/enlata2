import Link from "next/link";
import { Badge, PageHeader } from "@/components/ui";
import { formatLabel } from "@/lib/channels";
import { listBrands, listContents, type ContentRow } from "@/lib/data";
import { daysSince, fmtDate, localDay } from "@/lib/dates";
import { requireSection } from "@/lib/guard";
import { statusTone } from "@/lib/workflow";

function List({ rows, empty, testId }: { rows: ContentRow[]; empty: string; testId: string }) {
  if (!rows.length) return <div className="empty" style={{ padding: 20 }}>{empty}</div>;
  return (
    <div className="stack" style={{ gap: 0 }} data-testid={testId}>
      {rows.map((r) => (
        <Link key={r.id} href={`/contenidos/${r.id}`} className="cart-line" style={{ justifyContent: "space-between" }}>
          <div>
            <b style={{ fontSize: 13.5 }}>{r.title || r.topic}</b>
            <div className="sub muted" style={{ fontSize: 11.5 }}>
              <span className="dot" style={{ background: r.brands?.color, width: 8, height: 8, marginRight: 4 }} />
              {r.brands?.name} · {r.channel} {formatLabel(r.format, r.channel)}{r.publish_on ? ` · ${fmtDate(r.publish_on)}` : ""}
            </div>
          </div>
          <Badge tone={statusTone(r.status)}>{r.status}</Badge>
        </Link>
      ))}
    </div>
  );
}

export default async function InicioPage() {
  const { user, perms } = await requireSection("inicio");
  const [rows, brands] = await Promise.all([listContents(), listBrands()]);
  const today = localDay();
  const month = today.slice(0, 7);
  const review = rows.filter((r) => r.status === "En revisión");
  const toPublish = rows.filter((r) => r.status === "Aprobado").sort((a, b) => (a.publish_on ?? "9999").localeCompare(b.publish_on ?? "9999"));
  const published = rows.filter((r) => r.status === "Publicado" && (r.publish_on ?? r.updated_at).slice(0, 7) === month);
  const drafts = rows.filter((r) => r.status === "Borrador" || r.status === "Idea");
  const late = toPublish.filter((r) => r.publish_on && daysSince(r.publish_on, today) > 0);

  return (
    <>
      <PageHeader
        title={`Hola, ${user.name}`}
        subtitle={perms.review && !perms.create ? "Esto es lo que espera tu aprobación." : "Así viene el contenido de tus marcas."}
        action={perms.create ? <Link className="btn btn-primary" href="/generar" data-testid="cta-generar">Generar contenido</Link> : undefined}
      />
      <div className="kpis">
        <Link href="/contenidos?estado=En revisión" className="kpi" data-testid="kpi-review"><span>Esperan aprobación</span><b>{review.length}</b><small>en revisión</small></Link>
        <Link href="/contenidos?estado=Aprobado" className="kpi"><span>Listas para publicar</span><b>{toPublish.length}</b><small>{late.length ? `${late.length} con la fecha pasada` : "aprobadas"}</small></Link>
        <Link href="/contenidos?estado=Publicado" className="kpi"><span>Publicadas este mes</span><b>{published.length}</b><small>piezas</small></Link>
        <Link href="/contenidos?estado=Borrador" className="kpi"><span>En borrador</span><b>{drafts.length}</b><small>ideas y borradores</small></Link>
        <Link href="/marca" className="kpi"><span>Marcas</span><b>{brands.length}</b><small>activas</small></Link>
      </div>
      <div className="grid-2">
        <div className="card">
          <h2 className="card-title">{perms.review ? "Esperan tu aprobación" : "En revisión"}</h2>
          <List rows={review} empty="No hay nada esperando aprobación." testId="list-review" />
        </div>
        <div className="card">
          <h2 className="card-title">Para publicar</h2>
          <List rows={toPublish} empty="Cuando aprueben una pieza, aparece acá con su fecha." testId="list-publish" />
        </div>
        {perms.create && (
          <div className="card">
            <h2 className="card-title">Borradores</h2>
            <List rows={drafts.slice(0, 6)} empty="Sin borradores. Generá una pieza para empezar." testId="list-drafts" />
          </div>
        )}
      </div>
    </>
  );
}
