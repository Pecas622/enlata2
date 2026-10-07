// Reportes y dashboard, portados de ReportsPage y Dashboard del prototipo. Todo en USD con la
// cotización de cada venta. Los costos solo llegan para Administrador y Encargado (RLS);
// para el resto vienen vacíos y estas funciones no muestran ganancia.
import type { Currency } from "./catalog";
import { localDay } from "./dates";
import { toUSD } from "./money";

export type ReportLine = { kind: "device" | "acc" | "service"; device_kind: string | null; description: string; qty: number; unit_price: number; currency: Currency; cost: { unit_cost: number; currency: Currency } | null };
export type ReportSale = {
  id: string; number: string; at: string; status: string; client_name: string; seller_id: string | null; seller_name: string;
  fx: number; total_usd: number; discount_usd: number; trade_in_usd: number; lines: ReportLine[];
};

export const PERIODS = ["Hoy", "7 días", "30 días", "Todo"] as const;
export type Period = (typeof PERIODS)[number];

export function addDays(day: string, n: number) {
  const d = new Date(day + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

// Primer día local del período.
export function periodFrom(period: Period, today = localDay()) {
  if (period === "Hoy") return today;
  if (period === "7 días") return addDays(today, -6);
  if (period === "30 días") return addDays(today, -29);
  return "0000-01-01";
}

export function saleCost(s: ReportSale) {
  return s.lines.reduce((a, l) => a + (l.cost ? toUSD(l.cost.unit_cost * l.qty, l.cost.currency, s.fx) : 0), 0);
}

export const closed = (sales: ReportSale[]) => sales.filter((s) => s.status === "Cerrada");
export const inPeriod = (sales: ReportSale[], from: string, to = "9999-12-31") =>
  sales.filter((s) => { const d = localDay(s.at); return d >= from && d <= to; });

export type Seller = { id: string; name: string; role: string; commission_pct: number };

// Facturado = total de la venta después del descuento (el canje es parte del pago, no resta facturación).
export function salesReport(sales: ReportSale[], sellers: Seller[]) {
  const ss = closed(sales);
  const rev = ss.reduce((a, s) => a + s.total_usd, 0);
  const cost = ss.reduce((a, s) => a + saleCost(s), 0);
  const canjes = ss.filter((s) => s.trade_in_usd > 0).length;
  const bySeller = sellers
    .filter((u) => u.role !== "Cajero")
    .map((u) => {
      const mine = ss.filter((s) => s.seller_id === u.id);
      const r = mine.reduce((a, s) => a + s.total_usd, 0);
      return { id: u.id, name: u.name, n: mine.length, rev: r, profit: r - mine.reduce((a, s) => a + saleCost(s), 0), commission: (r * u.commission_pct) / 100 };
    })
    .filter((x) => x.n > 0);
  const cats = new Map<string, number>();
  for (const s of ss) {
    for (const l of s.lines) {
      const k = l.kind === "device" ? (l.device_kind ?? "Equipos") : l.kind === "acc" ? "Accesorios" : "Servicios";
      cats.set(k, (cats.get(k) ?? 0) + toUSD(l.unit_price * l.qty, l.currency, s.fx));
    }
  }
  const gross = [...cats.values()].reduce((a, v) => a + v, 0);
  const byCategory = [...cats.entries()].map(([k, v]) => ({ k, v, pct: gross ? Math.round((v / gross) * 100) : 0 })).sort((a, b) => b.v - a.v);
  return {
    count: ss.length, rev, cost, profit: rev - cost, margin: rev ? Math.round(((rev - cost) / rev) * 100) : 0,
    avgTicket: ss.length ? rev / ss.length : 0, canjes, canjesPct: ss.length ? Math.round((canjes / ss.length) * 100) : 0, bySeller, byCategory,
  };
}

// Barras de los últimos 7 días (facturado por día local).
export function last7Days(sales: ReportSale[], today = localDay()) {
  const ss = closed(sales);
  return Array.from({ length: 7 }, (_, i) => {
    const day = addDays(today, i - 6);
    const label = new Date(day + "T12:00:00Z").toLocaleDateString("es-AR", { weekday: "short", timeZone: "UTC" });
    return { day, label, value: Math.round(ss.filter((s) => localDay(s.at) === day).reduce((a, s) => a + s.total_usd, 0)) };
  });
}

export function salesCSVRows(sales: ReportSale[], seeCost: boolean) {
  return closed(sales).map((s) => ({
    Numero: s.number, Fecha: localDay(s.at), Cliente: s.client_name, Vendedor: s.seller_name,
    TotalUSD: Math.round(s.total_usd), CanjeUSD: Math.round(s.trade_in_usd),
    ...(seeCost ? { GananciaUSD: Math.round(s.total_usd - saleCost(s)) } : {}),
  }));
}

export function toCSV(rows: Record<string, string | number>[]) {
  if (!rows.length) return "";
  const headers = Object.keys(rows[0]);
  return [headers.join(","), ...rows.map((r) => headers.map((h) => `"${String(r[h] ?? "").replace(/"/g, '""')}"`).join(","))].join("\n");
}
