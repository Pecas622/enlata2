import { notFound } from "next/navigation";
import { PrintButton } from "@/components/PrintButton";
import { deviceShort } from "@/lib/catalog";
import { fmtDateTime } from "@/lib/dates";
import { requireSection } from "@/lib/guard";
import { fmtCur, fmtUSD } from "@/lib/money";
import { loadStoreConfig } from "@/lib/store";
import { createClient } from "@/lib/supabase/server";
import { loadSale } from "@/app/(app)/ventas/receipt-data";

export default async function ComprobantePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireSection("ventas");
  const supabase = await createClient();
  const [cfg, sale] = await Promise.all([loadStoreConfig(supabase), loadSale(supabase, id)]);
  if (!sale) notFound();
  return (
    <>
      <h1>{cfg.name}</h1>
      <div className="s">CUIT {cfg.cuit}<br />{cfg.address}</div>
      <hr />
      <div className="b" data-testid="comprobante-number">Comprobante {sale.number}{sale.status === "Anulada" ? " (ANULADO)" : ""}</div>
      <div className="s">{fmtDateTime(sale.at)} · Cliente: {sale.client_name}<br />Vendedor: {sale.seller?.name ?? "-"}</div>
      <hr />
      <table>
        <tbody>
          {sale.lines.map((l, i) => (
            <tr key={i}><td>{l.qty} × {l.description}</td><td className="r">{fmtCur(l.unit_price * l.qty, l.currency)}</td></tr>
          ))}
        </tbody>
      </table>
      <hr />
      <table>
        <tbody>
          <tr><td>Subtotal</td><td className="r">{fmtUSD(sale.subtotal_usd)}</td></tr>
          {sale.discount_usd > 0 && <tr><td>Descuento {sale.discount_pct}%</td><td className="r">-{fmtUSD(sale.discount_usd)}</td></tr>}
          {sale.trade_in_usd > 0 && (
            <tr>
              <td>Plan canje{sale.tradeIn ? `: ${deviceShort(sale.tradeIn)} (IMEI ${sale.tradeIn.imei})` : ""}</td>
              <td className="r">-{fmtUSD(sale.trade_in_usd)}</td>
            </tr>
          )}
          <tr><td className="b">A pagar</td><td className="r b">{fmtUSD(sale.total_usd - sale.trade_in_usd)}</td></tr>
        </tbody>
      </table>
      <hr />
      <div className="s">{sale.payments.map((p, i) => <div key={i}>{p.method}: {fmtCur(p.amount, p.currency)}</div>)}</div>
      <hr />
      <div className="s">
        Garantía: equipos nuevos {cfg.warrantyNewDays} días, usados {cfg.warrantyUsedDays} días desde la fecha de compra. No cubre golpes ni humedad.
      </div>
      <div className="s" style={{ marginTop: 14 }}>Comprobante sin validez fiscal.</div>
      <PrintButton />
    </>
  );
}
