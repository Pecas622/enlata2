// Cálculos de la venta en pantalla, portados de saleTotals(), paymentsUSD() y tradeInState() del prototipo.
// La base vuelve a calcular y validar todo al confirmar (registrar_venta); esto es para mostrarlo antes.
import { appraise, type Appraisal, type AppraisalConfig, type AppraisalInput } from "./appraise";
import { idLooksOk, methodOf, type Currency, type Kind } from "./catalog";
import { fmtUSD, toUSD } from "./money";

export type CartLine = {
  kind: "device" | "acc" | "service";
  refId: string;
  desc: string;
  qty: number;
  unit: number;
  currency: Currency;
  maxQty: number;
};

export type Payment = { method: string; amount: string };

export function saleTotals(lines: Pick<CartLine, "unit" | "qty" | "currency">[], discountPct: number | string, fx: number) {
  const sub = lines.reduce((a, l) => a + toUSD(l.unit * l.qty, l.currency, fx), 0);
  const discount = sub * ((Number(discountPct) || 0) / 100);
  return { sub, discount, revenue: sub - discount };
}

export function paymentsUSD(payments: Payment[], fx: number) {
  return payments.reduce((a, p) => a + toUSD(Number(p.amount) || 0, methodOf(p.method).cur, fx), 0);
}

// Monto que completa el saldo en la moneda del medio de pago elegido.
export function restFor(payments: Payment[], i: number, due: number, fx: number) {
  const others = paymentsUSD(payments.filter((_, k) => k !== i), fx);
  const rest = Math.max(0, due - others);
  return methodOf(payments[i].method).cur === "USD" ? Math.round(rest * 100) / 100 : Math.round(rest * fx);
}

export type TradeInDraft = AppraisalInput & { kind: Kind; imei: string };

export type TradeInState = { ap: Appraisal; value: number; errors: string[]; valid: boolean };

export function tradeInState(
  draft: TradeInDraft,
  cfg: AppraisalConfig,
  valueStr: string,
  overTradeIn: boolean,
  duplicate: boolean,
  requireImei = true,
): TradeInState {
  const ap = appraise(cfg, draft);
  const value = valueStr === "" ? (ap.ok ? ap.value : 0) : Number(valueStr) || 0;
  const errors: string[] = [];
  if (!draft.model) errors.push("Elegí el modelo del equipo que entrega el cliente.");
  if ((requireImei || draft.imei) && !idLooksOk(draft.kind, draft.imei)) errors.push("Ingresá un IMEI / serie válido.");
  if (ap.blocked) errors.push(ap.reason!);
  if (!ap.ok && !ap.blocked && draft.model && valueStr === "") errors.push("Sin valor de referencia: ingresá el valor a mano.");
  if (duplicate) errors.push("El IMEI ya está en stock.");
  if (ap.ok && value > ap.value && !overTradeIn) errors.push(`Tu rol no permite tomar el equipo por encima de ${fmtUSD(ap.value)}. Pedí autorización al encargado.`);
  if (value <= 0 && !ap.blocked) errors.push("El valor tomado debe ser mayor a cero.");
  return { ap, value, errors, valid: errors.length === 0 };
}

export function saleProblems(s: {
  shiftOpen: boolean;
  lines: CartLine[];
  discountPct: string;
  maxDiscount: number;
  editPrice: boolean;
  tradeIn: TradeInState | null;
  due: number;
  paid: number;
  seller: string;
}) {
  const problems: string[] = [];
  const balance = s.due - s.paid;
  if (!s.shiftOpen) problems.push("No hay caja abierta. Abrí la caja para registrar ventas.");
  if (!s.lines.length) problems.push("Agregá al menos un producto.");
  if (!s.editPrice && Number(s.discountPct) > s.maxDiscount) problems.push(`Tu rol permite hasta ${s.maxDiscount}% de descuento.`);
  if (s.tradeIn && !s.tradeIn.valid) problems.push("Completá el equipo del plan canje: " + s.tradeIn.errors[0]);
  if (s.due < -0.5) problems.push("El valor del canje supera el total de la compra.");
  if (s.lines.length && balance > 0.5) problems.push(`Falta cobrar ${fmtUSD(balance)}.`);
  if (s.lines.length && s.paid - Math.max(s.due, 0) > 0.5) problems.push(`Hay ${fmtUSD(s.paid - Math.max(s.due, 0))} de más: ajustá los pagos.`);
  if (!s.seller) problems.push("Elegí el vendedor.");
  return problems;
}
