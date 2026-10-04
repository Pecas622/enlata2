import { describe, expect, it } from "vitest";
import type { AppraisalConfig } from "./appraise";
import { paymentsUSD, restFor, saleProblems, saleTotals, tradeInState, type CartLine, type TradeInDraft } from "./sale";

const fx = 1200;
const cfg: AppraisalConfig = {
  baseValues: [{ model: "iPhone 13", capacity: 128, value: 370 }],
  condMult: { "Usado A": 1, "Usado B": 0.9 },
  defectCosts: { "Pantalla dañada": 90 },
  targetMargin: 0.12,
};
const line = (unit: number, currency: "USD" | "ARS", qty = 1): CartLine => ({ kind: currency === "USD" ? "device" : "acc", refId: String(unit), desc: "x", qty, unit, currency, maxQty: 9 });
const draft = (patch: Partial<TradeInDraft> = {}): TradeInDraft => ({
  kind: "iPhone", model: "iPhone 13", capacity: 128, cond: "Usado B", battery: 86, defects: [], icloudFree: true, imeiClean: true, imei: "359000000000001", ...patch,
});

describe("saleTotals", () => {
  it("suma equipos en USD y accesorios en ARS convertidos, y aplica el descuento", () => {
    const t = saleTotals([line(550, "USD"), line(6000, "ARS", 2)], 10, fx);
    expect(t.sub).toBeCloseTo(560);
    expect(t.discount).toBeCloseTo(56);
    expect(t.revenue).toBeCloseTo(504);
  });
});

describe("pagos", () => {
  it("convierte cada medio a USD", () => {
    expect(paymentsUSD([{ method: "Efectivo USD", amount: "100" }, { method: "Transferencia ARS", amount: "120000" }], fx)).toBeCloseTo(200);
  });

  it("completa el saldo en la moneda del medio", () => {
    const pays = [{ method: "Efectivo USD", amount: "300" }, { method: "Transferencia ARS", amount: "" }];
    expect(restFor(pays, 1, 556.67, fx)).toBe(308004);
    expect(restFor([{ method: "Efectivo USD", amount: "" }], 0, 556.666, fx)).toBe(556.67);
  });
});

describe("tradeInState", () => {
  it("usa la tasación como valor por defecto", () => {
    const st = tradeInState(draft(), cfg, "", false, false);
    expect(st).toMatchObject({ valid: true, value: 320 });
  });

  it("el vendedor no puede tomar por encima de la tasación; el encargado sí", () => {
    expect(tradeInState(draft(), cfg, "400", false, false).errors[0]).toContain("por encima de US$");
    expect(tradeInState(draft(), cfg, "400", true, false).valid).toBe(true);
  });

  it("rechaza iCloud activo, IMEI inválido o repetido y modelos sin referencia sin valor manual", () => {
    expect(tradeInState(draft({ icloudFree: false }), cfg, "", true, false).errors).toContain("Equipo con bloqueo de iCloud o Buscar mi iPhone activo. No se puede tomar.");
    expect(tradeInState(draft({ imei: "123" }), cfg, "", true, false).errors[0]).toBe("Ingresá un IMEI / serie válido.");
    expect(tradeInState(draft(), cfg, "", true, true).errors).toContain("El IMEI ya está en stock.");
    expect(tradeInState(draft({ model: "iPhone 11" }), cfg, "", true, false).errors[0]).toBe("Sin valor de referencia: ingresá el valor a mano.");
    expect(tradeInState(draft({ model: "iPhone 11" }), cfg, "150", true, false).valid).toBe(true);
  });
});

describe("saleProblems", () => {
  const base = { shiftOpen: true, lines: [line(550, "USD")], discountPct: "", maxDiscount: 5, editPrice: false, tradeIn: null, due: 550, paid: 550, seller: "x" };

  it("una venta cobrada completa no tiene problemas", () => {
    expect(saleProblems(base)).toEqual([]);
  });

  it("avisa caja cerrada, descuento del rol, saldo y vuelto", () => {
    expect(saleProblems({ ...base, shiftOpen: false })[0]).toBe("No hay caja abierta. Abrí la caja para registrar ventas.");
    expect(saleProblems({ ...base, discountPct: "8" })[0]).toBe("Tu rol permite hasta 5% de descuento.");
    expect(saleProblems({ ...base, discountPct: "8", editPrice: true })).toEqual([]);
    expect(saleProblems({ ...base, paid: 500 })[0]).toMatch(/^Falta cobrar US\$\s?50\.$/);
    expect(saleProblems({ ...base, paid: 600 })[0]).toMatch(/^Hay US\$\s?50 de más/);
    expect(saleProblems({ ...base, due: -20, paid: 0 })[0]).toBe("El valor del canje supera el total de la compra.");
  });
});
