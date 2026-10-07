// Alertas del local: equipos parados, equipos con precio por debajo del margen objetivo y ventas
// con margen bajo. Los márgenes solo se calculan si el rol ve costos (si no, llegan vacíos).
import { daysSince, localDay } from "./dates";
import { closed, saleCost, type ReportSale } from "./reports";

export type AlertDevice = { id: string; model: string; capacity: number; condition: string; entry_date: string; price_usd: number; cost_usd: number | null };

// Margen sobre el precio de venta: (precio − costo) / precio.
export function margin(price: number, cost: number) {
  return price > 0 ? (price - cost) / price : 0;
}

// Equipos disponibles que llevan `days` días o más en stock, los más viejos primero.
export function staleDevices(devs: AlertDevice[], days: number, today = localDay()) {
  return devs
    .map((d) => ({ ...d, days: daysSince(d.entry_date, today) }))
    .filter((d) => d.days >= days)
    .sort((a, b) => b.days - a.days);
}

// Equipos con costo cargado cuyo precio deja menos margen que el objetivo, los peores primero.
export function lowMarginDevices(devs: AlertDevice[], target: number) {
  return devs
    .filter((d) => d.cost_usd !== null && d.cost_usd > 0)
    .map((d) => ({ ...d, margin: margin(d.price_usd, d.cost_usd!) }))
    .filter((d) => d.margin < target)
    .sort((a, b) => a.margin - b.margin);
}

// Margen de una venta, o null si no hay costos a la vista (rol sin costos o venta sin costo cargado).
export function saleMargin(s: ReportSale) {
  if (s.total_usd <= 0 || !s.lines.some((l) => l.cost)) return null;
  return margin(s.total_usd, saleCost(s));
}

// Ventas cerradas con margen por debajo del objetivo, las peores primero.
export function lowMarginSales(sales: ReportSale[], target: number) {
  return closed(sales)
    .map((s) => ({ ...s, margin: saleMargin(s) }))
    .filter((s): s is ReportSale & { margin: number } => s.margin !== null && s.margin < target)
    .sort((a, b) => a.margin - b.margin);
}
