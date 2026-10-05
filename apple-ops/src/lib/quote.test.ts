import { describe, expect, it } from "vitest";
import { appraise } from "./appraise";
import { capacitiesFor, modelName, quote, quoteMessage, versionsFor, type PublicValue } from "./quote";

const values: PublicValue[] = [
  { model: "iPhone 13", capacity: 128, value_usd: 370, mult_usado_a: 1 },
  { model: "iPhone 14 Pro", capacity: 256, value_usd: 660, mult_usado_a: 1 },
  { model: "iPhone 13 Mini", capacity: 128, value_usd: 300, mult_usado_a: 0.95 },
];

describe("modelos", () => {
  it("arma el nombre como en la tabla de tasación", () => {
    expect(modelName("13", "Base")).toBe("iPhone 13");
    expect(modelName("13", "Mini")).toBe("iPhone 13 mini");
    expect(modelName("15", "Pro Max")).toBe("iPhone 15 Pro Max");
  });
  it("ofrece solo versiones y capacidades que existieron", () => {
    expect(versionsFor("11")).toEqual(["Base", "Pro", "Pro Max"]);
    expect(versionsFor("12")).toContain("Mini");
    expect(versionsFor("15")).toContain("Plus");
    expect(capacitiesFor("15", "Pro Max")).toEqual([256, 512, 1024]);
    expect(capacitiesFor("12", "Base")).toEqual([64, 128, 256]);
  });
});

describe("quote", () => {
  it("da el valor de appraise() para un Usado A sin fallas", () => {
    const q = quote(values, "13", "Base", 128, "90");
    expect(q).toEqual({ model: "iPhone 13", capacity: 128, battery: "90% o más", ok: true, value: 370 });
    const ap = appraise({ baseValues: [{ model: "iPhone 13", capacity: 128, value: 370 }], condMult: { "Usado A": 1 }, defectCosts: {}, targetMargin: 0 }, { model: "iPhone 13", capacity: 128, cond: "Usado A", battery: 79 });
    expect(quote(values, "13", "Base", 128, "79")).toMatchObject({ ok: true, value: ap.value });
  });

  it("penaliza la batería como appraise: 3% entre 80 y 89, 8% bajo 80", () => {
    expect(quote(values, "14", "Pro", 256, "80")).toMatchObject({ value: 640 }); // 660 − 20
    expect(quote(values, "14", "Pro", 256, "79")).toMatchObject({ value: 605 }); // 660 − 53 = 607 → 605
  });

  it("aplica el multiplicador de Usado A del local y no distingue mayúsculas en el modelo", () => {
    expect(quote(values, "13", "Mini", 128, "90")).toMatchObject({ ok: true, value: 285 });
  });

  it("sin valor de referencia deriva a un asesor", () => {
    const q = quote(values, "16", "Pro", 512, "90");
    expect(q).toEqual({ model: "iPhone 16 Pro", capacity: 512, battery: "90% o más", ok: false, reason: "sin-valor" });
    expect(quoteMessage(q)).toBe("Hola! Quiero cotizar mi iPhone 16 Pro de 512 GB con batería 90% o más para plan canje.");
  });

  it("el mensaje de WhatsApp lleva el valor orientativo", () => {
    expect(quoteMessage(quote(values, "13", "Base", 128, "80"))).toContain("vale hasta US$ 360");
  });
});
