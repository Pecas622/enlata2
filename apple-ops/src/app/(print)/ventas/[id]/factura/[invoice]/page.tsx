import { notFound } from "next/navigation";
import QRCode from "qrcode";
import { PrintButton } from "@/components/PrintButton";
import { fmtDate } from "@/lib/dates";
import { condicionLabel, fmtNumero, qrUrl } from "@/lib/factura";
import { requireSection } from "@/lib/guard";
import { loadStoreConfig } from "@/lib/store";
import { createClient } from "@/lib/supabase/server";
import { loadSale } from "@/app/(app)/ventas/receipt-data";

const ars = (n: number) => Number(n).toLocaleString("es-AR", { style: "currency", currency: "ARS", minimumFractionDigits: 2 });
const DOC: Record<number, string> = { 80: "CUIT", 96: "DNI", 99: "" };

// Factura o nota de crédito electrónica con CAE y el QR de ARCA.
export default async function FacturaPage({ params }: { params: Promise<{ id: string; invoice: string }> }) {
  const { id, invoice } = await params;
  await requireSection("ventas");
  const supabase = await createClient();
  const [cfg, sale, { data: inv }, { data: fiscal }] = await Promise.all([
    loadStoreConfig(supabase),
    loadSale(supabase, id),
    supabase.from("invoices").select("*").eq("id", invoice).eq("sale_id", id).maybeSingle(),
    supabase.from("fiscal_settings").select("razon_social, condicion_iva, iibb, inicio_actividades").maybeSingle(),
  ]);
  if (!sale || !inv || inv.status !== "Emitida") notFound();
  const tipo = String(inv.cbte_tipo).padStart(3, "0");
  const total = Number(inv.total);
  const qr = await QRCode.toString(qrUrl({
    fecha: inv.fecha, cuit: cfg.cuit, ptoVta: inv.punto_venta, tipoCmp: inv.cbte_tipo, nroCmp: Number(inv.numero), importe: total,
    tipoDocRec: inv.doc_tipo, nroDocRec: inv.doc_nro, cae: inv.cae,
  }), { type: "svg", margin: 0, width: 120 });
  // Las líneas van en pesos; en A se muestran sin IVA, como pide la factura A.
  const factor = (total > 0 ? total : 1) / sale.lines.reduce((a, l) => a + (l.currency === "USD" ? l.unit_price * sale.fx : l.unit_price) * l.qty, 0);
  const sinIva = inv.letra === "A" ? Number(inv.neto) / total : 1;

  return (
    <>
      <div className="b" style={{ fontSize: 22, textAlign: "center" }} data-testid="factura-letra">{inv.letra}</div>
      <div className="s" style={{ textAlign: "center" }}>Cód. {tipo}</div>
      <h1>{fiscal?.razon_social || cfg.name}</h1>
      <div className="s">
        CUIT {cfg.cuit} · {fiscal?.condicion_iva ?? ""}<br />
        {cfg.address}<br />
        {fiscal?.iibb ? <>IIBB {fiscal.iibb}<br /></> : null}
        {fiscal?.inicio_actividades ? <>Inicio de actividades {fmtDate(fiscal.inicio_actividades)}</> : null}
      </div>
      <hr />
      <div className="b" data-testid="factura-numero">{inv.kind} {inv.letra} {fmtNumero(inv.punto_venta, Number(inv.numero))}</div>
      <div className="s">Fecha {fmtDate(inv.fecha)} · Venta {sale.number}</div>
      {inv.ambiente === "homologacion" && <div className="b">HOMOLOGACIÓN: SIN VALIDEZ FISCAL</div>}
      <hr />
      <div className="s">
        {inv.receptor_nombre || "Consumidor final"}<br />
        {condicionLabel(inv.receptor_condicion)}{DOC[inv.doc_tipo] ? ` · ${DOC[inv.doc_tipo]} ${inv.doc_nro}` : ""}
      </div>
      <hr />
      <table>
        <tbody>
          {sale.lines.map((l, i) => {
            const amount = (l.currency === "USD" ? l.unit_price * sale.fx : l.unit_price) * l.qty * factor * sinIva;
            return <tr key={i}><td>{l.qty} × {l.description}</td><td className="r">{ars(amount)}</td></tr>;
          })}
        </tbody>
      </table>
      <hr />
      <table>
        <tbody>
          {inv.letra === "A" && <tr><td>Neto gravado</td><td className="r">{ars(inv.neto)}</td></tr>}
          {inv.letra === "A" && <tr><td>IVA {Number(inv.alicuota_iva).toLocaleString("es-AR")}%</td><td className="r">{ars(inv.iva)}</td></tr>}
          <tr><td className="b">Total</td><td className="r b" data-testid="factura-total">{ars(total)}</td></tr>
        </tbody>
      </table>
      {inv.letra === "B" && <div className="s">IVA contenido ({Number(inv.alicuota_iva).toLocaleString("es-AR")}%): {ars(inv.iva)}</div>}
      {sale.discount_pct > 0 && <div className="s">Incluye descuento del {sale.discount_pct}%.</div>}
      {inv.letra === "B" && <div className="s">Régimen de Transparencia Fiscal al Consumidor (Ley 27.743).</div>}
      <hr />
      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
        <div style={{ width: 120, height: 120 }} dangerouslySetInnerHTML={{ __html: qr }} data-testid="factura-qr" />
        <div className="s">
          <b>CAE</b> <span data-testid="factura-cae">{inv.cae}</span><br />
          Vence {fmtDate(inv.cae_vence)}<br />
          Comprobante autorizado por ARCA
        </div>
      </div>
      <PrintButton />
    </>
  );
}
