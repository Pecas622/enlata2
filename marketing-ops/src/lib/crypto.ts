// Cifrado de los tokens de las redes (AES-256-GCM). La clave sale de TOKENS_KEY (32 bytes en base64) y vive solo en el
// servidor: la base guarda el token cifrado, así que una copia de la base sola no alcanza para usarlo.
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

function key(raw = process.env.TOKENS_KEY): Buffer {
  const k = raw ? Buffer.from(raw, "base64") : Buffer.alloc(0);
  if (k.length !== 32) throw new Error("TOKENS_KEY tiene que ser una clave de 32 bytes en base64.");
  return k;
}

export const hasTokensKey = (raw = process.env.TOKENS_KEY) => {
  try {
    key(raw);
    return true;
  } catch {
    return false;
  }
};

// "v1.<iv>.<tag>.<datos>", todo en base64url.
export function encrypt(plain: string, raw?: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key(raw), iv);
  const data = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return ["v1", iv.toString("base64url"), c.getAuthTag().toString("base64url"), data.toString("base64url")].join(".");
}

export function decrypt(box: string, raw?: string): string {
  const [v, iv, tag, data] = box.split(".");
  if (v !== "v1" || !iv || !tag || !data) throw new Error("Token cifrado con un formato desconocido.");
  const d = createDecipheriv("aes-256-gcm", key(raw), Buffer.from(iv, "base64url"));
  d.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([d.update(Buffer.from(data, "base64url")), d.final()]).toString("utf8");
}
