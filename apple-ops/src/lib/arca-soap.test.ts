import { describe, expect, it } from "vitest";
import {
  ArcaError, caeEnvelope, consultarEnvelope, isoDay, loginCmsEnvelope, parseCae, parseConsultar, parseLoginCms, parseUltimoAutorizado,
  ultimoAutorizadoEnvelope,
} from "./arca-soap";

const auth = { token: "TOK", sign: "SIG", cuit: "20111111112" };
const soap = (body: string) => `<?xml version="1.0" encoding="utf-8"?><soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body>${body}</soap:Body></soap:Envelope>`;

describe("WSAA", () => {
  it("manda el CMS en loginCms", () => {
    expect(loginCmsEnvelope("QUJD")).toContain("<wsaa:in0>QUJD</wsaa:in0>");
  });

  it("lee el ticket escapado de la respuesta", () => {
    const ta = `<?xml version="1.0" encoding="UTF-8"?><loginTicketResponse version="1.0"><header><expirationTime>2026-10-09T10:00:00.000-03:00</expirationTime></header><credentials><token>PD94bWw=</token><sign>c2lnbg==</sign></credentials></loginTicketResponse>`;
    const esc = ta.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const xml = `<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"><soapenv:Body><loginCmsResponse xmlns="http://wsaa.view.sua.dvadac.desein.afip.gov"><loginCmsReturn>${esc}</loginCmsReturn></loginCmsResponse></soapenv:Body></soapenv:Envelope>`;
    expect(parseLoginCms(xml)).toEqual({ token: "PD94bWw=", sign: "c2lnbg==", expires: "2026-10-09T10:00:00.000-03:00" });
  });

  it("traduce los errores de acceso", () => {
    const fault = (s: string) => `<soapenv:Envelope xmlns:soapenv="x"><soapenv:Body><soapenv:Fault><faultcode>ns1:coe.alreadyAuthenticated</faultcode><faultstring>${s}</faultstring></soapenv:Fault></soapenv:Body></soapenv:Envelope>`;
    expect(() => parseLoginCms(fault("El CEE ya posee un TA valido para el acceso al WSN solicitado (coe.alreadyAuthenticated)"))).toThrow(/unos minutos/);
    expect(() => parseLoginCms(fault("Certificado expirado: cms.cert.expired"))).toThrow(/certificado/);
    expect(() => parseLoginCms(fault("otra cosa"))).toThrow(ArcaError);
  });
});

