// Certificado de ARCA del local: clave privada y pedido de certificado (CSR), firma del pedido de acceso
// (CMS) y cifrado de la clave para guardarla en la base. Solo en el servidor.
import { createCipheriv, createDecipheriv, createHash, generateKeyPairSync, randomBytes } from "node:crypto";
import forge from "node-forge";

// Genera la clave privada y el pedido de certificado que el local sube en "Administración de
// certificados digitales" de ARCA. El CUIT va en serialNumber, como lo pide ARCA.
export function generarClaveYCsr(p: { cuit: string; razonSocial: string; alias: string }) {
  // La clave la genera Node (forge en JavaScript tarda segundos); forge arma y firma el pedido.
  const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const keyPem = privateKey.export({ type: "pkcs1", format: "pem" }).toString();
  const key = forge.pki.privateKeyFromPem(keyPem) as forge.pki.rsa.PrivateKey;
  const csr = forge.pki.createCertificationRequest();
  csr.publicKey = forge.pki.setRsaPublicKey(key.n, key.e);
  csr.setSubject([
    { shortName: "C", value: "AR" },
    { shortName: "O", value: p.razonSocial },
    { shortName: "CN", value: p.alias },
    { name: "serialNumber", value: `CUIT ${p.cuit}` },
  ]);
  csr.sign(key, forge.md.sha256.create());
  return { keyPem, csrPem: forge.pki.certificationRequestToPem(csr) };
}

export type CertInfo = { vence: Date; cuit: string | null; coincide: boolean };

// Lee el certificado que devuelve ARCA y controla que sea de la clave que generamos.
export function leerCertificado(certPem: string, keyPem: string): CertInfo {
  let cert: forge.pki.Certificate;
  try {
    cert = forge.pki.certificateFromPem(certPem.trim());
  } catch {
    throw new Error("El archivo no es un certificado válido. Subí el .crt que te dio ARCA.");
  }
  const key = forge.pki.privateKeyFromPem(keyPem);
  const pub = cert.publicKey as forge.pki.rsa.PublicKey;
  const coincide = pub.n.equals(key.n) && pub.e.equals(key.e);
  const serial = cert.subject.getField({ name: "serialNumber" })?.value as string | undefined;
  return { vence: cert.validity.notAfter, cuit: serial?.match(/\d{11}/)?.[0] ?? null, coincide };
}

// Firma el pedido de acceso (TRA) como CMS con el certificado adentro, en base64, para loginCms.
export function firmarTRA(tra: string, certPem: string, keyPem: string) {
  const p7 = forge.pkcs7.createSignedData();
  p7.content = forge.util.createBuffer(tra, "utf8");
  const cert = forge.pki.certificateFromPem(certPem);
  p7.addCertificate(cert);
  p7.addSigner({
    key: forge.pki.privateKeyFromPem(keyPem),
    certificate: cert,
    digestAlgorithm: forge.pki.oids.sha256,
    authenticatedAttributes: [
      { type: forge.pki.oids.contentType, value: forge.pki.oids.data },
      { type: forge.pki.oids.messageDigest },
      { type: forge.pki.oids.signingTime },
    ],
  });
  p7.sign();
  return forge.util.encode64(forge.asn1.toDer(p7.toAsn1()).getBytes());
}

// La clave privada se guarda cifrada con ARCA_KEY_SECRET (AES-256-GCM): sin esa variable del
// servidor, lo que hay en la base no sirve para firmar.
function secretKey() {
  const s = process.env.ARCA_KEY_SECRET;
  if (!s || s.length < 16) throw new Error("Falta configurar ARCA_KEY_SECRET en el servidor.");
  return createHash("sha256").update(s).digest();
}

export const cifradoConfigurado = () => (process.env.ARCA_KEY_SECRET ?? "").length >= 16;

export function cifrar(texto: string) {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", secretKey(), iv);
  const data = Buffer.concat([c.update(texto, "utf8"), c.final()]);
  return ["v1", iv.toString("base64"), c.getAuthTag().toString("base64"), data.toString("base64")].join(".");
}

export function descifrar(guardado: string) {
  const [v, iv, tagB64, data] = guardado.split(".");
  if (v !== "v1" || !iv || !tagB64 || !data) throw new Error("La clave guardada no tiene el formato esperado.");
  const d = createDecipheriv("aes-256-gcm", secretKey(), Buffer.from(iv, "base64"));
  d.setAuthTag(Buffer.from(tagB64, "base64"));
  return Buffer.concat([d.update(Buffer.from(data, "base64")), d.final()]).toString("utf8");
}
