import Link from "next/link";
import { Badge, PageHeader } from "@/components/ui";
import { formatLabel } from "@/lib/channels";
import { listBrands, listContents, listResults, publishedPieces, type ContentRow } from "@/lib/data";
import { fmtDate, localDay } from "@/lib/dates";
import { requireSection } from "@/lib/guard";
import { brandHealth, homeTips, todayList } from "@/lib/home";
import { fmtInt, fmtPct } from "@/lib/metrics";
import { statusTone } from "@/lib/workflow";

function Change({ d }: { d: number | null }) {
  if (d === null) return <small>últimos 30 días</small>;
  // Con una base chica el porcentaje confunde: más del triple se dice en palabras, como en el análisis.
  const size = Math.abs(d) > 3 ? (d > 0 ? "mucho más" : "mucho menos") : fmtPct(Math.abs(d));
  return <small className={d >= 0 ? "up" : "down"}>{d >= 0 ? "▲" : "▼"} {size} que los 30 días anteriores</small>;
}

function Line({ r, extra }: { r: ContentRow; extra?: string }) {
  return (
    <Link href={`/contenidos/${r.id}`} className="cart-line" style={{ justifyContent: "space-between" }}>
      <div>
        <b style={{ fontSize: 13.5 }}>{r.post_time ? `${r.post_time.slice(0, 5)} · ` : ""}{r.title || r.topic}</b>
        <div className="sub muted" style={{ fontSize: 11.5 }}>
          <span className="dot" style={{ background: r.brands?.color, width: 8, height: 8, marginRight: 4 }} />
          {r.brands?.name} · {r.channel} {formatLabel(r.format, r.channel)}{extra ? ` · ${extra}` : ""}
        </div>
      </div>
      <Badge tone={statusTone(r.status)}>{r.status}</Badge>
    </Link>
  );
}

export default async function InicioPage({ searchParams }: { searchParams: Promise<{ marca?: string }> }) {
  const { user, perms } = await requireSection("inicio");
  const { marca } = await searchParams;
  const [allRows, allBrands, results] = await Promise.all([listContents(), listBrands(), listResults()]);
  const brand = allBrands.find((b) => b.id === marca) ?? null;
  const brands = brand ? [brand] : allBrands;
  const rows = brand ? allRows.filter((r) => r.brand_id === brand.id) : allRows;
  const today = localDay();
  const published = publishedPieces(rows, results);
  const health = brandHealth(published, today);
  const byId = new Map(rows.map((r) => [r.id, r]));
  const todays = todayList(rows, today);
  const tips = homeTips({ pieces: rows, brands, published, health, today }).filter((t) => t.who === "all" || (t.who === "create" ? perms.create : perms.review));
  const review = rows.filter((r) => r.status === "En revisión");
  const t = health.totals;

  return (
    <>
      <PageHeader
        title={`Hola, ${user.name}`}
        subtitle={perms.review && !perms.create ? "Esto es lo que espera tu aprobación y cómo vienen tus marcas." : "Cómo viene tu marca, qué sale hoy y qué conviene hacer."}
        action={perms.create ? <Link className="btn btn-primary" href="/generar" data-testid="cta-generar">Generar contenido</Link> : undefined}
      />
      {allBrands.length > 1 && (
        <div className="pills">
          <Link className={`pill${!brand ? " active" : ""}`} href="/inicio">Todas las marcas</Link>
          {allBrands.map((b) => (
            <Link key={b.id} className={`pill${brand?.id === b.id ? " active" : ""}`} href={`/inicio?marca=${b.id}`} data-testid="home-brand">
              <span className="dot" style={{ background: b.color }} />{b.name}
            </Link>
          ))}
        </div>
      )}

      <section className="card home-q" data-testid="home-health">
        <h2 className="card-title">¿Cómo está funcionando {brand ? brand.name : allBrands.length === 1 ? allBrands[0].name : "mi marca"}?</h2>
        {health.withResults ? (
          <div className="kpis" style={{ marginBottom: 12 }}>
            <Link href="/metricas" className="kpi"><span>Personas alcanzadas</span><b>{fmtInt(t.reach)}</b><Change d={health.change.reach} /></Link>
            <Link href="/metricas" className="kpi"><span>Interacciones</span><b>{fmtInt(t.interactions)}</b><Change d={health.change.interactions} /></Link>
            <Link href="/metricas" className="kpi"><span>Consultas</span><b>{fmtInt(t.inquiries)}</b><Change d={health.change.inquiries} /></Link>
            <Link href="/contenidos?estado=Publicado" className="kpi"><span>Publicadas</span><b>{health.published}</b><small>{health.withResults} con resultados</small></Link>
          </div>
        ) : null}
        <p style={{ margin: 0, fontSize: 14 }} data-testid="home-summary">{health.summary}</p>
        <p className="hint" style={{ margin: "8px 0 0" }}>Con los resultados que se cargan en cada pieza publicada. Cuando conectes las redes, se van a traer solos.</p>
      </section>

      <div className="grid-2">
        <section className="card home-q" data-testid="home-today">
          <h2 className="card-title">¿Qué tengo que publicar hoy?</h2>
          {!todays.length ? (
            <div className="empty" style={{ padding: 16 }}>
              Hoy no hay nada en el calendario. <Link href={`/calendario?vista=dia&dia=${today}`} style={{ color: "var(--accent)" }}>Ver el día</Link>
            </div>
          ) : (
            <div className="stack" style={{ gap: 0 }} data-testid="list-today">
              {todays.map((p) => <Line key={p.id} r={byId.get(p.id)!} extra={p.late ? `era para el ${fmtDate(p.publish_on)}. ${p.hint}` : p.hint} />)}
            </div>
          )}
        </section>

        <section className="card home-q" data-testid="home-tips">
          <h2 className="card-title">¿Qué debería hacer para conseguir mejores resultados?</h2>
          {!tips.length ? <div className="empty" style={{ padding: 16 }}>Vas al día. Seguí cargando resultados para que las recomendaciones sean más finas.</div> : (
            <ol className="tips">
              {tips.map((x, i) => <li key={i}><Link href={x.href} data-testid="home-tip">{x.text}</Link></li>)}
            </ol>
          )}
        </section>
      </div>

      {perms.review && review.length > 0 && (
        <section className="card">
          <h2 className="card-title">{perms.create ? "En revisión" : "Esperan tu aprobación"}</h2>
          <div className="stack" style={{ gap: 0 }} data-testid="list-review">
            {review.map((r) => <Line key={r.id} r={r} extra={r.publish_on ? fmtDate(r.publish_on) : undefined} />)}
          </div>
        </section>
      )}
    </>
  );
}
