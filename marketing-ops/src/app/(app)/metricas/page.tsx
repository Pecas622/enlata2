import Link from "next/link";
import { Badge, PageHeader } from "@/components/ui";
import { shiftMonth } from "@/lib/calendar";
import { campaignStatus, fmtARS } from "@/lib/campaigns";
import { formatLabel } from "@/lib/channels";
import { listBrands, listCampaigns, listContents, listResults, publishedPieces } from "@/lib/data";
import { fmtDate, localDay } from "@/lib/dates";
import { requireSection } from "@/lib/guard";
import { analyze, delta, fmtInt, fmtPct, formatGroup, groupBy, inPeriod, plural, previousPeriod, rates, resolvePeriod, sum, type Group } from "@/lib/metrics";
import { AnalysisPanel } from "./AnalysisPanel";

function Delta({ cur, prev }: { cur: number; prev: number }) {
  const d = delta(cur, prev);
  if (d === null) return <small>sin datos del período anterior</small>;
  if (Math.abs(d) > 3) return <small className={d > 0 ? "up" : "down"}>{d > 0 ? "mucho más" : "mucho menos"} que antes</small>;
  return <small className={d >= 0 ? "up" : "down"}>{d >= 0 ? "▲" : "▼"} {fmtPct(Math.abs(d))} contra el período anterior</small>;
}

function Breakdown({ title, groups, label, testId }: { title: string; groups: Group[]; label: (k: string) => string; testId: string }) {
  const max = Math.max(...groups.map((g) => g.engagement ?? 0), 0.0001);
  return (
    <div className="card">
      <h2 className="card-title">{title}</h2>
      {!groups.length ? <div className="empty" style={{ padding: 16 }}>Sin resultados cargados.</div> : (
        <div className="stack" style={{ gap: 12 }} data-testid={testId}>
          {groups.map((g) => (
            <div key={g.key}>
              <div className="metric-row"><b>{label(g.key)}</b><span className="muted">{g.count} {g.count === 1 ? "pieza" : "piezas"} · {fmtInt(g.totals.reach)} alcanzadas · {fmtInt(g.totals.inquiries)} consultas</span><b>{fmtPct(g.engagement)}</b></div>
              <div className="bar"><i style={{ width: `${Math.round(((g.engagement ?? 0) / max) * 100)}%` }} /></div>
            </div>
          ))}
          <p className="hint" style={{ margin: 0 }}>El porcentaje es la interacción: me gusta, comentarios, guardados y compartidos sobre las personas alcanzadas.</p>
        </div>
      )}
    </div>
  );
}

