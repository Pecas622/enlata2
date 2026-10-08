// Cobro del plan y de los módulos con suscripciones mensuales de Mercado Pago (preapproval).
// Lógica pura: precios, estados, referencia externa y firma de las notificaciones.
import { MODULES, type ModuleId } from "./modules";

export const ITEMS = ["base", ...MODULES] as const;
export type Item = (typeof ITEMS)[number];
export type SubStatus = "pendiente" | "activa" | "pausada" | "cancelada";
export type Prices = Record<Item, number>;

export const isItem = (x: unknown): x is Item => typeof x === "string" && (ITEMS as readonly string[]).includes(x);
export const isModule = (x: unknown): x is ModuleId => typeof x === "string" && (MODULES as readonly string[]).includes(x);

export function parsePrices(rows: { item: string; price_ars: number | string }[] | null): Prices {
  const out = {} as Prices;
  for (const it of ITEMS) out[it] = 0;
  for (const r of rows ?? []) if (isItem(r.item)) out[r.item] = Number(r.price_ars) || 0;
  return out;
}

// Estado de Mercado Pago (pending, authorized, paused, cancelled) al de la base.
export function mpStatus(s: unknown): SubStatus | null {
  switch (s) {
    case "pending": return "pendiente";
    case "authorized": return "activa";
    case "paused": return "pausada";
    case "cancelled": return "cancelada";
    default: return null;
  }
}

// La suscripción viaja con "local:<id>:<item>" para saber a qué local y qué ítem corresponde.
export const externalRef = (storeId: string, item: Item) => `local:${storeId}:${item}`;

export function parseExternalRef(ref: unknown): { storeId: string; item: Item } | null {
  const m = typeof ref === "string" ? /^local:([0-9a-f-]{36}):([a-z]+)$/.exec(ref) : null;
  return m && isItem(m[2]) ? { storeId: m[1], item: m[2] } : null;
}

// Datos del alta, validados antes de crear la cuenta.
export type Signup = { store: string; slug: string; name: string; email: string; password: string; pin: string };

export function signupProblems(s: Signup): string[] {
  const p: string[] = [];
  if (!s.store.trim()) p.push("Escribí el nombre del local.");
  if (!/^[a-z0-9]([a-z0-9-]{1,38}[a-z0-9])?$/.test(s.slug)) p.push("El link tiene que tener entre 3 y 40 letras minúsculas, números o guiones.");
  if (!s.name.trim()) p.push("Escribí tu nombre.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.email.trim())) p.push("Revisá el email.");
  if (s.password.length < 8) p.push("La contraseña tiene que tener al menos 8 caracteres.");
  if (!/^\d{4}$/.test(s.pin)) p.push("El PIN tiene que tener 4 números.");
  return p;
}

export const slugify = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
