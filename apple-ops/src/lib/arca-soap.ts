// Mensajes SOAP de ARCA: WSAA (login con el certificado) y WSFEv1 (factura electrónica).
// Solo arma y lee XML; las llamadas las hace src/lib/arca-server.ts.

export type Ambiente = "homologacion" | "produccion";

export const ARCA_URLS: Record<Ambiente, { wsaa: string; wsfe: string }> = {
  homologacion: { wsaa: "https://wsaahomo.afip.gov.ar/ws/services/LoginCms", wsfe: "https://wswhomo.afip.gov.ar/wsfev1/service.asmx" },
  produccion: { wsaa: "https://wsaa.afip.gov.ar/ws/services/LoginCms", wsfe: "https://servicios1.afip.gov.ar/wsfev1/service.asmx" },
};

const esc = (s: string | number) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const unesc = (s: string) => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");

// Primer valor de la etiqueta, sin importar el prefijo de namespace.
export function tag(xml: string, name: string): string | null {
  const m = xml.match(new RegExp(`<(?:[\\w-]+:)?${name}(?:\\s[^>]*)?>([\\s\\S]*?)</(?:[\\w-]+:)?${name}>`));
  return m ? m[1].trim() : null;
}
export function tags(xml: string, name: string): string[] {
  const re = new RegExp(`<(?:[\\w-]+:)?${name}(?:\\s[^>]*)?>([\\s\\S]*?)</(?:[\\w-]+:)?${name}>`, "g");
  return [...xml.matchAll(re)].map((m) => m[1].trim());
}

// ---------- WSAA ----------
// Pedido de acceso al servicio de factura electrónica, válido 10 minutos para atrás y para adelante.
export function loginTicketRequest(now = new Date(), service = "wsfe") {
  const iso = (d: Date) => d.toISOString().replace(/\.\d{3}Z$/, "Z");
  return `<?xml version="1.0" encoding="UTF-8"?><loginTicketRequest version="1.0"><header><uniqueId>${Math.floor(now.getTime() / 1000)}</uniqueId>`
    + `<generationTime>${iso(new Date(now.getTime() - 600_000))}</generationTime><expirationTime>${iso(new Date(now.getTime() + 600_000))}</expirationTime>`
    + `</header><service>${service}</service></loginTicketRequest>`;
}

export const loginCmsEnvelope = (cms: string) =>
  `<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:wsaa="http://wsaa.view.sua.dvadac.desein.afip.gov">`
  + `<soapenv:Header/><soapenv:Body><wsaa:loginCms><wsaa:in0>${cms}</wsaa:in0></wsaa:loginCms></soapenv:Body></soapenv:Envelope>`;

export type Ticket = { token: string; sign: string; expires: string };

// Respuesta de loginCms: el ticket viene como XML escapado adentro de loginCmsReturn.
export function parseLoginCms(xml: string): Ticket {
  const fault = tag(xml, "faultstring");
  if (fault) throw new ArcaError(wsaaFault(unesc(fault)));
  const ret = tag(xml, "loginCmsReturn");
  if (!ret) throw new ArcaError("ARCA no devolvió el ticket de acceso.");
  const ta = unesc(ret);
  const token = tag(ta, "token");
  const sign = tag(ta, "sign");
  const expires = tag(ta, "expirationTime");
  if (!token || !sign || !expires) throw new ArcaError("El ticket de acceso de ARCA vino incompleto.");
  return { token, sign, expires };
}

function wsaaFault(msg: string) {
  if (/alreadyAuthenticated/i.test(msg)) return "ARCA ya entregó un acceso para este certificado y todavía no venció. Probá de nuevo en unos minutos.";
  if (/cms\.cert\.untrusted|cert\.expired|cms\.cert\.invalid/i.test(msg)) return "ARCA no acepta el certificado: revisá que esté vigente y que sea del ambiente elegido.";
  if (/notAuthorized|cms\.sign\.invalid/i.test(msg)) return "El certificado no está autorizado para factura electrónica (wsfe). Asocialo al servicio en ARCA.";
  return `ARCA rechazó el acceso: ${msg}`;
}

// ---------- WSFEv1 ----------
const NS = "http://ar.gov.afip.dif.FEV1/";
export const soapAction = (method: string) => `${NS}${method}`;

export type Auth = { token: string; sign: string; cuit: string };

const envelope = (method: string, auth: Auth, body: string) =>
  `<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ar="${NS}"><soap:Body><ar:${method}>`
  + `<ar:Auth><ar:Token>${esc(auth.token)}</ar:Token><ar:Sign>${esc(auth.sign)}</ar:Sign><ar:Cuit>${esc(auth.cuit)}</ar:Cuit></ar:Auth>`
  + body + `</ar:${method}></soap:Body></soap:Envelope>`;

export const ultimoAutorizadoEnvelope = (auth: Auth, ptoVta: number, cbteTipo: number) =>
  envelope("FECompUltimoAutorizado", auth, `<ar:PtoVta>${ptoVta}</ar:PtoVta><ar:CbteTipo>${cbteTipo}</ar:CbteTipo>`);

export const consultarEnvelope = (auth: Auth, ptoVta: number, cbteTipo: number, numero: number) =>
  envelope("FECompConsultar", auth, `<ar:FeCompConsReq><ar:CbteTipo>${cbteTipo}</ar:CbteTipo><ar:CbteNro>${numero}</ar:CbteNro><ar:PtoVta>${ptoVta}</ar:PtoVta></ar:FeCompConsReq>`);