export default async function MetricasPage({ searchParams }: { searchParams: Promise<{ mes?: string; marca?: string }> }) {
  const { perms } = await requireSection("metricas");
  const sp = await searchParams;
  const today = localDay();
  const period = resolvePeriod(sp.mes, today);
  const prevPeriod = previousPeriod(period);
  const [contents, results, brands, campaigns] = await Promise.all([listContents(), listResults(), listBrands(), listCampaigns()]);
  const brand = brands.find((b) => b.id === sp.marca);
  const all = publishedPieces(contents, results).filter((p) => !brand || p.brand_id === brand.id);
  const rows = all.filter((p) => inPeriod(p.day, period)).sort((a, b) => b.day.localeCompare(a.day));
  const prev = all.filter((p) => inPeriod(p.day, prevPeriod));
  const t = sum(rows.map((p) => p.results));
  const before = sum(prev.map((p) => p.results));
  const r = rates(t);
  const analysis = analyze(rows, prev);
  const thisMonth = today.slice(0, 7);
  const viewMonth = period.month ?? thisMonth;

  const link = (patch: { mes?: string | null; marca?: string | null }) => {
    const q = new URLSearchParams();
    const m = patch.mes === undefined ? period.month : patch.mes;
    if (m) q.set("mes", m);
    const b = patch.marca === undefined ? brand?.id : patch.marca;
    if (b) q.set("marca", b);
    const s = q.toString();
    return `/metricas${s ? `?${s}` : ""}`;
  };

  // Campañas que se cruzan con el período, con lo que dieron sus piezas.
  const camps = campaigns
    .filter((c) => (!brand || c.brand_id === brand.id) && c.starts_on <= period.to && c.ends_on >= period.from)
    .map((c) => {
      const ps = all.filter((p) => p.campaign_id === c.id);
      const ct = sum(ps.map((p) => p.results));
      return { c, pieces: ps.length, loaded: ps.filter((p) => p.results).length, t: ct, cpi: rates(ct).cpi };
    })
    .filter((x) => x.pieces > 0);

  return (
    <>
      <PageHeader title="Métricas" subtitle="Cómo les fue a las piezas publicadas, qué funcionó y qué conviene repetir." />
      <div className="cal-toolbar">
        <div className="cal-nav">
          <Link className="btn btn-secondary cal-arrow" href={link({ mes: shiftMonth(viewMonth, -1) })} aria-label="Mes anterior" data-testid="met-prev">‹</Link>
          <h2 className="cal-month" data-testid="met-period">{period.label}</h2>
          {period.month && period.month < thisMonth
            ? <Link className="btn btn-secondary cal-arrow" href={link({ mes: shiftMonth(period.month, 1) })} aria-label="Mes siguiente" data-testid="met-next">›</Link>
            : <span className="btn btn-secondary cal-arrow" aria-disabled style={{ opacity: 0.35 }}>›</span>}
          {period.month !== thisMonth && <Link className="btn btn-ghost" href={link({ mes: thisMonth })} data-testid="met-month">Este mes</Link>}
          {period.month && <Link className="btn btn-ghost" href={link({ mes: null })} data-testid="met-last30">Últimos 30 días</Link>}
        </div>
        <div className="pills" style={{ margin: 0 }}>
          <Link className={`pill${!brand ? " active" : ""}`} href={link({ marca: null })}>Todas las marcas</Link>
          {brands.map((b) => (
            <Link key={b.id} className={`pill${brand?.id === b.id ? " active" : ""}`} href={link({ marca: b.id })} data-testid="met-brand">
              <span className="dot" style={{ background: b.color, width: 8, height: 8, marginRight: 6 }} />{b.name}
            </Link>
          ))}
        </div>
      </div>

      <div className="kpis" data-testid="met-kpis">
        <div className="kpi"><span>Personas alcanzadas</span><b data-testid="kpi-reach">{fmtInt(t.reach)}</b><Delta cur={t.reach} prev={before.reach} /></div>
        <div className="kpi"><span>Interacciones</span><b>{fmtInt(t.interactions)}</b><small>{fmtPct(r.engagement)} de las alcanzadas</small></div>
        <div className="kpi"><span>Consultas</span><b data-testid="kpi-inquiries">{fmtInt(t.inquiries)}</b><Delta cur={t.inquiries} prev={before.inquiries} /></div>
        <div className="kpi"><span>Ventas</span><b>{fmtInt(t.sales)}</b><small>que vinieron de las piezas</small></div>
        <div className="kpi"><span>Inversión en pauta</span><b>{fmtARS(t.spend)}</b><small>{r.cpi ? `${fmtARS(r.cpi)} por consulta` : "sin pauta en el período"}</small></div>
      </div>

      <div className="grid-2">
        <AnalysisPanel key={`${period.from}-${brand?.id ?? ""}`} initial={analysis} aiEnabled={Boolean(process.env.ANTHROPIC_API_KEY)} mes={period.month} brandId={brand?.id ?? null} planHref={perms.create ? `/calendario/plan?mes=${shiftMonth(thisMonth, 1)}${brand ? `&marca=${brand.id}` : ""}` : undefined} />
        <div className="stack">
          <Breakdown title="Por formato" groups={groupBy(rows, formatGroup)} label={plural} testId="met-formats" />
          <Breakdown title="Por red" groups={groupBy(rows, (p) => p.channel)} label={(k) => k} testId="met-channels" />
        </div>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <h2 className="card-title">Piezas publicadas</h2>
        {!rows.length ? <div className="empty" style={{ padding: 20 }}>No hay piezas publicadas en este período.</div> : (
          <div className="table-wrap">
            <table className="table wide" data-testid="met-table">
              <thead>
                <tr><th>Pieza</th><th>Publicada</th><th className="r">Alcanzadas</th><th className="r">Interacción</th><th className="r">Consultas</th><th className="r">Ventas</th><th className="r">Inversión</th></tr>
              </thead>
              <tbody>
                {rows.map((p) => {
                  const pr = p.results ? rates(p.results) : null;
                  return (
                    <tr key={p.id} data-testid="met-row">
                      <td>
                        <Link href={`/contenidos/${p.id}${p.results ? "" : "#resultados"}`} style={{ fontWeight: 600 }}>{p.title}</Link>
                        <div className="sub">{p.brand} · {p.channel} {formatLabel(p.format, p.channel)}</div>
                      </td>
                      <td>{fmtDate(p.day)}</td>
                      {p.results ? (
                        <>
                          <td className="r">{fmtInt(p.results.reach)}</td>
                          <td className="r">{fmtPct(pr!.engagement)}</td>
                          <td className="r">{fmtInt(p.results.inquiries)}</td>
                          <td className="r">{fmtInt(p.results.sales)}</td>
                          <td className="r">{p.results.spend ? fmtARS(p.results.spend) : "-"}</td>
                        </>
                      ) : (
                        <td colSpan={5} className="r">
                          <Link href={`/contenidos/${p.id}#resultados`} data-testid="met-missing"><Badge tone="amber">{perms.create ? "Cargar resultados" : "Sin resultados"}</Badge></Link>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {camps.length > 0 && (
        <div className="card" style={{ marginTop: 16 }}>
          <h2 className="card-title">Campañas</h2>
          <div className="table-wrap">
            <table className="table wide" data-testid="met-campaigns">
              <thead>
                <tr><th>Campaña</th><th>Estado</th><th className="r">Alcanzadas</th><th className="r">Consultas</th><th className="r">Invertido</th><th className="r">Por consulta</th></tr>
              </thead>
              <tbody>
                {camps.map(({ c, pieces, loaded, t: ct, cpi }) => (
                  <tr key={c.id}>
                    <td><Link href={`/campanas/${c.id}`} style={{ fontWeight: 600 }}>{c.name}</Link><div className="sub">{c.brands?.name} · {loaded} de {pieces} piezas con resultados</div></td>
                    <td>{campaignStatus(c, today)}</td>
                    <td className="r">{fmtInt(ct.reach)}</td>
                    <td className="r">{fmtInt(ct.inquiries)}</td>
                    <td className="r">{fmtARS(ct.spend)}{c.budget > 0 && <div className="sub">de {fmtARS(c.budget)}</div>}</td>
                    <td className="r">{cpi ? fmtARS(cpi) : "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}
