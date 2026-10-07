import Link from "next/link";
import { Badge, Notice, PageHeader } from "@/components/ui";
import { isLow } from "@/lib/accessories";
import { hasModule } from "@/lib/modules";
import { lowMarginDevices, lowMarginSales, staleDevices } from "@/lib/alerts";
import { deviceShort } from "@/lib/catalog";
import { fmtDate, fmtTime, localDay } from "@/lib/dates";
import { requireSection } from "@/lib/guard";
import { fmtARS, fmtUSD } from "@/lib/money";
import { loadReportSales } from "@/lib/report-data";
import { addDays, closed, inPeriod, last7Days, saleCost } from "@/lib/reports";
import { createClient } from "@/lib/supabase/server";

type Device = { id: string; model: string; capacity: number; condition: string; entry_date: string; price_usd: number; device_costs: { cost_usd: number } | null };
type Shift = { number: string; opened_at: string; opened_by: string };

export default async function DashboardPage() {
  const { perms, user } = await requireSection("dashboard");
  const supabase = await createClient();
  const today = localDay();
  const monthStart = today.slice(0, 8) + "01";
  const from = [monthStart, addDays(today, -6)].sort()[0];
  const [sales, recent, { data: devs }, { data: accs }, { data: shift }, { data: lastClosed }, { data: store }] = await Promise.all([
    loadReportSales(supabase, from),
    loadReportSales(supabase, undefined, 6),
    supabase.from("devices").select("id, model, capacity, condition, entry_date, price_usd, device_costs(cost_usd)").eq("status", "Disponible").order("entry_date"),
    supabase.from("accessories").select("id, name, stock, min_stock").order("stock"),
    supabase.rpc("estado_caja"),
    perms.seeAllShifts
      ? supabase.from("cash_shifts").select("number, diff_ars, diff_usd").eq("status", "Cerrada").order("closed_at", { ascending: false }).limit(1).maybeSingle()
      : Promise.resolve({ data: null }),
    supabase.from("stores").select("stale_days, target_margin").eq("id", user.storeId).single(),
  ]);
  const open = shift as Shift | null;
  const todaySales = closed(inPeriod(sales, today));
  const revenueToday = todaySales.reduce((a, s) => a + s.total_usd, 0);
  const profitToday = revenueToday - todaySales.reduce((a, s) => a + saleCost(s), 0);
  const inStock = (devs ?? []) as unknown as Device[];
  const capital = inStock.reduce((a, d) => a + Number(d.device_costs?.cost_usd ?? 0), 0);
  const canjesMes = closed(inPeriod(sales, monthStart)).filter((s) => s.trade_in_usd > 0);
  const withAcc = hasModule(user.modules, "accesorios");
  const withCanje = hasModule(user.modules, "canje");
  const lowAcc = withAcc ? (accs ?? []).filter(isLow) : [];
  const alertDevs = inStock.map((d) => ({ ...d, price_usd: Number(d.price_usd), cost_usd: d.device_costs ? Number(d.device_costs.cost_usd) : null }));
  const oldStock = staleDevices(alertDevs, store?.stale_days ?? 30);
  const target = Number(store?.target_margin ?? 0.12);
  const canSeeAlerts = perms.seeCost && hasModule(user.modules, "alertas");
  const marginAlerts = canSeeAlerts ? lowMarginDevices(alertDevs, target).length + lowMarginSales(inPeriod(sales, addDays(today, -6)), target).length : 0;
  const days = last7Days(sales, today);
  const max = Math.max(1, ...days.map((d) => d.value));
  const diffArs = Number(lastClosed?.diff_ars ?? 0);
  const diffUsd = Number(lastClosed?.diff_usd ?? 0);

  return (
    <>
      <PageHeader title="Dashboard" subtitle="Resumen de tu local en tiempo real" />
      {open && localDay(open.opened_at) < today && (
        <div style={{ marginBottom: 14 }} data-testid="stale-shift">
          <Notice tone="red">Hay una caja abierta desde el {fmtDate(open.opened_at)}. Cerrala antes de seguir vendiendo.{perms.blindCount || perms.seeAllShifts ? <> <Link href="/caja" style={{ textDecoration: "underline" }}>Ir a Caja</Link></> : null}</Notice>
        </div>
      )}
      {lastClosed && (diffArs !== 0 || diffUsd !== 0) && (
        <div style={{ marginBottom: 14 }} data-testid="last-diff">
          <Notice>El último cierre ({lastClosed.number}) tuvo diferencia: {[diffArs ? fmtARS(diffArs) : "", diffUsd ? fmtUSD(diffUsd) : ""].filter(Boolean).join(" y ")}.</Notice>
        </div>
      )}
      <div className="stats">
        <div className="stat good"><span>Ventas del día</span><b data-testid="stat-today">{fmtUSD(revenueToday)}</b><small>{todaySales.length} operaciones</small></div>
        {perms.seeCost && <div className="stat"><span>Ganancia del día</span><b data-testid="stat-profit">{fmtUSD(profitToday)}</b></div>}
        <div className="stat"><span>Equipos en stock</span><b data-testid="stat-stock">{inStock.length}</b>{perms.seeCost && <small>Capital: {fmtUSD(capital)}</small>}</div>
        <div className={`stat ${open ? "good" : "warn"}`}>
          <span>Caja</span><b data-testid="stat-caja">{open ? "Abierta" : "Cerrada"}</b>
          <small>{open ? `Desde ${fmtTime(open.opened_at)} · ${open.opened_by}` : "Abrila para vender"}</small>
        </div>
        {withCanje && <div className="stat"><span>Canjes del mes</span><b>{canjesMes.length}</b><small>{fmtUSD(canjesMes.reduce((a, s) => a + s.trade_in_usd, 0))} tomados</small></div>}
        {withAcc && <div className={`stat${lowAcc.length ? " warn" : ""}`}><span>Accesorios a reponer</span><b>{lowAcc.length}</b></div>}
      </div>
      <div className="grid-2">
        <div className="card">
          <h2 className="card-title">Ventas últimos 7 días (USD)</h2>
          <div className="bars" data-testid="bars">
            {days.map((d) => (
              <div key={d.day}>
                <span>{d.value || ""}</span>
                <i style={{ height: Math.max(4, (d.value / max) * 84) }} />
                <span>{d.label}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="card">
          <h2 className="card-title">Para atender</h2>
          <div className="todo" data-testid="todo">
            {lowAcc.slice(0, 4).map((a) => (
              <div key={a.id}><span>{a.name}</span><Badge tone={a.stock === 0 ? "red" : "amber"}>{a.stock === 0 ? "Sin stock" : `${a.stock} u.`}</Badge></div>
            ))}
            {oldStock.slice(0, 3).map((d) => (
              <div key={d.id}><span>{deviceShort(d)} ({d.condition})</span><Badge tone="amber">{d.days} días en stock</Badge></div>
            ))}
            {marginAlerts > 0 && <div data-testid="todo-margin"><span>Precios o ventas por debajo del margen</span><Badge tone="red">{marginAlerts}</Badge></div>}
            {lowAcc.length === 0 && oldStock.length === 0 && marginAlerts === 0 && <div className="muted">Todo en orden.</div>}
            {canSeeAlerts && <Link href="/alertas" className="link" data-testid="todo-alertas">Ver todas las alertas</Link>}
          </div>
        </div>
      </div>
      <div className="card" style={{ marginTop: 16 }}>
        <h2 className="card-title">Últimas operaciones</h2>
        {recent.length === 0 ? (
          <div className="empty">Todavía no hay ventas.</div>
        ) : (
          <div className="table-wrap">
            <table className="table" data-testid="recent-table">
              <thead><tr><th>N.º</th><th>Cliente</th><th>Detalle</th><th>Canje</th><th className="r">Total</th><th>Estado</th></tr></thead>
              <tbody>
                {recent.map((s) => (
                  <tr key={s.id}>
                    <td><Link href={`/ventas/${s.id}`} style={{ color: "var(--accent)", fontWeight: 600 }}>{s.number}</Link></td>
                    <td>{s.client_name}</td>
                    <td>{s.lines.map((l) => l.description).slice(0, 2).join(", ")}{s.lines.length > 2 ? "…" : ""}</td>
                    <td>{s.trade_in_usd > 0 ? <Badge tone="green">Canje</Badge> : ""}</td>
                    <td className="r">{fmtUSD(s.total_usd)}</td>
                    <td><Badge tone={s.status === "Cerrada" ? "green" : "red"}>{s.status}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
