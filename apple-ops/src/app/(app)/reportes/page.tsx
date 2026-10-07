import Link from "next/link";
import { PageHeader } from "@/components/ui";
import { requireSection } from "@/lib/guard";
import { fmtUSD } from "@/lib/money";
import { loadReportSales, loadSellers } from "@/lib/report-data";
import { periodFrom, salesReport } from "@/lib/reports";
import { createClient } from "@/lib/supabase/server";
import { idOf, periodOf, PERIODS } from "./period";

export default async function ReportesPage({ searchParams }: { searchParams: Promise<{ p?: string }> }) {
  const { p } = await searchParams;
  const { perms } = await requireSection("reportes");
  const period = periodOf(p);
  const supabase = await createClient();
  const [sales, sellers] = await Promise.all([loadReportSales(supabase, periodFrom(period)), loadSellers(supabase)]);
  const r = salesReport(sales, sellers);

  return (
    <>
      <PageHeader
        title="Reportes"
        subtitle="Ventas, ganancia y rendimiento por vendedor"
        action={
          <div className="row" style={{ alignItems: "center" }}>
            <div className="pills" style={{ margin: 0 }}>
              {PERIODS.map((x) => (
                <Link key={x} href={`/reportes?p=${idOf(x)}`} className={`pill${x === period ? " active" : ""}`} data-testid={`period-${idOf(x)}`}>{x}</Link>
              ))}
            </div>
            <a className="btn btn-secondary" href={`/reportes/ventas.csv?p=${idOf(period)}`} download data-testid="export-csv">Exportar CSV</a>
          </div>
        }
      />
      <div className="stats">
        <div className="stat good"><span>Facturado</span><b data-testid="rep-rev">{fmtUSD(r.rev)}</b><small data-testid="rep-count">{r.count} ventas</small></div>
        {perms.seeCost && <div className="stat"><span>Ganancia</span><b data-testid="rep-profit">{fmtUSD(r.profit)}</b><small>{r.rev ? `Margen ${r.margin}%` : ""}</small></div>}
        <div className="stat"><span>Ticket promedio</span><b>{fmtUSD(r.avgTicket)}</b></div>
        <div className="stat"><span>Ventas con canje</span><b>{r.canjes}</b><small>{r.count ? `${r.canjesPct}% de las ventas` : ""}</small></div>
      </div>
      <div className="grid-2">
        <div className="card">
          <h2 className="card-title">Por vendedor</h2>
          {r.bySeller.length === 0 ? <div className="empty">Sin ventas en el período.</div> : (
            <div className="table-wrap">
              <table className="table" data-testid="by-seller">
                <thead><tr><th>Vendedor</th><th>Ventas</th><th className="r">Facturado</th>{perms.seeCost && <><th className="r">Ganancia</th><th className="r">Comisión</th></>}</tr></thead>
                <tbody>
                  {r.bySeller.map((x) => (
                    <tr key={x.id}>
                      <td>{x.name}</td><td>{x.n}</td><td className="r">{fmtUSD(x.rev)}</td>
                      {perms.seeCost && <><td className="r">{fmtUSD(x.profit)}</td><td className="r">{fmtUSD(x.commission)}</td></>}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
        <div className="card">
          <h2 className="card-title">Por categoría</h2>
          {r.byCategory.length === 0 ? <div className="empty">Sin ventas en el período.</div> : (
            <div className="table-wrap">
              <table className="table" data-testid="by-category">
                <thead><tr><th>Categoría</th><th className="r">Facturado</th><th className="r">Peso</th></tr></thead>
                <tbody>{r.byCategory.map((x) => <tr key={x.k}><td>{x.k}</td><td className="r">{fmtUSD(x.v)}</td><td className="r">{x.pct}%</td></tr>)}</tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
