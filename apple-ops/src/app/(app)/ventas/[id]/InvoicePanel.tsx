"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { Badge } from "@/components/ui";
import { CONDICIONES_RECEPTOR, fmtNumero, letraFor, receptorError, type CondicionEmisor, type CondicionReceptor } from "@/lib/factura";
import { facturar, reintentarNotaDeCredito } from "../actions";

export type InvoiceView = {
  id: string; kind: "Factura" | "Nota de crédito"; letra: string; punto_venta: number; numero: number | null; status: "Pendiente" | "Emitida" | "Rechazada";
  cae: string; error: string; ambiente: string;
};

const tone = (s: InvoiceView["status"]) => (s === "Emitida" ? "green" : s === "Rechazada" ? "red" : "amber");

// Factura y nota de crédito de la venta: estado, impresión y reintento si ARCA no respondió.
export function InvoicePanel({ saleId, saleStatus, invoices, emisor, canVoid, clientName }: {
  saleId: string; saleStatus: "Cerrada" | "Anulada"; invoices: InvoiceView[]; emisor: CondicionEmisor | null; canVoid: boolean; clientName: string;
}) {
  const [cond, setCond] = useState<CondicionReceptor>(5);
  const [doc, setDoc] = useState("");
  const [name, setName] = useState(clientName === "Consumidor final" ? "" : clientName);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const factura = invoices.find((i) => i.kind === "Factura");
  const nc = invoices.find((i) => i.kind === "Nota de crédito");

  const run = (fn: () => Promise<{ error?: string }>) => {
    setError(null);
    startTransition(async () => {
      const r = await fn();
      if (r.error) setError(r.error);
    });
  };
  const receptor = { condicion: cond, doc, nombre: name };
  const recError = emisor ? receptorError(emisor, receptor) : null;
  const canInvoice = saleStatus === "Cerrada" && emisor && (!factura || factura.status !== "Emitida");
  // Una factura pendiente con número pedido se reintenta igual, para confirmar si salió.
  const retryOnly = factura && factura.status === "Pendiente";

  return (
    <div className="stack" style={{ gap: 8, marginTop: 12 }} data-testid="invoice-panel">
      {[factura, nc].filter(Boolean).map((inv) => (
        <div key={inv!.id} className="row" style={{ alignItems: "center", gap: 8 }} data-testid={inv!.kind === "Factura" ? "invoice-row" : "nc-row"}>
          <Badge tone={tone(inv!.status)}>{inv!.status}</Badge>
          <span>
            <b>{inv!.kind} {inv!.letra}</b> {fmtNumero(inv!.punto_venta, inv!.numero)}
            {inv!.status === "Emitida" && <span className="muted"> · CAE {inv!.cae}</span>}
            {inv!.ambiente === "homologacion" && <span className="muted"> · homologación</span>}
          </span>
          {inv!.status === "Emitida" && (
            <Link href={`/ventas/${saleId}/factura/${inv!.id}`} target="_blank" className="btn btn-secondary" style={{ padding: "6px 12px" }} data-testid={inv!.kind === "Factura" ? "invoice-print" : "nc-print"}>
              Imprimir
            </Link>
          )}
          {inv!.status !== "Emitida" && inv!.error && <span className="error" style={{ flexBasis: "100%" }} data-testid="invoice-error">{inv!.error}</span>}
        </div>
      ))}

      {canInvoice && !retryOnly && (
        <div className="row" style={{ alignItems: "flex-end" }}>
          <label className="field">
            Factura {letraFor(emisor, cond)}
            <select className="input" value={cond} onChange={(e) => setCond(Number(e.target.value) as CondicionReceptor)}>
              {CONDICIONES_RECEPTOR.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
            </select>
          </label>
          <label className="field">{cond === 5 ? "DNI o CUIT" : "CUIT"}<input className="input" value={doc} onChange={(e) => setDoc(e.target.value)} placeholder={cond === 5 ? "Opcional" : ""} /></label>
          {cond !== 5 && <label className="field">Razón social<input className="input" value={name} onChange={(e) => setName(e.target.value)} /></label>}
          <button className="btn btn-primary" disabled={pending || !!recError} onClick={() => run(() => facturar(saleId, receptor))} data-testid="invoice-create">
            {pending ? "Facturando…" : factura ? "Volver a facturar" : "Facturar"}
          </button>
        </div>
      )}
      {canInvoice && retryOnly && (
        <div className="row">
          <button className="btn btn-primary" disabled={pending} onClick={() => run(() => facturar(saleId, null))} data-testid="invoice-retry">
            {pending ? "Consultando a ARCA…" : "Reintentar factura"}
          </button>
        </div>
      )}
      {saleStatus === "Anulada" && factura?.status === "Emitida" && nc?.status !== "Emitida" && canVoid && (
        <div className="row">
          <button className="btn btn-primary" disabled={pending} onClick={() => run(() => reintentarNotaDeCredito(saleId))} data-testid="nc-retry">
            {pending ? "Emitiendo…" : "Emitir nota de crédito"}
          </button>
        </div>
      )}
      {recError && canInvoice && !retryOnly && (doc || cond !== 5) && <div className="muted" style={{ fontSize: 12 }}>{recError}</div>}
      {error && <div className="error" role="alert" data-testid="invoice-action-error">{error}</div>}
    </div>
  );
}
