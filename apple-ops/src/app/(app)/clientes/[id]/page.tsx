import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui";
import { deviceShort } from "@/lib/catalog";
import { fmtDate } from "@/lib/dates";
import { requireSection } from "@/lib/guard";
import { fmtUSD } from "@/lib/money";
import { createClient } from "@/lib/supabase/server";
import { waLink } from "@/lib/whatsapp";
import { ClientForm } from "../ClientForm";

type Sale = {
  id: string; number: string; at: string; status: string; total_usd: number; trade_in_usd: number;
  sale_lines: { description: string }[];
  trade_ins: { devices: { model: string; capacity: number } } | null;
};

export default async function ClientePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireSection("clientes");
  const supabase = await createClient();
  const [{ data: c }, { data: salesRaw }] = await Promise.all([
    supabase.from("clientes_resumen").select("*").eq("id", id).maybeSingle(),
    supabase.from("sales").select("id, number, at, status, total_usd, trade_in_usd, sale_lines(description), trade_ins(devices(model, capacity))").eq("client_id", id).order("at", { ascending: false }),
  ]);
  if (!c) notFound();
  const sales = (salesRaw ?? []) as unknown as Sale[];
  const firstName = c.name.split(" ")[0];
  return (
    <>
      <Link href="/clientes" className="back">← Clientes</Link>
      <div className="card" style={{ maxWidth: 760 }}>
        <h1 className="page-title" style={{ fontSize: 22 }} data-testid="page-title">{c.name}</h1>
        <p className="muted" style={{ margin: "6px 0 14px" }}>
          {[c.phone, c.dni && `DNI ${c.dni}`, c.email, c.notes].filter(Boolean).join(" · ") || "Sin datos de contacto"}
        </p>
        <div className="stats" style={{ marginBottom: 14 }}>
          <div className="stat"><span>Compras</span><b data-testid="cli-compras">{c.compras}</b></div>
          <div className="stat"><span>Total comprado</span><b>{fmtUSD(Number(c.total_usd))}</b></div>
          <div className="stat"><span>Cliente desde</span><b style={{ fontSize: 16 }}>{fmtDate(c.created_at)}</b></div>
        </div>
        {c.phone && (
          <div style={{ marginBottom: 14 }}>
            <a className="btn btn-secondary" href={waLink(c.phone, `Hola ${firstName}! `)} target="_blank" rel="noreferrer">WhatsApp</a>
          </div>
        )}
        {(
          <>
            <h2 className="card-title" style={{ fontSize: 13 }}>Compras</h2>
            {sales.length === 0 ? (
              <div className="empty">Sin compras todavía.</div>
            ) : (
              <div className="table-wrap" style={{ marginBottom: 16 }}>
                <table className="table" data-testid="cli-sales">
                  <thead><tr><th>Venta</th><th>Fecha</th><th>Detalle</th><th>Canje</th><th className="r">Total</th><th /></tr></thead>
                  <tbody>
                    {sales.map((s) => (
                      <tr key={s.id}>
                        <td style={{ whiteSpace: "nowrap" }}><Link href={`/ventas/${s.id}`} style={{ color: "var(--accent)", fontWeight: 600 }}>{s.number}</Link></td>
                        <td style={{ whiteSpace: "nowrap" }}>{fmtDate(s.at)}</td>
                        <td>{s.sale_lines.map((l) => l.description).join(", ")}</td>
                        <td>{s.trade_ins?.devices ? deviceShort(s.trade_ins.devices) : Number(s.trade_in_usd) > 0 ? fmtUSD(Number(s.trade_in_usd)) : ""}</td>
                        <td className="r">{fmtUSD(Number(s.total_usd))}</td>
                        <td>{s.status === "Anulada" && <Badge tone="red">Anulada</Badge>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
        <h2 className="card-title" style={{ fontSize: 13 }}>Editar</h2>
        <ClientForm client={{ id: c.id, name: c.name, phone: c.phone, dni: c.dni, email: c.email, notes: c.notes }} />
      </div>
    </>
  );
}
