import Link from "next/link";
import { PageHeader } from "@/components/ui";
import { Tabs } from "@/components/Tabs";
import { facturacionDisponible } from "@/lib/arca-server";
import { deviceShort } from "@/lib/catalog";
import { fmtDate, localDay } from "@/lib/dates";
import { requireSection } from "@/lib/guard";
import { hasModule } from "@/lib/modules";
import { fmtUSD } from "@/lib/money";
import { createClient } from "@/lib/supabase/server";
import { loadPosData } from "../ventas/pos-data";
import { SaleBuilder } from "../ventas/SaleBuilder";
import { QuotePanel } from "./QuotePanel";

const TABS = [{ id: "cotizar", label: "Cotizar" }, { id: "nuevo", label: "Nuevo canje" }, { id: "historial", label: "Historial" }];

type TradeInSale = {
  id: string; number: string; at: string; client_name: string; total_usd: number; trade_in_usd: number;
  trade_ins: { devices: { model: string; capacity: number; condition: string; imei: string } } | null;
};

export default async function CanjePage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab = "cotizar" } = await searchParams;
  const { user, perms } = await requireSection("canje");
  const withImei = hasModule(user.modules, "imei");
  const supabase = await createClient();
  const [pos, invoicing, { data }] = await Promise.all([
    loadPosData(),
    tab === "nuevo" && hasModule(user.modules, "facturacion") ? facturacionDisponible(user.storeId) : null,
    supabase
      .from("sales")
      .select("id, number, at, client_name, total_usd, trade_in_usd, trade_ins(devices(model, capacity, condition, imei))")
      .eq("status", "Cerrada")
      .gt("trade_in_usd", 0)
      .order("at", { ascending: false }),
  ]);
  const sales = ((data ?? []) as unknown as TradeInSale[]).map((s) => ({ ...s, total_usd: Number(s.total_usd), trade_in_usd: Number(s.trade_in_usd) }));
  const monthStart = localDay().slice(0, 8) + "01";
  const mes = sales.filter((s) => localDay(s.at) >= monthStart);
  const avgDiff = mes.length ? mes.reduce((a, s) => a + (s.total_usd - s.trade_in_usd), 0) / mes.length : 0;

  return (
    <>
      <PageHeader title="Plan Canje" subtitle="Tasá el equipo del cliente, mostrá la diferencia y cerrá la venta" action={<Tabs base="/canje" tabs={TABS} active={tab} />} />
      <div className="stats">
        <div className="stat good"><span>Canjes del mes</span><b data-testid="stat-canjes">{mes.length}</b></div>
        <div className="stat"><span>Valor tomado en el mes</span><b>{fmtUSD(mes.reduce((a, s) => a + s.trade_in_usd, 0))}</b></div>
        <div className="stat"><span>Diferencia promedio cobrada</span><b>{fmtUSD(avgDiff)}</b></div>
      </div>
      {tab === "cotizar" && <QuotePanel cfg={pos.cfg} devices={pos.devices} overTradeIn={perms.overTradeIn} requireImei={withImei} />}
      {tab === "nuevo" && <SaleBuilder {...pos} perms={perms} userId={user.id} canTradeIn startWithTradeIn requireImei={withImei} invoicing={invoicing} />}
      {tab === "historial" && (
        <div className="card">
          {sales.length === 0 ? (
            <div className="empty">Todavía no hay canjes.</div>
          ) : (
            <div className="table-wrap">
              <table className="table" data-testid="canjes-table">
                <thead><tr><th>Venta</th><th>Fecha</th><th>Cliente</th><th>Equipo recibido</th><th>IMEI</th><th className="r">Valor tomado</th><th className="r">Diferencia pagada</th></tr></thead>
                <tbody>
                  {sales.map((s) => {
                    const d = s.trade_ins?.devices;
                    return (
                      <tr key={s.id}>
                        <td><Link href={`/ventas/${s.id}`} style={{ color: "var(--accent)", fontWeight: 600 }}>{s.number}</Link></td>
                        <td>{fmtDate(s.at)}</td>
                        <td>{s.client_name}</td>
                        <td>{d ? `${deviceShort(d)} · ${d.condition}` : "-"}</td>
                        <td>{d?.imei || "-"}</td>
                        <td className="r">{fmtUSD(s.trade_in_usd)}</td>
                        <td className="r">{fmtUSD(s.total_usd - s.trade_in_usd)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </>
  );
}
