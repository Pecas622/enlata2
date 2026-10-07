// Caja: reglas del arqueo, portadas de CashPage del prototipo. El servidor (cerrar_caja) es quien manda;
// esto arma lo que ve cada rol mientras cuenta.
import { methodOf } from "./catalog";

export const MOVE_CONCEPTS = ["Retiro a caja fuerte", "Gastos del local", "Pago a proveedor", "Adelanto", "Ingreso manual", "Otro"] as const;

export type BreakdownRow = { method: string; cur: "USD" | "ARS"; cash: boolean; inc: number; out: number; net: number };

// Lo cobrado por medios que no son efectivo (transferencia, tarjeta, MP), siempre en pesos.
export function nonCashTotal(breakdown: BreakdownRow[] | null | undefined) {
  return (breakdown ?? []).filter((b) => !methodOf(b.method).cash).reduce((a, b) => a + Number(b.net), 0);
}

export type CloseInput = { blind: boolean; expectedArs: number | null; expectedUsd: number | null; countedArs: string; countedUsd: string; note: string };

// Estado del formulario de cierre. El Cajero no ve diferencia ni está obligado a explicarla.
export function closeState({ blind, expectedArs, expectedUsd, countedArs, countedUsd, note }: CloseInput) {
  const filled = countedArs.trim() !== "" && countedUsd.trim() !== "";
  const negative = Number(countedArs) < 0 || Number(countedUsd) < 0;
  if (blind || expectedArs == null || expectedUsd == null) {
    return { filled, diffArs: null, diffUsd: null, hasDiff: false, needNote: false, canConfirm: filled && !negative };
  }
  const diffArs = (Number(countedArs) || 0) - expectedArs;
  const diffUsd = (Number(countedUsd) || 0) - expectedUsd;
  const hasDiff = filled && (diffArs !== 0 || diffUsd !== 0);
  return { filled, diffArs, diffUsd, hasDiff, needNote: hasDiff, canConfirm: filled && !negative && (!hasDiff || note.trim() !== "") };
}

export const shiftHasDiff = (s: { diff_ars: number | null; diff_usd: number | null }) => Number(s.diff_ars) !== 0 || Number(s.diff_usd) !== 0;
