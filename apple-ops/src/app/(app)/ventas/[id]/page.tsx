import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge, Notice } from "@/components/ui";
import { fiscalListo, loadFiscal } from "@/lib/arca-server";
import { deviceShort } from "@/lib/catalog";
import { fmtDateTime } from "@/lib/dates";
import { requireSection } from "@/lib/guard";
import { fmtCur, fmtUSD } from "@/lib/money";
import { loadStoreConfig } from "@/lib/store";
import { createClient } from "@/lib/supabase/server";
import { hasModule } from "@/lib/modules";
import { waLink } from "@/lib/whatsapp";
import { loadSale } from "../receipt-data";
import { InvoicePanel, type InvoiceView } from "./InvoicePanel";
import { VoidForm } from "./VoidForm";

export default async function SalePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ nueva?: string }> }) {
  const [{ id }, { nueva }] = await Promise.all([params, searchParams]);
  const { user, perms } = await requireSection("ventas");
  const supabase = await createClient();
  const facturacion = hasModule(user.modules, "facturacion");
  const [cfg, sale, invoices, fiscal] = await Promise.all([
    loadStoreConfig(supabase),
    loadSale(supabase, id),
    facturacion ? supabase.from("invoices").select("id, kind, letra, punto_venta, numero, status, cae, error, ambiente").eq("sale_id", id).then((r) => (r.data ?? []) as InvoiceView[]) : [],
    facturacion ? loadFiscal(user.storeId) : null,
  ]);
  if (!sale) notFound();
  const emisor = fiscal && fiscalListo(fiscal.fiscal, fiscal.creds) ? fiscal.fiscal!.condicionIva : null;
  const facturada = invoices.some((i) => i.kind === "Factura" && i.status === "Emitida");
  const toPay = sale.total_usd - sale.trade_in_usd;
  const message = `Hola ${sale.client_name}! Gracias por tu compra en ${cfg.name}. Comprobante ${sale.number} por ${fmtUSD(toPay)}.`;

  return (
    <>
      <Link href="/ventas?tab=historial" className="back">← Historial de ventas</Link>
      {nueva && sale.status === "Cerrada" && <div style={{ maxWidth: 560, marginBottom: 12 }}><Notice tone="blue">Venta registrada.</Notice></div>}
      <div className="card" style={{ maxWidth: 560 }} data-testid="receipt">
        <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
          <h1 className="page-title" style={{ fontSize: 22, margin: 0 }} data-testid="page-title">Venta {sale.number}</h1>
          <Badge tone={sale.status === "Cerrada" ? "green" : "red"}>{sale.status}</Badge>
        </div>
        <p className="muted" style={{ margin: "6px 0 14px" }}>
          {fmtDateTime(sale.at)} · {sale.client_name} · vendedor {sale.seller?.name ?? "-"}
          {sale.cashier && sale.cashier.name !== sale.seller?.name ? ` · cobró ${sale.cashier.name}` : ""}
        </p>
        <div className="lines" style={{ background: "transparent", border: 0, padding: 0 }}>
          {sale.lines.map((l, i) => (
            <div key={i}><span>{l.qty} × {l.description}</span><span>{fmtCur(l.unit_price * l.qty, l.currency)}</span></div>
          ))}
          {sale.discount_usd > 0 && <div className="neg"><span>Descuento {sale.discount_pct}%</span><span>−{fmtUSD(sale.discount_usd)}</span></div>}
          {sale.trade_in_usd > 0 && (
            <div className="ok"><span>Plan canje{sale.tradeIn ? `: ${deviceShort(sale.tradeIn)}` : ""}</span><span>−{fmtUSD(sale.trade_in_usd)}</span></div>
          )}
          <div className="total" style={{ fontSize: 16 }}>
            <span>{sale.trade_in_usd > 0 ? "Diferencia pagada" : "Total"}</span><b data-testid="receipt-total">{fmtUSD(toPay)}</b>
          </div>
        </div>
        <p className="muted" style={{ fontSize: 12 }}>{sale.payments.map((p) => `${p.method}: ${fmtCur(p.amount, p.currency)}`).join(" · ") || "Sin pagos"}</p>
        {sale.notes && <p className="muted">Notas: {sale.notes}</p>}
        {sale.tradeIn && sale.status === "Cerrada" && <Notice tone="blue">El {deviceShort(sale.tradeIn)} recibido entró al stock como disponible.</Notice>}
        {sale.status === "Anulada" && (
          <Notice tone="red">Anulada el {fmtDateTime(sale.voided_at)} por {sale.voider?.name ?? "-"}: {sale.void_reason}</Notice>
        )}
        {!facturada && <p className="muted" style={{ fontSize: 12 }}>Comprobante sin validez fiscal.</p>}
        <div className="row" style={{ marginTop: 8 }}>
          <Link href={`/ventas/${sale.id}/comprobante`} target="_blank" className="btn btn-primary" data-testid="receipt-print">Imprimir</Link>
          {sale.client_phone && <a className="btn btn-secondary" href={waLink(sale.client_phone, message)} target="_blank" rel="noreferrer">Enviar por WhatsApp</a>}
          {nueva && <Link href="/ventas" className="btn btn-secondary" data-testid="new-sale">Nueva venta</Link>}
        </div>
        {facturacion && (invoices.length > 0 || emisor) && (
          <InvoicePanel saleId={sale.id} saleStatus={sale.status} invoices={invoices} emisor={emisor} canVoid={perms.voidSale} clientName={sale.client_name} />
        )}
        {perms.voidSale && sale.status === "Cerrada" && <VoidForm saleId={sale.id} number={sale.number} hasTradeIn={sale.trade_in_usd > 0} />}
      </div>
    </>
  );
}
