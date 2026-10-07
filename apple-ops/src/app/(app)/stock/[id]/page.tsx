import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge, statusTone } from "@/components/ui";
import { deviceTitle } from "@/lib/catalog";
import { daysSince, fmtDate, fmtDateTime } from "@/lib/dates";
import { DEVICE_COLUMNS, withCost } from "@/lib/devices";
import { requireSection } from "@/lib/guard";
import { fmtUSD } from "@/lib/money";
import { createClient } from "@/lib/supabase/server";
import { EditForm } from "./EditForm";

export default async function DevicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { perms } = await requireSection("stock");
  const supabase = await createClient();
  const select = perms.seeCost ? `${DEVICE_COLUMNS}, device_costs(cost_usd)` : DEVICE_COLUMNS;
  const { data } = await supabase.from("devices").select(select).eq("id", id).maybeSingle();
  if (!data) notFound();
  const [d] = withCost([data as never]);
  const { data: events } = await supabase
    .from("device_events")
    .select("id, action, at, profiles(name)")
    .eq("device_id", id)
    .order("at", { ascending: false });
  const sold = d.status === "Vendido";
  const margin = d.cost_usd != null ? d.price_usd - d.cost_usd : null;

  return (
    <>
      <Link href="/stock" className="back">← Stock de equipos</Link>
      <div className="card" style={{ maxWidth: 640 }}>
        <h1 className="page-title" style={{ fontSize: 22 }} data-testid="page-title">{deviceTitle(d)}</h1>
        <div className="row" style={{ margin: "8px 0 14px" }}>
          <Badge tone={statusTone(d.status)}>{d.status}</Badge>
          <Badge>{d.condition}</Badge>
          <Badge tone="gray">{d.origin}</Badge>
        </div>
        <div className="facts">
          {d.imei && <div><span>IMEI / serie: </span>{d.imei}</div>}
          {d.battery != null && d.condition !== "Nuevo sellado" && <div><span>Batería: </span>{d.battery}%</div>}
          <div><span>Ingreso: </span>{fmtDate(d.entry_date)} ({daysSince(d.entry_date)} días)</div>
          <div><span>Garantía: </span>{d.warranty_days} días</div>
          <div><span>Precio: </span><b data-testid="dev-price-view">{fmtUSD(d.price_usd)}</b></div>
          {perms.seeCost && d.cost_usd != null && <div><span>Costo: </span>{fmtUSD(d.cost_usd)}</div>}
          {perms.seeCost && margin != null && (
            <div><span>Margen: </span>{fmtUSD(margin)} ({d.price_usd ? Math.round((margin / d.price_usd) * 100) : 0}%)</div>
          )}
        </div>
        {d.notes && <p className="muted">{d.notes}</p>}
        {perms.editStock && !sold && <EditForm id={d.id} price={d.price_usd} status={d.status} notes={d.notes} />}
        <h2 className="card-title" style={{ fontSize: 13 }}>Historial</h2>
        <div className="history" data-testid="dev-history">
          {(events ?? []).map((e) => (
            <div key={e.id}>
              {fmtDateTime(e.at)} · {e.action} <span style={{ opacity: 0.7 }}>({(e.profiles as unknown as { name: string } | null)?.name ?? "-"})</span>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
