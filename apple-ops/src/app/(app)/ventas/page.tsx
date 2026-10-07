import Link from "next/link";
import { Badge } from "@/components/ui";
import { PageHeader } from "@/components/ui";
import { Tabs } from "@/components/Tabs";
import { fmtDateTime } from "@/lib/dates";
import { requireSection } from "@/lib/guard";
import { fmtUSD } from "@/lib/money";
import { createClient } from "@/lib/supabase/server";
import { loadPosData } from "./pos-data";
import { SaleBuilder } from "./SaleBuilder";
import { recentSales } from "./sales-data";

const TABS = [{ id: "nueva", label: "Nueva venta" }, { id: "historial", label: "Historial" }];

export default async function VentasPage({ searchParams }: { searchParams: Promise<{ tab?: string; q?: string }> }) {
  const { tab = "nueva", q = "" } = await searchParams;
  const { user, perms } = await requireSection("ventas");
  return (
    <>
      <PageHeader title="Ventas" subtitle="Equipos, accesorios y servicios en una sola operación" action={<Tabs base="/ventas" tabs={TABS} active={tab} />} />
      {tab === "historial" ? <Historial q={q} /> : <Nueva userId={user.id} perms={perms} canTradeIn={user.role !== "Cajero"} />}
    </>
  );
}

async function Nueva({ userId, perms, canTradeIn }: { userId: string; perms: Parameters<typeof SaleBuilder>[0]["perms"]; canTradeIn: boolean }) {
  const pos = await loadPosData();
  return <SaleBuilder {...pos} perms={perms} userId={userId} canTradeIn={canTradeIn} />;
}

async function Historial({ q }: { q: string }) {
  const rows = await recentSales(await createClient(), q);
  return (
    <div className="card">
      <form className="toolbar">
        <input type="hidden" name="tab" value="historial" />
        <input className="input" name="q" defaultValue={q} style={{ maxWidth: 360 }} placeholder="Buscar por número o cliente" data-testid="sales-search" />
      </form>
      {rows.length === 0 ? (
        <div className="empty">No hay ventas.</div>
      ) : (
        <div className="table-wrap">
          <table className="table" data-testid="sales-table">
            <thead><tr><th>N.º</th><th>Fecha</th><th>Cliente</th><th>Vendedor</th><th>Canje</th><th className="r">Total</th><th>Estado</th></tr></thead>
            <tbody>
              {rows.map((s) => (
                <tr key={s.id}>
                  <td><Link href={`/ventas/${s.id}`} style={{ color: "var(--accent)", fontWeight: 600 }}>{s.number}</Link></td>
                  <td>{fmtDateTime(s.at)}</td>
                  <td>{s.client_name}</td>
                  <td>{s.seller?.name ?? "-"}</td>
                  <td>{s.trade_in_usd > 0 ? <Badge tone="green">{fmtUSD(s.trade_in_usd)}</Badge> : ""}</td>
                  <td className="r">{fmtUSD(s.total_usd)}</td>
                  <td><Badge tone={s.status === "Cerrada" ? "green" : "red"}>{s.status}</Badge></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