describe("WSFEv1", () => {
  it("arma las consultas con la autenticación", () => {
    const u = ultimoAutorizadoEnvelope(auth, 3, 6);
    expect(u).toContain("<ar:FECompUltimoAutorizado><ar:Auth><ar:Token>TOK</ar:Token><ar:Sign>SIG</ar:Sign><ar:Cuit>20111111112</ar:Cuit></ar:Auth>");
    expect(u).toContain("<ar:PtoVta>3</ar:PtoVta><ar:CbteTipo>6</ar:CbteTipo>");
    expect(consultarEnvelope(auth, 3, 6, 12)).toContain("<ar:FeCompConsReq><ar:CbteTipo>6</ar:CbteTipo><ar:CbteNro>12</ar:CbteNro><ar:PtoVta>3</ar:PtoVta>");
  });

  it("pide el CAE de una factura B con IVA y de una nota de crédito C asociada", () => {
    const b = caeEnvelope(auth, { ptoVta: 1, cbteTipo: 6, numero: 13, fecha: "20261008", docTipo: 99, docNro: "0", condicionReceptor: 5,
      neto: 100000, iva: 21000, total: 121000, alicuotaId: 5 });
    expect(b).toContain("<ar:CantReg>1</ar:CantReg><ar:PtoVta>1</ar:PtoVta><ar:CbteTipo>6</ar:CbteTipo>");
    expect(b).toContain("<ar:CbteDesde>13</ar:CbteDesde><ar:CbteHasta>13</ar:CbteHasta><ar:CbteFch>20261008</ar:CbteFch>");
    expect(b).toContain("<ar:ImpTotal>121000.00</ar:ImpTotal><ar:ImpTotConc>0.00</ar:ImpTotConc><ar:ImpNeto>100000.00</ar:ImpNeto>");
    expect(b).toContain("<ar:CondicionIVAReceptorId>5</ar:CondicionIVAReceptorId><ar:Iva><ar:AlicIva><ar:Id>5</ar:Id><ar:BaseImp>100000.00</ar:BaseImp><ar:Importe>21000.00</ar:Importe>");
    const nc = caeEnvelope(auth, { ptoVta: 1, cbteTipo: 13, numero: 2, fecha: "20261009", docTipo: 96, docNro: "30123456", condicionReceptor: 5,
      neto: 5000, iva: 0, total: 5000, alicuotaId: null, asociado: { tipo: 11, ptoVta: 1, numero: 7, cuit: "20111111112", fecha: "20261008" } });
    expect(nc).not.toContain("<ar:Iva>");
    expect(nc).toContain("<ar:CbtesAsoc><ar:CbteAsoc><ar:Tipo>11</ar:Tipo><ar:PtoVta>1</ar:PtoVta><ar:Nro>7</ar:Nro><ar:Cuit>20111111112</ar:Cuit><ar:CbteFch>20261008</ar:CbteFch>");
  });

  it("lee el último número autorizado", () => {
    expect(parseUltimoAutorizado(soap(`<FECompUltimoAutorizadoResponse xmlns="http://ar.gov.afip.dif.FEV1/"><FECompUltimoAutorizadoResult><PtoVta>1</PtoVta><CbteTipo>6</CbteTipo><CbteNro>12</CbteNro></FECompUltimoAutorizadoResult></FECompUltimoAutorizadoResponse>`))).toBe(12);
    expect(() => parseUltimoAutorizado(soap(`<FECompUltimoAutorizadoResponse><FECompUltimoAutorizadoResult><Errors><Err><Code>600</Code><Msg>ValidacionDeToken: No aparecio CUIT en lista de relaciones</Msg></Err></Errors></FECompUltimoAutorizadoResult></FECompUltimoAutorizadoResponse>`))).toThrow(/600: ValidacionDeToken/);
  });

  it("lee el CAE aprobado o el motivo del rechazo", () => {
    const ok = soap(`<FECAESolicitarResponse><FECAESolicitarResult><FeCabResp><Cuit>20111111112</Cuit><PtoVta>1</PtoVta><CbteTipo>6</CbteTipo><FchProceso>20261008120000</FchProceso><CantReg>1</CantReg><Resultado>A</Resultado><Reproceso>N</Reproceso></FeCabResp><FeDetResp><FECAEDetResponse><Concepto>1</Concepto><DocTipo>99</DocTipo><DocNro>0</DocNro><CbteDesde>13</CbteDesde><CbteHasta>13</CbteHasta><CbteFch>20261008</CbteFch><Resultado>A</Resultado><CAE>76412345678901</CAE><CAEFchVto>20261018</CAEFchVto></FECAEDetResponse></FeDetResp></FECAESolicitarResult></FECAESolicitarResponse>`);
    expect(parseCae(ok)).toEqual({ aprobado: true, cae: "76412345678901", caeVence: "20261018", obs: "" });
    const rech = soap(`<FECAESolicitarResponse><FECAESolicitarResult><FeCabResp><Resultado>R</Resultado></FeCabResp><FeDetResp><FECAEDetResponse><Resultado>R</Resultado><Observaciones><Obs><Code>10016</Code><Msg>El numero o fecha del comprobante no se corresponde con el proximo a autorizar.</Msg></Obs></Observaciones><CAE></CAE></FECAEDetResponse></FeDetResp></FECAESolicitarResult></FECAESolicitarResponse>`);
    const r = parseCae(rech);
    expect(r.aprobado).toBe(false);
    expect(!r.aprobado && r.error).toMatch(/^10016: El numero/);
  });

  it("consulta un comprobante ya emitido", () => {
    const xml = soap(`<FECompConsultarResponse><FECompConsultarResult><ResultGet><Concepto>1</Concepto><DocTipo>99</DocTipo><DocNro>0</DocNro><CbteDesde>13</CbteDesde><CbteFch>20261008</CbteFch><ImpTotal>121000</ImpTotal><CodAutorizacion>76412345678901</CodAutorizacion><FchVto>20261018</FchVto></ResultGet></FECompConsultarResult></FECompConsultarResponse>`);
    expect(parseConsultar(xml)).toEqual({ cae: "76412345678901", caeVence: "20261018", total: 121000, docNro: "0", fecha: "20261008" });
    expect(parseConsultar(soap(`<FECompConsultarResponse><FECompConsultarResult><Errors><Err><Code>602</Code><Msg>Sin Resultados</Msg></Err></Errors></FECompConsultarResult></FECompConsultarResponse>`))).toBeNull();
    expect(isoDay("20261018")).toBe("2026-10-18");
  });
});
