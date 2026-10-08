// Reglas de la factura electrónica: letra, tipo de comprobante, receptor e importes en pesos.
// Funciones puras; el servidor las usa antes de pedirle el CAE a ARCA (src/lib/arca-server.ts).
import type { Currency } from "./catalog";

export type CondicionEmisor = "Responsable Inscripto" | "Monotributo";
export type Letra = "A" | "B" | "C";
export type InvoiceKind = "Factura" | "Nota de crédito";

// Condición frente al IVA del receptor, con los códigos de ARCA (CondicionIVAReceptorId).
export const CONDICIONES_RECEPTOR = [
  { id: 5, label: "Consumidor final" },
  { id: 1, label: "Responsable inscripto" },
  { id: 6, label: "Monotributista" },
  { id: 4, label: "Exento" },
] as const;
export type CondicionReceptor = (typeof CONDICIONES_RECEPTOR)[number]["id"];

export const condicionLabel = (id: number) => CONDICIONES_RECEPTOR.find((c) => c.id === id)?.label ?? "Consumidor final";

// Monotributo factura C. Responsable inscripto: A a otro inscripto o a un monotributista, B al resto.
export function letraFor(emisor: CondicionEmisor, receptor: CondicionReceptor): Letra {
  if (emisor === "Monotributo") return "C";
  return receptor === 1 || receptor === 6 ? "A" : "B";
}

const TIPOS: Record<Letra, Record<InvoiceKind, number>> = {
  A: { Factura: 1, "Nota de crédito": 3 },
  B: { Factura: 6, "Nota de crédito": 8 },
  C: { Factura: 11, "Nota de crédito": 13 },
};
export const cbteTipo = (letra: Letra, kind: InvoiceKind) => TIPOS[letra][kind];

// Códigos de alícuota de ARCA.
export const ALICUOTA_ID: Record<number, number> = { 10.5: 4, 21: 5, 27: 6 };

// Dígito verificador del CUIT.
export function cuitValido(raw: string) {
  const c = raw.replace(/\D/g, "");
  if (!/^\d{11}$/.test(c)) return false;
  const w = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  const sum = w.reduce((a, k, i) => a + k * Number(c[i]), 0);
  let dv = 11 - (sum % 11);
  if (dv === 11) dv = 0;
  if (dv === 10) dv = 9;
  return dv === Number(c[10]);
}

export type Receptor = { condicion: CondicionReceptor; doc: string; nombre: string };
export type DocReceptor = { docTipo: number; docNro: string };

// CUIT (80) cuando hay 11 dígitos, DNI (96) cuando hay 7 u 8 y si no, consumidor final sin identificar (99).
export function docReceptor(r: Pick<Receptor, "doc">): DocReceptor {
  const d = r.doc.replace(/\D/g, "");
  if (d.length === 11) return { docTipo: 80, docNro: d };
  if (d.length === 7 || d.length === 8) return { docTipo: 96, docNro: d };
  return { docTipo: 99, docNro: "0" };
}

// Valida al receptor antes de facturar. Devuelve el error para mostrar o null.
export function receptorError(emisor: CondicionEmisor, r: Receptor): string | null {
  const d = r.doc.replace(/\D/g, "");
  if (r.condicion !== 5 && !cuitValido(d)) return "Para facturar a un inscripto, monotributista o exento cargá un CUIT válido.";
  if (d && d.length === 11 && !cuitValido(d)) return "El CUIT no es válido.";
  if (d && d.length !== 11 && d.length !== 7 && d.length !== 8) return "El documento tiene que ser un DNI (7 u 8 dígitos) o un CUIT (11).";
  if (letraFor(emisor, r.condicion) === "A" && !r.nombre.trim()) return "La factura A lleva la razón social del cliente.";
  return null;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export type SaleForInvoice = {
  fx: number;
  discountPct: number;
  lines: { qty: number; unitPrice: number; currency: Currency }[];
};

// Total de la venta en pesos: equipos en dólares a la cotización de la venta y accesorios en pesos,
// con el descuento. El canje no resta: es una compra aparte que queda en su boleto.
export function saleTotalARS(s: SaleForInvoice) {
  const sub = s.lines.reduce((a, l) => a + (l.currency === "USD" ? l.unitPrice * s.fx : l.unitPrice) * l.qty, 0);
  return round2(sub * (1 - (Number(s.discountPct) || 0) / 100));
}

// Neto e IVA a partir del total con IVA incluido. La factura C no discrimina IVA.
export function invoiceAmounts(total: number, letra: Letra, alicuota: number) {
  const t = round2(total);
  if (letra === "C") return { neto: t, iva: 0, total: t };
  const neto = round2(t / (1 + alicuota / 100));
  return { neto, iva: round2(t - neto), total: t };
}

export const fmtNumero = (pv: number, n: number | null) => `${String(pv).padStart(5, "0")}-${n == null ? "--------" : String(n).padStart(8, "0")}`;

// Código QR que pide ARCA en el comprobante impreso (RG 4291).
export function qrUrl(p: {
  fecha: string; cuit: string; ptoVta: number; tipoCmp: number; nroCmp: number; importe: number;
  tipoDocRec: number; nroDocRec: string; cae: string;
}) {
  const data = {
    ver: 1, fecha: p.fecha, cuit: Number(p.cuit), ptoVta: p.ptoVta, tipoCmp: p.tipoCmp, nroCmp: p.nroCmp,
    importe: round2(p.importe), moneda: "PES", ctz: 1, tipoDocRec: p.tipoDocRec, nroDocRec: Number(p.nroDocRec) || 0,
    tipoCodAut: "E", codAut: Number(p.cae),
  };
  return `https://www.afip.gob.ar/fe/qr/?p=${Buffer.from(JSON.stringify(data)).toString("base64")}`;
}
