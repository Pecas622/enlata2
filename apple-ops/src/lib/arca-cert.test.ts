import forge from "node-forge";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { emitirCertificado } from "../../tests/arca-test-ca";
import { cifrar, descifrar, firmarTRA, generarClaveYCsr, leerCertificado } from "./arca-cert";
import { loginTicketRequest } from "./arca-soap";

const prev = process.env.ARCA_KEY_SECRET;
beforeAll(() => { process.env.ARCA_KEY_SECRET = "secreto-de-prueba-largo"; });
afterAll(() => { process.env.ARCA_KEY_SECRET = prev; });

describe("certificado de ARCA", () => {
  const { keyPem, csrPem } = generarClaveYCsr({ cuit: "20111111112", razonSocial: "Mi Local SRL", alias: "appleops1" });

  it("arma el pedido de certificado con el CUIT en serialNumber", () => {
    const csr = forge.pki.certificationRequestFromPem(csrPem);
    expect(csr.verify()).toBe(true);
    expect(csr.subject.getField({ name: "serialNumber" }).value).toBe("CUIT 20111111112");
    expect(csr.subject.getField("O").value).toBe("Mi Local SRL");
    expect(csr.subject.getField("CN").value).toBe("appleops1");
  });

  it("acepta el certificado de su clave y detecta uno ajeno", () => {
    const cert = emitirCertificado(csrPem);
    const info = leerCertificado(cert, keyPem);
    expect(info).toMatchObject({ coincide: true, cuit: "20111111112" });
    expect(info.vence.getTime()).toBeGreaterThan(Date.now());
    const otro = generarClaveYCsr({ cuit: "20111111112", razonSocial: "Otro", alias: "otro" });
    expect(leerCertificado(emitirCertificado(otro.csrPem), keyPem).coincide).toBe(false);
    expect(() => leerCertificado("cualquier cosa", keyPem)).toThrow(/certificado válido/);
  });

  it("firma el pedido de acceso como CMS con el TRA adentro", () => {
    const cert = emitirCertificado(csrPem);
    const tra = loginTicketRequest(new Date("2026-10-08T12:00:00Z"));
    const cms = firmarTRA(tra, cert, keyPem);
    const der = forge.util.decode64(cms);
    const msg = forge.pkcs7.messageFromAsn1(forge.asn1.fromDer(der)) as forge.pkcs7.PkcsSignedData;
    expect(der).toContain(tra);
    expect(msg.certificates).toHaveLength(1);
    expect(tra).toContain("<service>wsfe</service>");
    expect(tra).toContain("<generationTime>2026-10-08T11:50:00Z</generationTime>");
  });

  it("guarda la clave cifrada y solo la abre con el mismo secreto", () => {
    const enc = cifrar(keyPem);
    expect(enc).not.toContain("PRIVATE KEY");
    expect(descifrar(enc)).toBe(keyPem);
    process.env.ARCA_KEY_SECRET = "otro-secreto-distinto";
    expect(() => descifrar(enc)).toThrow();
    process.env.ARCA_KEY_SECRET = "secreto-de-prueba-largo";
  });
});
