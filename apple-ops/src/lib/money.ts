import type { Currency } from "./catalog";

// Única conversión a dólares del sistema: equipos en USD, accesorios en ARS.
export function toUSD(amount: number, cur: Currency, fx: number) {
  const n = Number(amount) || 0;
  return cur === "USD" ? n : n / (fx || 1);
}

export function fmtUSD(n: number) {
  return (Number(n) || 0).toLocaleString("es-AR", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

export function fmtARS(n: number) {
  return (Number(n) || 0).toLocaleString("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 });
}

export function fmtCur(n: number, cur: Currency) {
  return cur === "USD" ? fmtUSD(n) : fmtARS(n);
}
