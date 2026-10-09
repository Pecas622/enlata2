// Facturación electrónica del lado del servidor: pide el acceso a ARCA con el certificado del local,
// pide el CAE de cada factura o nota de crédito y guarda el resultado con la clave de servicio.
import { descifrar, firmarTRA } from "./arca-cert";
import {
  ARCA_URLS, ArcaError, arcaDate, caeEnvelope, consultarEnvelope, isoDay, loginCmsEnvelope, loginTicketRequest, parseCae,
  parseConsultar, parseLoginCms, parseUltimoAutorizado, soapAction, ultimoAutorizadoEnvelope, type Ambiente, type Auth,
} from "./arca-soap";
import type { Currency } from "./catalog";
import { localDay } from "./dates";
import {
  ALICUOTA_ID, cbteTipo, docReceptor, invoiceAmounts, letraFor, receptorError, saleTotalARS,
  type CondicionEmisor, type InvoiceKind, type Receptor,
} from "./factura";
import { createServiceClient } from "./supabase/server";

export type Fiscal = {
  storeId: string;
  cuit: string;
  razonSocial: string;
  condicionIva: CondicionEmisor;
  puntoVenta: number;
  alicuotaIva: number;
  ambiente: Ambiente;
  automatica: boolean;
  certVence: string | null;
};

type Creds = { key_enc: string; cert_pem: string; token: string; sign: string; token_vence: string | null };

export type InvoiceRow = {
  id: string; sale_id: string; kind: InvoiceKind; letra: "A" | "B" | "C"; cbte_tipo: number; punto_venta: number; numero: number | null;
  fecha: string | null; ambiente: Ambiente; doc_tipo: number; doc_nro: string; receptor_nombre: string; receptor_condicion: number;
  neto: number; iva: number; total: number; alicuota_iva: number; cae: string; status: "Pendiente" | "Emitida" | "Rechazada"; error: string;
  asociada_id: string | null;
};

// En los tests la app le pega a un ARCA de mentira (tests/e2e/arca-mock.mjs).
function urls(ambiente: Ambiente) {
  return {
    wsaa: process.env.ARCA_WSAA_URL || ARCA_URLS[ambiente].wsaa,
    wsfe: process.env.ARCA_WSFE_URL || ARCA_URLS[ambiente].wsfe,
  };
}

async function post(url: string, body: string, action: string) {
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "text/xml; charset=utf-8", SOAPAction: `"${action}"` },
      body,
      signal: AbortSignal.timeout(25_000),
    });
  } catch {
    throw new ArcaError("No se pudo conectar con ARCA. Probá de nuevo en unos minutos.");
  }
  const text = await res.text();
  if (!res.ok && !text.includes("Fault")) throw new ArcaError(`ARCA respondió ${res.status}. Probá de nuevo en unos minutos.`);
  return text;
}

export async function loadFiscal(storeId: string): Promise<{ fiscal: Fiscal | null; creds: Creds | null }> {
  const db = createServiceClient();
  const [{ data: f }, { data: c }, { data: s }] = await Promise.all([
    db.from("fiscal_settings").select("*").eq("store_id", storeId).maybeSingle(),
    db.from("fiscal_credentials").select("key_enc, cert_pem, token, sign, token_vence").eq("store_id", storeId).maybeSingle(),
    db.from("stores").select("cuit, modules").eq("id", storeId).single(),
  ]);
  if (!f || !s) return { fiscal: null, creds: (c as Creds) ?? null };
  return {
    fiscal: {
      storeId, cuit: s.cuit, razonSocial: f.razon_social, condicionIva: f.condicion_iva, puntoVenta: f.punto_venta,
      alicuotaIva: Number(f.alicuota_iva), ambiente: f.ambiente, automatica: f.automatica, certVence: f.cert_vence,
    },
    creds: (c as Creds) ?? null,
  };
}

