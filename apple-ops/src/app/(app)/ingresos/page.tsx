import Link from "next/link";
import { PageHeader } from "@/components/ui";
import { fmtDateTime } from "@/lib/dates";
import { requireSection } from "@/lib/guard";
import { fmtUSD } from "@/lib/money";
import { loadStoreConfig } from "@/lib/store";
import { createClient } from "@/lib/supabase/server";
import { IngresoForm } from "./IngresoForm";

type Purchase = {
  id: string; number: string; at: string; origin: string; person_name: string; cost_usd: number;
  devices: { model: string; capacity: number; color: string } | null;
  profiles: { name: string } | null;
};

export default async function IngresosPage() {
  const { perms } = await requireSection("ingresos");
  const supabase = await createClient();
  const [cfg, { data: shift }, { data: purchases }] = await Promise.all([
    loadStoreConfig(supabase),
    supabase.from("cash_shifts").select("id").eq("status", "Abierta").maybeSingle(),
    supabase.from("purchases").select("id, number, at, origin, person_name, cost_usd, devices(model, capacity, color), profiles(name)").order("at", { ascending: false }).limit(10),
  ]);
  const rows = (purchases ?? []) as unknown as Purchase[];
  return (
    <>
      <PageHeader title="Ingreso de equipos" subtitle="Comprá usados a particulares o cargá mercadería de proveedor, con control de IMEI y pago por caja" />
      <IngresoForm cfg={cfg} shiftOpen={Boolean(shift)} seeCost={perms.seeCost} />
      <div className="card" style={{ marginTop: 16 }}>
        <h2 className="card-title">Ingresos recientes</h2>
        {rows.length === 0 ? (
          <div className="empty">Todavía no registraste ingresos.</div>
        ) : (
          <div className="table-wrap">
            <table className="table" data-testid="ingresos-table">
              <thead><tr><th>N.º</th><th>Fecha</th><th>Equipo</th><th>Origen</th><th>Vendedor</th><th className="r">Valor</th><th>Registró</th><th /></tr></thead>
              <tbody>
                {rows.map((p) => (
                  <tr key={p.id}>
                    <td>{p.number}</td>
                    <td>{fmtDateTime(p.at)}</td>
                    <td>{p.devices ? `${p.devices.model}${p.devices.capacity ? ` ${p.devices.capacity}GB` : ""}` : "-"}</td>
                    <td>{p.origin}</td>
                    <td>{p.person_name || "-"}</td>
                    <td className="r">{fmtUSD(Number(p.cost_usd))}</td>
                    <td>{p.profiles?.name ?? "-"}</td>
                    <td><Link href={`/ingresos/${p.id}/boleto`} target="_blank" style={{ color: "var(--accent)", fontSize: 12 }}>Boleto</Link></td>
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
