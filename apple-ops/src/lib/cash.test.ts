import { describe, expect, it } from "vitest";
import { closeState, nonCashTotal, shiftHasDiff, type BreakdownRow } from "./cash";

const row = (method: string, net: number): BreakdownRow => ({ method, cur: method === "Efectivo USD" ? "USD" : "ARS", cash: method.startsWith("Efectivo"), inc: net, out: 0, net });

describe("nonCashTotal", () => {
  it("suma solo transferencia, tarjeta y Mercado Pago", () => {
    expect(nonCashTotal([row("Efectivo USD", 500), row("Efectivo ARS", 90000), row("Transferencia ARS", 100000), row("Tarjeta", 20000), row("Mercado Pago", 5000)])).toBe(125000);
    expect(nonCashTotal(null)).toBe(0);
  });
});

describe("closeState", () => {
  const base = { blind: false, expectedArs: 50000, expectedUsd: 300, countedArs: "", countedUsd: "", note: "" };

  it("sin los dos conteos no se puede confirmar", () => {
    expect(closeState({ ...base, countedArs: "50000" })).toMatchObject({ filled: false, canConfirm: false, hasDiff: false });
  });

  it("si cuadra se confirma sin motivo", () => {
    expect(closeState({ ...base, countedArs: "50000", countedUsd: "300" })).toMatchObject({ diffArs: 0, diffUsd: 0, hasDiff: false, canConfirm: true });
  });

  it("con diferencia exige motivo", () => {
    const s = closeState({ ...base, countedArs: "49900", countedUsd: "310" });
    expect(s).toMatchObject({ diffArs: -100, diffUsd: 10, needNote: true, canConfirm: false });
    expect(closeState({ ...base, countedArs: "49900", countedUsd: "310", note: "Faltante" }).canConfirm).toBe(true);
  });

  it("el cajero cuenta a ciegas: no hay diferencia ni motivo obligatorio", () => {
    const s = closeState({ ...base, blind: true, expectedArs: null, expectedUsd: null, countedArs: "1", countedUsd: "0" });
    expect(s).toMatchObject({ diffArs: null, diffUsd: null, needNote: false, canConfirm: true });
  });

  it("no acepta conteos negativos", () => {
    expect(closeState({ ...base, countedArs: "-1", countedUsd: "300", note: "x" }).canConfirm).toBe(false);
  });
});

describe("shiftHasDiff", () => {
  it("detecta diferencias en cualquiera de las monedas", () => {
    expect(shiftHasDiff({ diff_ars: 0, diff_usd: 0 })).toBe(false);
    expect(shiftHasDiff({ diff_ars: 0, diff_usd: -5 })).toBe(true);
  });
});