// Listo para facturar: datos fiscales, certificado vigente y clave.
export function fiscalListo(fiscal: Fiscal | null, creds: Creds | null): fiscal is Fiscal {
  return !!fiscal && !!creds?.cert_pem && !!creds.key_enc && /^\d{11}$/.test(fiscal.cuit)
    && (!fiscal.certVence || new Date(fiscal.certVence) > new Date());
}

// Ticket de acceso de ARCA: dura 12 horas y se reutiliza, porque ARCA no da otro mientras esté vigente.
async function auth(fiscal: Fiscal, creds: Creds): Promise<Auth> {
  if (creds.token && creds.token_vence && new Date(creds.token_vence).getTime() > Date.now() + 120_000) {
    return { token: creds.token, sign: creds.sign, cuit: fiscal.cuit };
  }
  const cms = firmarTRA(loginTicketRequest(), creds.cert_pem, descifrar(creds.key_enc));
  const ticket = parseLoginCms(await post(urls(fiscal.ambiente).wsaa, loginCmsEnvelope(cms), ""));
  await createServiceClient().from("fiscal_credentials")
    .update({ token: ticket.token, sign: ticket.sign, token_vence: ticket.expires, updated_at: new Date().toISOString() })
    .eq("store_id", fiscal.storeId);
  creds.token = ticket.token;
  creds.sign = ticket.sign;
  creds.token_vence = ticket.expires;
  return { token: ticket.token, sign: ticket.sign, cuit: fiscal.cuit };
}

async function ultimo(fiscal: Fiscal, a: Auth, tipo: number) {
  return parseUltimoAutorizado(await post(urls(fiscal.ambiente).wsfe, ultimoAutorizadoEnvelope(a, fiscal.puntoVenta, tipo), soapAction("FECompUltimoAutorizado")));
}

