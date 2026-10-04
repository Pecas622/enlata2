import { describe, expect, it } from "vitest";
import { appraise, suggestedResale, type AppraisalConfig } from "./appraise";

const cfg: AppraisalConfig = {
  targetMargin: 0.12,
  condMult: { "Usado A": 1, "Usado B": 0.9, Reacondicionado: 0.85 },
  defectCosts: { "Pantalla dañada": 90, "Tapa trasera rota": 35 },
  baseValues: [
    { model: "iPhone 12", capacity: 64, value: 240 },
    { model: "iPhone 13", capacity: 128, value: 370 },
    { model: "iPhone 15 Pro", capacity: 256, value: 840 },
  ],
};

describe("appraise", () => {
  it("canje del seed: iPhone 13 128 Usado B con batería 86%", () => {
    const ap = appraise(cfg, { model: "iPhone 13", capacity: 128, cond: "Usado B", battery: 86, defects: [] });
    expect(ap.lines.map((l) => l.amount)).toEqual([370, -37, -11]);
    expect(ap.value).toBe(320);
  });

  it("canje del seed: iPhone 12 64 Usado B, batería 81% y tapa rota", () => {
    const ap = appraise(cfg, { model: "iPhone 12", capacity: 64, cond: "Usado B", battery: 81, defects: ["Tapa trasera rota"] });
    expect(ap.value).toBe(175);
  });

  it("batería bajo 80% descuenta 8% del valor base", () => {
    const ap = appraise(cfg, { model: "iPhone 15 Pro", capacity: 256, cond: "Usado A", battery: 79 });
    expect(ap.lines).toEqual([
      { label: "Valor de referencia iPhone 15 Pro 256GB", amount: 840 },
      { label: "Batería al 79%", amount: -67 },
    ]);
    expect(ap.value).toBe(775);
  });

  it("nunca da negativo", () => {
    const ap = appraise(cfg, { model: "iPhone 12", capacity: 64, cond: "Reacondicionado", battery: 50, defects: ["Pantalla dañada", "Tapa trasera rota", "Pantalla dañada"] });
    expect(ap.value).toBe(0);
  });

  it("rechaza iCloud activo e IMEI bloqueado", () => {
    expect(appraise(cfg, { model: "iPhone 13", capacity: 128, cond: "Usado A", icloudFree: false })).toMatchObject({ ok: false, blocked: true });
    expect(appraise(cfg, { model: "iPhone 13", capacity: 128, cond: "Usado A", imeiClean: false })).toMatchObject({ ok: false, blocked: true });
  });

  it("sin valor de referencia pide cargarlo a mano", () => {
    const ap = appraise(cfg, { model: "iPhone 16", capacity: 128, cond: "Usado A" });
    expect(ap.ok).toBe(false);
    expect(ap.blocked).toBeUndefined();
  });

  it("precio de reventa sugerido con margen del 12%", () => {
    expect(suggestedResale(cfg, 320)).toBe(360);
  });
});
