// Verificación de las notificaciones de Mercado Pago. Solo corre en el servidor.
import { createHmac, timingSafeEqual } from "node:crypto";

// Firma de las notificaciones (header x-signature "ts=...,v1=..."): HMAC-SHA256 del manifiesto
// "id:<data.id>;request-id:<x-request-id>;ts:<ts>;" con la clave secreta del webhook.
export function validSignature(secret: string, signature: string | null, requestId: string | null, dataId: string): boolean {
  if (!signature) return false;
  const parts = Object.fromEntries(signature.split(",").map((p) => p.trim().split("=", 2) as [string, string]));
  if (!parts.ts || !parts.v1) return false;
  const id = /^[a-z0-9]+$/i.test(dataId) ? dataId.toLowerCase() : dataId;
  const manifest = `id:${id};${requestId ? `request-id:${requestId};` : ""}ts:${parts.ts};`;
  const expected = createHmac("sha256", secret).update(manifest).digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(parts.v1);
  return a.length === b.length && timingSafeEqual(a, b);
}
