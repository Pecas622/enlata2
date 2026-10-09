// ARCA de mentira para los e2e: WSAA (loginCms) y WSFEv1 (último autorizado, CAE y consulta), con la
// numeración correlativa y el error 10016 del de verdad. POST /cortar-proxima hace que la próxima
// factura se autorice pero la respuesta no llegue, para probar el reintento.
import { createServer } from "node:http";

const PORT = Number(process.env.ARCA_MOCK_PORT ?? 3998);
const emitidos = new Map(); // "cuit|pv|tipo|nro" -> comprobante
const ultimos = new Map(); // "cuit|pv|tipo" -> último número
let cortar = false;

const read = (req) => new Promise((ok) => { let b = ""; req.on("data", (c) => (b += c)); req.on("end", () => ok(b)); });
const tag = (xml, name) => xml.match(new RegExp(`<(?:\\w+:)?${name}>([\\s\\S]*?)</(?:\\w+:)?${name}>`))?.[1] ?? null;
const soap = (body) => `<?xml version="1.0" encoding="utf-8"?><soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body>${body}</soap:Body></soap:Envelope>`;
const send = (res, xml, status = 200) => { res.writeHead(status, { "Content-Type": "text/xml; charset=utf-8" }); res.end(xml); };
const fault = (res, msg) => send(res, soap(`<soap:Fault><faultcode>soap:Server</faultcode><faultstring>${msg}</faultstring></soap:Fault>`), 500);
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const hoy = () => new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10).replace(/-/g, "");
const masDias = (d) => new Date(Date.now() + d * 86_400_000).toISOString().slice(0, 10).replace(/-/g, "");

createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  if (req.method === "GET" && url.pathname === "/health") return send(res, "ok");
  if (req.method === "GET" && url.pathname === "/comprobantes") {
    res.writeHead(200, { "Content-Type": "application/json" });
    return res.end(JSON.stringify([...emitidos.values()]));
  }
  if (req.method === "POST" && url.pathname === "/cortar-proxima") { cortar = true; return send(res, "ok"); }
  const body = await read(req);

  if (url.pathname === "/wsaa") {
    const cms = tag(body, "in0") ?? "";
    // El CMS lleva el TRA adentro: alcanza con ver que lo trae y que pide wsfe.
    const der = Buffer.from(cms, "base64").toString("latin1");
    if (!der.includes("<loginTicketRequest") || !der.includes("<service>wsfe</service>")) return fault(res, "cms.bad: El CMS no es valido");
    const ta = `<?xml version="1.0" encoding="UTF-8"?><loginTicketResponse version="1.0"><header><expirationTime>${new Date(Date.now() + 12 * 3600_000).toISOString()}</expirationTime></header>`
      + `<credentials><token>TOKEN-${Date.now()}</token><sign>SIGN</sign></credentials></loginTicketResponse>`;
    return send(res, `<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"><soapenv:Body><loginCmsResponse><loginCmsReturn>${esc(ta)}</loginCmsReturn></loginCmsResponse></soapenv:Body></soapenv:Envelope>`);
  }

  if (url.pathname === "/wsfe") {
    if (!tag(body, "Token")?.startsWith("TOKEN-")) return send(res, soap(`<R><Errors><Err><Code>600</Code><Msg>ValidacionDeToken: token invalido</Msg></Err></Errors></R>`));
    const cuit = tag(body, "Cuit");
    if (body.includes("FECompUltimoAutorizado>")) {
      const pv = tag(body, "PtoVta"), tipo = tag(body, "CbteTipo");
      const n = ultimos.get(`${cuit}|${pv}|${tipo}`) ?? 0;
      return send(res, soap(`<FECompUltimoAutorizadoResponse><FECompUltimoAutorizadoResult><PtoVta>${pv}</PtoVta><CbteTipo>${tipo}</CbteTipo><CbteNro>${n}</CbteNro></FECompUltimoAutorizadoResult></FECompUltimoAutorizadoResponse>`));
    }
    if (body.includes("FECompConsultar>")) {
      const c = emitidos.get(`${cuit}|${tag(body, "PtoVta")}|${tag(body, "CbteTipo")}|${tag(body, "CbteNro")}`);
      if (!c) return send(res, soap(`<FECompConsultarResponse><FECompConsultarResult><Errors><Err><Code>602</Code><Msg>Sin Resultados</Msg></Err></Errors></FECompConsultarResult></FECompConsultarResponse>`));
      return send(res, soap(`<FECompConsultarResponse><FECompConsultarResult><ResultGet><DocTipo>${c.docTipo}</DocTipo><DocNro>${c.docNro}</DocNro><CbteDesde>${c.nro}</CbteDesde><CbteFch>${c.fecha}</CbteFch><ImpTotal>${c.total}</ImpTotal><CodAutorizacion>${c.cae}</CodAutorizacion><FchVto>${c.vence}</FchVto></ResultGet></FECompConsultarResult></FECompConsultarResponse>`));
    }
    if (body.includes("FECAESolicitar>")) {
      const cab = tag(body, "FeCabReq"), det = tag(body, "FECAEDetRequest");
      const pv = tag(cab, "PtoVta"), tipo = tag(cab, "CbteTipo"), nro = Number(tag(det, "CbteDesde"));
      const key = `${cuit}|${pv}|${tipo}`;
      const rech = (code, msg) => send(res, soap(`<FECAESolicitarResponse><FECAESolicitarResult><FeCabResp><Resultado>R</Resultado></FeCabResp><FeDetResp><FECAEDetResponse><Resultado>R</Resultado><Observaciones><Obs><Code>${code}</Code><Msg>${msg}</Msg></Obs></Observaciones></FECAEDetResponse></FeDetResp></FECAESolicitarResult></FECAESolicitarResponse>`));
      if (nro !== (ultimos.get(key) ?? 0) + 1) return rech(10016, "El numero o fecha del comprobante no se corresponde con el proximo a autorizar.");
      const total = Number(tag(det, "ImpTotal")), neto = Number(tag(det, "ImpNeto")), iva = Number(tag(det, "ImpIVA"));
      if (Math.abs(total - neto - iva) > 0.01) return rech(10048, "ImpTotal debe ser igual a la suma de ImpNeto + ImpIVA.");
      if (["1", "6", "3", "8"].includes(tipo) && !det.includes("<ar:Iva>")) return rech(10070, "Falta el detalle de IVA.");
      if (["3", "8", "13"].includes(tipo) && !det.includes("<ar:CbtesAsoc>")) return rech(10040, "Falta el comprobante asociado.");
      if (!tag(det, "CondicionIVAReceptorId")) return rech(10242, "Falta CondicionIVAReceptorId.");
      const c = { cuit, pv, tipo, nro, fecha: tag(det, "CbteFch"), docTipo: tag(det, "DocTipo"), docNro: tag(det, "DocNro"), total, neto, iva,
        condicion: tag(det, "CondicionIVAReceptorId"), cae: String(7e13 + Math.floor(Math.random() * 1e12)), vence: masDias(10),
        asociado: tag(det, "CbteAsoc") ? Number(tag(tag(det, "CbteAsoc"), "Nro")) : null };
      emitidos.set(`${key}|${nro}`, c);
      ultimos.set(key, nro);
      if (cortar) { cortar = false; return req.socket.destroy(); }
      return send(res, soap(`<FECAESolicitarResponse><FECAESolicitarResult><FeCabResp><Resultado>A</Resultado></FeCabResp><FeDetResp><FECAEDetResponse><CbteDesde>${nro}</CbteDesde><CbteFch>${c.fecha || hoy()}</CbteFch><Resultado>A</Resultado><CAE>${c.cae}</CAE><CAEFchVto>${c.vence}</CAEFchVto></FECAEDetResponse></FeDetResp></FECAESolicitarResult></FECAESolicitarResponse>`));
    }
  }
  send(res, "no existe", 404);
}).listen(PORT, () => console.log(`arca-mock en ${PORT}`));