export type CaeRequest = {
  ptoVta: number;
  cbteTipo: number;
  numero: number;
  fecha: string; // AAAAMMDD
  docTipo: number;
  docNro: string;
  condicionReceptor: number;
  neto: number;
  iva: number;
  total: number;
  alicuotaId: number | null; // null en factura C
  asociado?: { tipo: number; ptoVta: number; numero: number; cuit: string; fecha: string };
};

const money = (n: number) => n.toFixed(2);

// Un comprobante de productos (concepto 1) en pesos. El orden de los campos es el del WSDL.
export function caeEnvelope(auth: Auth, r: CaeRequest) {
  const asoc = r.asociado
    ? `<ar:CbtesAsoc><ar:CbteAsoc><ar:Tipo>${r.asociado.tipo}</ar:Tipo><ar:PtoVta>${r.asociado.ptoVta}</ar:PtoVta><ar:Nro>${r.asociado.numero}</ar:Nro>`
      + `<ar:Cuit>${esc(r.asociado.cuit)}</ar:Cuit><ar:CbteFch>${r.asociado.fecha}</ar:CbteFch></ar:CbteAsoc></ar:CbtesAsoc>`
    : "";
  const iva = r.alicuotaId
    ? `<ar:Iva><ar:AlicIva><ar:Id>${r.alicuotaId}</ar:Id><ar:BaseImp>${money(r.neto)}</ar:BaseImp><ar:Importe>${money(r.iva)}</ar:Importe></ar:AlicIva></ar:Iva>`
    : "";
  const det = `<ar:Concepto>1</ar:Concepto><ar:DocTipo>${r.docTipo}</ar:DocTipo><ar:DocNro>${esc(r.docNro)}</ar:DocNro>`
    + `<ar:CbteDesde>${r.numero}</ar:CbteDesde><ar:CbteHasta>${r.numero}</ar:CbteHasta><ar:CbteFch>${r.fecha}</ar:CbteFch>`
    + `<ar:ImpTotal>${money(r.total)}</ar:ImpTotal><ar:ImpTotConc>0.00</ar:ImpTotConc><ar:ImpNeto>${money(r.neto)}</ar:ImpNeto>`
    + `<ar:ImpOpEx>0.00</ar:ImpOpEx><ar:ImpTrib>0.00</ar:ImpTrib><ar:ImpIVA>${money(r.iva)}</ar:ImpIVA>`
    + `<ar:MonId>PES</ar:MonId><ar:MonCotiz>1</ar:MonCotiz><ar:CondicionIVAReceptorId>${r.condicionReceptor}</ar:CondicionIVAReceptorId>`
    + asoc + iva;
  return envelope("FECAESolicitar", auth,
    `<ar:FeCAEReq><ar:FeCabReq><ar:CantReg>1</ar:CantReg><ar:PtoVta>${r.ptoVta}</ar:PtoVta><ar:CbteTipo>${r.cbteTipo}</ar:CbteTipo></ar:FeCabReq>`
    + `<ar:FeDetReq><ar:FECAEDetRequest>${det}</ar:FECAEDetRequest></ar:FeDetReq></ar:FeCAEReq>`);
}

export class ArcaError extends Error {}

function errores(xml: string) {
  const errs = tags(xml, "Err").map((e) => `${tag(e, "Code")}: ${unesc(tag(e, "Msg") ?? "")}`);
  return errs.length ? errs.join(" · ") : null;
}

function soapFault(xml: string) {
  const f = tag(xml, "faultstring");
  if (f) throw new ArcaError(`ARCA respondió con un error: ${unesc(f)}`);
}

export function parseUltimoAutorizado(xml: string): number {
  soapFault(xml);
  const res = tag(xml, "FECompUltimoAutorizadoResult") ?? "";
  const nro = tag(res, "CbteNro");
  if (nro == null) throw new ArcaError(errores(res) ?? "ARCA no informó el último número.");
  return Number(nro);
}

export type Consulta = { cae: string; caeVence: string; total: number; docNro: string; fecha: string } | null;

export function parseConsultar(xml: string): Consulta {
  soapFault(xml);
  const res = tag(xml, "FECompConsultarResult") ?? "";
  const get = tag(res, "ResultGet");
  if (!get) return null;
  return {
    cae: tag(get, "CodAutorizacion") ?? "",
    caeVence: tag(get, "FchVto") ?? "",
    total: Number(tag(get, "ImpTotal") ?? 0),
    docNro: tag(get, "DocNro") ?? "",
    fecha: tag(get, "CbteFch") ?? "",
  };
}

export type CaeResult = { aprobado: true; cae: string; caeVence: string; obs: string } | { aprobado: false; error: string };

export function parseCae(xml: string): CaeResult {
  soapFault(xml);
  const res = tag(xml, "FECAESolicitarResult") ?? "";
  const det = tag(res, "FECAEDetResponse") ?? "";
  const obs = tags(det, "Obs").map((o) => `${tag(o, "Code")}: ${unesc(tag(o, "Msg") ?? "")}`).join(" · ");
  const resultado = tag(det, "Resultado") ?? tag(tag(res, "FeCabResp") ?? "", "Resultado");
  const cae = tag(det, "CAE");
  if (resultado === "A" && cae) return { aprobado: true, cae, caeVence: tag(det, "CAEFchVto") ?? "", obs };
  return { aprobado: false, error: [errores(res), obs].filter(Boolean).join(" · ") || "ARCA rechazó el comprobante sin decir por qué." };
}

// AAAAMMDD <-> AAAA-MM-DD
export const arcaDate = (day: string) => day.replace(/-/g, "");
export const isoDay = (d: string) => (/^\d{8}$/.test(d) ? `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}` : d);
