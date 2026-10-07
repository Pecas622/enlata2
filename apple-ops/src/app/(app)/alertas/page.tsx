import Link from "next/link";
import type { ReactNode } from "react";
import { Badge, PageHeader } from "@/components/ui";
import { isLow } from "@/lib/accessories";
import { lowMarginDevices, lowMarginSales, staleDevices, type AlertDevice } from "@/lib/alerts";
import { deviceShort } from "@/lib/catalog";
import { fmtDate, localDay } from "@/lib/dates";
import { requireSection } from "@/lib/guard";
import { fmtUSD } from "@/lib/money";
import { loadReportSales } from "@/lib/report-data";
import { addDays } from "@/lib/reports";
import { createClient } from "@/lib/supabase/server";

type Row = Omit<AlertDevice, "cost_usd" | "price_usd"> & { price_usd: number; device_costs: { cost_usd: number } | null };
const pct = (m: number) => `${(m * 100).toFixed(1).replace(".", ",")}%`;

export default async function AlertasPage() {
  const { user } = await requireSection("alertas");
  const supabase = await createClient();
  const [{ data: store }, { data: devs }, { data: accs }, sales] = await Promise.all([
    supabase.from("stores").select("stale_days, target_margin").eq("id", user.storeId).single(),
    supabase.from("devices").select("id, model, capacity, condition, entry_date, price_usd, device_costs(cost_usd)").eq("status", "Disponible"),
    supabase.from("accessories").select("id, name, stock, min_stock").order("stock"),
    loadReportSales(supabase, addDays(localDay(), -29)),
  ]);
  const staleDays = store?.stale_days ?? 30;
  const target = Number(store?.target_margin ?? 0.12);
  const stock: AlertDevice[] = ((devs ?? []) as unknown as Row[]).map((d) => ({
    ...d, price_usd: Number(d.price_usd), cost_usd: d.device_costs ? Number(d.device_costs.cost_usd) : null,
  }));
  const stale = staleDevices(stock, staleDays);
  const cheap = lowMarginDevices(stock, target);
  const lowAcc = (accs ?? []).filter(isLow);
  const badSales = lowMarginSales(sales, target);

  const section = (title: string, hint: string, count: number, testid: string, body: ReactNode) => (
    <div className="card" data-testid={testid}>
      <h2 className="card-title" style={{ marginBottom: 4 }}>{title} <Badge tone={count ? "amber" : "green"}>{count || "Al día"}</Badge></h2>
      <p className="muted" style={{ marginTop: 0 }}>{hint}</p>
      {count ? <div className="table-wrap">{body}</div> : null}
    </div>
  );

  return (
    <>
      <PageHeader title="Alertas" subtitle={`Margen objetivo ${pct(target)} · equipo parado a los ${staleDays} días`} action={<Link href="/config" className="btn btn-secondary">Cambiar</Link>} />
      <div className="stack">
        {section("Equipos parados", `Disponibles hace ${staleDays} días o más. Conviene revisar el precio o destacarlos en el catálogo.`, stale.length, "alert-stale",
          <table className="table"><thead><tr><th>Equipo</th><th>Estado</th><th>Ingresó</th><th className="r">Días</th><th className="r">Precio</th></tr></thead>
            <tbody>{stale.map((d) => (
              <tr key={d.id}><td><Link href={`/stock/${d.id}`} style={{ color: "var(--accent)" }}>{deviceShort(d)}</Link></td><td>{d.condition}</td><td>{fmtDate(d.entry_date)}</td><td className="r">{d.days}</td><td className="r">{fmtUSD(d.price_usd)}</td></tr>
            ))}</tbody></table>)}
        {section("Precio por debajo del margen", "Equipos en stock cuyo precio deja menos ganancia que el margen objetivo.", cheap.length, "alert-price",
          <table className="table"><thead><tr><th>Equipo</th><th className="r">Costo</th><th className="r">Precio</th><th className="r">Margen</th><th className="r">Precio sugerido</th></tr></thead>
            <tbody>{cheap.map((d) => (
              <tr key={d.id}><td><Link href={`/stock/${d.id}`} style={{ color: "var(--accent)" }}>{deviceShort(d)}</Link></td><td className="r">{fmtUSD(d.cost_usd!)}</td><td className="r">{fmtUSD(d.price_usd)}</td>
                <td className="r"><Badge tone={d.margin < 0 ? "red" : "amber"}>{pct(d.margin)}</Badge></td><td className="r">{fmtUSD(Math.ceil(d.cost_usd! / (1 - target) / 5) * 5)}</td></tr>
            ))}</tbody></table>)}
        {section("Accesorios a reponer", "Con stock en el mínimo o agotados.", lowAcc.length, "alert-acc",
          <table className="table"><thead><tr><th>Accesorio</th><th className="r">Stock</th><th className="r">Mínimo</th></tr></thead>
            <tbody>{lowAcc.map((a) => (
              <tr key={a.id}><td>{a.name}</td><td className="r"><Badge tone={a.stock === 0 ? "red" : "amber"}>{a.stock === 0 ? "Sin stock" : `${a.stock} u.`}</Badge></td><td className="r">{a.min_stock}</td></tr>
            ))}</tbody></table>)}
        {section("Ventas con margen bajo", "Últimos 30 días. Sirve para revisar descuentos y precios.", badSales.length, "alert-sales",
          <table className="table"><thead><tr><th>N.º</th><th>Fecha</th><th>Vendedor</th><th>Detalle</th><th className="r">Total</th><th className="r">Margen</th></tr></thead>
            <tbody>{badSales.map((s) => (
              <tr key={s.id}><td><Link href={`/ventas/${s.id}`} style={{ color: "var(--accent)", fontWeight: 600 }}>{s.number}</Link></td><td>{fmtDate(s.at)}</td><td>{s.seller_name}</td>
                <td>{s.lines.map((l) => l.description).slice(0, 2).join(", ")}{s.lines.length > 2 ? "…" : ""}</td><td className="r">{fmtUSD(s.total_usd)}</td>
                <td className="r"><Badge tone={s.margin < 0 ? "red" : "amber"}>{pct(s.margin)}</Badge></td></tr>
            ))}</tbody></table>)}
      </div>
    </>
  );
}
