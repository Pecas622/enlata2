// Constantes del negocio, portadas del prototipo.
export const KINDS = ["iPhone", "iPad", "Mac", "Watch", "AirPods"] as const;
export type Kind = (typeof KINDS)[number];

export const MODELS: Record<Kind, string[]> = {
  iPhone: ["iPhone 11", "iPhone 12", "iPhone 13", "iPhone 14", "iPhone 14 Pro", "iPhone 15", "iPhone 15 Pro", "iPhone 15 Pro Max", "iPhone 16", "iPhone 16 Pro"],
  iPad: ["iPad 9", "iPad 10", "iPad Air M1", "iPad Pro 11"],
  Mac: ["MacBook Air M1", "MacBook Air M2", "MacBook Pro 14 M3"],
  Watch: ["Watch SE", "Watch Series 9", "Watch Ultra 2"],
  AirPods: ["AirPods 3", "AirPods Pro 2"],
};

export const CAPACITIES: Record<Kind, number[]> = { iPhone: [64, 128, 256, 512, 1024], iPad: [64, 128, 256, 512], Mac: [256, 512, 1024], Watch: [0], AirPods: [0] };
export const COLORS = ["Negro", "Blanco", "Plata", "Azul", "Rojo", "Verde", "Rosa", "Titanio natural", "Titanio negro", "Dorado"];
export const CONDITIONS = ["Nuevo sellado", "Usado A", "Usado B", "Reacondicionado"] as const;
export type Condition = (typeof CONDITIONS)[number];
export const GRADE_NOTES: Partial<Record<Condition, string>> = { "Usado A": "Sin marcas visibles", "Usado B": "Marcas leves de uso" };
export const DEVICE_STATUSES = ["Disponible", "Reservado", "En reparación", "Vendido", "Retirado"] as const;
export type DeviceStatus = (typeof DEVICE_STATUSES)[number];
export const ORIGINS = ["Compra a particular", "Proveedor", "Otro"] as const;
export type Origin = (typeof ORIGINS)[number] | "Canje";
export const DEFECTS = ["Pantalla dañada", "Tapa trasera rota", "Cámara con falla", "Face ID / Touch ID no funciona", "Botones con falla", "Puerto de carga con falla", "Parlante / micrófono con falla"];

export const METHODS = [
  { id: "Efectivo USD", cur: "USD", cash: true },
  { id: "Efectivo ARS", cur: "ARS", cash: true },
  { id: "Transferencia ARS", cur: "ARS", cash: false },
  { id: "Tarjeta", cur: "ARS", cash: false },
  { id: "Mercado Pago", cur: "ARS", cash: false },
] as const;
export type Currency = "USD" | "ARS";
export type MethodId = (typeof METHODS)[number]["id"];
export function methodOf(id: string) {
  return METHODS.find((m) => m.id === id) ?? METHODS[0];
}

export const hasBattery = (kind: Kind) => kind === "iPhone" || kind === "iPad" || kind === "Mac";
export const usesIMEI = (kind: Kind) => kind === "iPhone" || kind === "iPad";

export function validIMEI(s: string) {
  return /^\d{15}$/.test(s.trim());
}

// iPhone y iPad llevan IMEI de 15 dígitos; el resto, número de serie de al menos 6 caracteres.
export function idLooksOk(kind: Kind, imei: string) {
  return usesIMEI(kind) ? validIMEI(imei) : imei.trim().length >= 6;
}

export function deviceShort(d: { model: string; capacity: number }) {
  return `${d.model}${d.capacity ? ` ${d.capacity}GB` : ""}`;
}

export function deviceTitle(d: { model: string; capacity: number; color?: string }) {
  return `${deviceShort(d)}${d.color ? ` · ${d.color}` : ""}`;
}