// Prueba el certificado: pide el acceso y el último número de factura del punto de venta.
export async function probarConexion(storeId: string): Promise<{ ok: true; ultimo: number; letra: string } | { ok: false; error: string }> {
  const { fiscal, creds } = await loadFiscal(storeId);
  if (!fiscalListo(fiscal, creds)) return { ok: false, error: "Faltan datos fiscales o el certificado." };
  try {
    const a = await auth(fiscal, creds!);
    const letra = fiscal.condicionIva === "Monotributo" ? "C" : "B";
    return { ok: true, ultimo: await ultimo(fiscal, a, cbteTipo(letra, "Factura")), letra };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

const rpc = async (fn: string, args: Record<string, unknown>) => {
  const { data, error } = await createServiceClient().rpc(fn, args);
  if (error) throw new Error(error.message);
  return data;
};

const asRow = (r: Record<string, unknown>): InvoiceRow => ({
  ...(r as unknown as InvoiceRow), neto: Number(r.neto), iva: Number(r.iva), total: Number(r.total),
  numero: r.numero == null ? null : Number(r.numero), alicuota_iva: Number(r.alicuota_iva),
});

export type EmitResult = { ok: true; invoice: InvoiceRow } | { ok: false; error: string; invoice?: InvoiceRow };

// Pide el CAE de una factura o nota de crédito ya preparada. Si un intento anterior quedó sin
// respuesta, primero consulta en ARCA si ese número salió.
async function emitir(fiscal: Fiscal, creds: Creds, inv: InvoiceRow, userId: string, asociada: InvoiceRow | null): Promise<EmitResult> {
  const reload = async () => asRow((await createServiceClient().from("invoices").select("*").eq("id", inv.id).single()).data!);
  let a: Auth;
  try {
    a = await auth(fiscal, creds);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await rpc("factura_resultado", { p_id: inv.id, p_status: "Pendiente", p_numero: null, p_fecha: null, p_cae: "", p_cae_vence: null, p_error: msg, p_user: userId });
    return { ok: false, error: msg, invoice: await reload() };
  }
  const wsfe = urls(fiscal.ambiente).wsfe;

  try {
    if (inv.numero != null) {
      const prev = parseConsultar(await post(wsfe, consultarEnvelope(a, inv.punto_venta, inv.cbte_tipo, inv.numero), soapAction("FECompConsultar")));
      if (prev?.cae && Math.abs(prev.total - inv.total) < 0.01 && prev.docNro.replace(/^0+/, "") === inv.doc_nro.replace(/^0+/, "")) {
        await rpc("factura_resultado", { p_id: inv.id, p_status: "Emitida", p_numero: inv.numero, p_fecha: isoDay(prev.fecha), p_cae: prev.cae,
          p_cae_vence: isoDay(prev.caeVence), p_error: "", p_user: userId });
        return { ok: true, invoice: await reload() };
      }
    }
    // Hasta tres veces por si otra venta tomó el mismo número en el medio (error 10016 de ARCA).
    let last = "";
    for (let i = 0; i < 3; i++) {
      const numero = (await ultimo(fiscal, a, inv.cbte_tipo)) + 1;
      const fecha = localDay();
      await rpc("factura_intento", { p_id: inv.id, p_numero: numero, p_fecha: fecha });
      const res = parseCae(await post(wsfe, caeEnvelope(a, {
        ptoVta: inv.punto_venta, cbteTipo: inv.cbte_tipo, numero, fecha: arcaDate(fecha), docTipo: inv.doc_tipo, docNro: inv.doc_nro,
        condicionReceptor: inv.receptor_condicion, neto: inv.neto, iva: inv.iva, total: inv.total,
        alicuotaId: inv.letra === "C" ? null : ALICUOTA_ID[inv.alicuota_iva] ?? 5,
        asociado: asociada && asociada.numero != null && asociada.fecha
          ? { tipo: asociada.cbte_tipo, ptoVta: asociada.punto_venta, numero: asociada.numero, cuit: fiscal.cuit, fecha: arcaDate(asociada.fecha) }
          : undefined,
      }), soapAction("FECAESolicitar")));
      if (res.aprobado) {
        await rpc("factura_resultado", { p_id: inv.id, p_status: "Emitida", p_numero: numero, p_fecha: fecha, p_cae: res.cae,
          p_cae_vence: isoDay(res.caeVence), p_error: res.obs, p_user: userId });
        return { ok: true, invoice: await reload() };
      }
      last = res.error;
      if (!/10016/.test(res.error)) break;
    }
    await rpc("factura_resultado", { p_id: inv.id, p_status: "Rechazada", p_numero: null, p_fecha: null, p_cae: "", p_cae_vence: null, p_error: last, p_user: userId });
    return { ok: false, error: last, invoice: await reload() };
  } catch (e) {
    // Sin respuesta: queda pendiente con el número pedido, y el reintento lo confirma con ARCA.
    const msg = e instanceof Error ? e.message : String(e);
    await rpc("factura_resultado", { p_id: inv.id, p_status: "Pendiente", p_numero: null, p_fecha: null, p_cae: "", p_cae_vence: null, p_error: msg, p_user: userId });
    return { ok: false, error: msg, invoice: await reload() };
  }
}

type SaleRow = { store_id: string; status: string; fx: number; discount_pct: number; sale_lines: { qty: number; unit_price: number; currency: Currency }[] };

// Factura una venta. receptor null = consumidor final sin identificar.
export async function facturarVenta(p: { storeId: string; saleId: string; userId: string; receptor: Receptor | null }): Promise<EmitResult> {
  const { fiscal, creds } = await loadFiscal(p.storeId);
  if (!fiscalListo(fiscal, creds)) return { ok: false, error: "Faltan los datos fiscales o el certificado de ARCA en Configuración." };
  const { data: s } = await createServiceClient().from("sales").select("store_id, status, fx, discount_pct, sale_lines(qty, unit_price, currency)")
    .eq("id", p.saleId).maybeSingle();
  const sale = s as unknown as SaleRow | null;
  if (!sale || sale.store_id !== p.storeId) return { ok: false, error: "No existe la venta." };

  // Sin datos nuevos, el reintento usa los del intento anterior.
  const { data: prev } = await createServiceClient().from("invoices").select("receptor_condicion, doc_nro, receptor_nombre")
    .eq("sale_id", p.saleId).eq("kind", "Factura").maybeSingle();
  const receptor: Receptor = p.receptor
    ?? (prev ? { condicion: prev.receptor_condicion, doc: prev.doc_nro === "0" ? "" : prev.doc_nro, nombre: prev.receptor_nombre } : { condicion: 5, doc: "", nombre: "" });
  const err = receptorError(fiscal.condicionIva, receptor);
  if (err) return { ok: false, error: err };
  const letra = letraFor(fiscal.condicionIva, receptor.condicion);
  const total = saleTotalARS({ fx: Number(sale.fx), discountPct: Number(sale.discount_pct),
    lines: sale.sale_lines.map((l) => ({ qty: Number(l.qty), unitPrice: Number(l.unit_price), currency: l.currency })) });
  if (total <= 0) return { ok: false, error: "La venta no tiene importe para facturar." };
  const amounts = invoiceAmounts(total, letra, fiscal.alicuotaIva);
  const doc = docReceptor(receptor);

  let inv: InvoiceRow;
  try {
    inv = asRow(await rpc("factura_preparar", {
      p_sale: p.saleId, p_kind: "Factura", p_user: p.userId,
      p: { letra, cbte_tipo: cbteTipo(letra, "Factura"), punto_venta: fiscal.puntoVenta, ambiente: fiscal.ambiente, doc_tipo: doc.docTipo,
        doc_nro: doc.docNro, receptor_nombre: receptor.nombre.trim(), receptor_condicion: receptor.condicion, ...amounts, alicuota_iva: fiscal.alicuotaIva },
    }));
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
  if (inv.status === "Emitida") return { ok: true, invoice: inv };
  return emitir(fiscal, creds!, inv, p.userId, null);
}

// Nota de crédito por el total de la factura de una venta anulada.
export async function notaDeCredito(p: { storeId: string; saleId: string; userId: string }): Promise<EmitResult | null> {
  const db = createServiceClient();
  const { data: f } = await db.from("invoices").select("*").eq("sale_id", p.saleId).eq("kind", "Factura").eq("status", "Emitida").maybeSingle();
  if (!f || f.store_id !== p.storeId) return null;
  const factura = asRow(f);
  const { fiscal, creds } = await loadFiscal(p.storeId);
  if (!fiscalListo(fiscal, creds)) return { ok: false, error: "Faltan los datos fiscales o el certificado de ARCA en Configuración." };
  let inv: InvoiceRow;
  try {
    inv = asRow(await rpc("factura_preparar", {
      p_sale: p.saleId, p_kind: "Nota de crédito", p_user: p.userId,
      p: { letra: factura.letra, cbte_tipo: cbteTipo(factura.letra, "Nota de crédito"), punto_venta: factura.punto_venta, ambiente: factura.ambiente,
        doc_tipo: factura.doc_tipo, doc_nro: factura.doc_nro, receptor_nombre: factura.receptor_nombre, receptor_condicion: factura.receptor_condicion,
        neto: factura.neto, iva: factura.iva, total: factura.total, alicuota_iva: factura.alicuota_iva, asociada_id: factura.id },
    }));
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
  if (inv.status === "Emitida") return { ok: true, invoice: inv };
  return emitir({ ...fiscal, puntoVenta: factura.punto_venta, ambiente: factura.ambiente }, creds!, inv, p.userId, factura);
}

// Para la pantalla de venta: si cada venta sale facturada, con qué condición factura el local.
export async function facturacionAutomatica(storeId: string): Promise<{ emisor: CondicionEmisor } | null> {
  const { fiscal, creds } = await loadFiscal(storeId);
  return fiscalListo(fiscal, creds) && fiscal.automatica ? { emisor: fiscal.condicionIva } : null;
}
