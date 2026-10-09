// Autoridad certificante de mentira para los tests: firma el pedido de certificado (CSR) como lo
// haría ARCA, con el CUIT en serialNumber.
import forge from "node-forge";

const caKeys = forge.pki.rsa.generateKeyPair({ bits: 1024, e: 0x10001 });
const ca = forge.pki.createCertificate();
ca.publicKey = caKeys.publicKey;
ca.serialNumber = "01";
ca.validity.notBefore = new Date(Date.now() - 86_400_000);
ca.validity.notAfter = new Date(Date.now() + 2 * 365 * 86_400_000);
ca.setSubject([{ shortName: "CN", value: "Computadores Test" }]);
ca.setIssuer([{ shortName: "CN", value: "Computadores Test" }]);
ca.sign(caKeys.privateKey, forge.md.sha256.create());

export function emitirCertificado(csrPem: string, days = 730) {
  const csr = forge.pki.certificationRequestFromPem(csrPem);
  const cert = forge.pki.createCertificate();
  cert.publicKey = csr.publicKey!;
  cert.serialNumber = Date.now().toString(16);
  cert.validity.notBefore = new Date(Date.now() - 60_000);
  cert.validity.notAfter = new Date(Date.now() + days * 86_400_000);
  cert.setSubject(csr.subject.attributes);
  cert.setIssuer(ca.subject.attributes);
  cert.sign(caKeys.privateKey, forge.md.sha256.create());
  return forge.pki.certificateToPem(cert);
}
