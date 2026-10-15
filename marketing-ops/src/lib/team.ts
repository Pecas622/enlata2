// Equipo: invitaciones y lo que se muestra de cada persona. Los permisos reales están en la base
// (invite_member, update_member, accept_invitation y RLS por marca); esto arma links y textos.
import { PRODUCT_NAME } from "./brand";
import type { Role } from "./roles";

export const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export function isEmail(s: string) {
  return EMAIL_RE.test(s.trim());
}

// El link que se manda por WhatsApp o mail. El origen sale del pedido (la dirección de la app en Vercel).
export function inviteLink(origin: string, token: string) {
  return `${origin.replace(/\/$/, "")}/registro?invitacion=${encodeURIComponent(token)}`;
}

export function inviteMessage(workspace: string, role: Role, link: string, product = PRODUCT_NAME) {
  return `Te invito a sumarte a ${workspace} en ${product} como ${role}. Entrá a este link, creá tu contraseña y listo: ${link}`;
}

// Solo un Revisor (el cliente de una agencia) puede ver algunas marcas; el resto del equipo ve todas.
export function brandsLabel(role: Role, brandIds: string[] | null, brands: { id: string; name: string }[]) {
  if (role !== "Revisor" || !brandIds || !brandIds.length) return "Todas las marcas";
  const names = brands.filter((b) => brandIds.includes(b.id)).map((b) => b.name);
  return names.length ? names.join(", ") : "Ninguna marca";
}

export function brandsFor(role: Role, picked: string[]): string[] | null {
  return role === "Revisor" && picked.length ? [...new Set(picked)] : null;
}

export function daysLeft(expiresAt: string, now = new Date()) {
  return Math.max(0, Math.ceil((Date.parse(expiresAt) - now.getTime()) / 86_400_000));
}
