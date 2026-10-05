import { describe, expect, it } from "vitest";
import { isLow, parseBulk, stockTone } from "./accessories";

describe("parseBulk", () => {
  it("lee nombre, categoría, costo, precio y stock; descarta líneas sin precio", () => {
    const { parsed, valid } = parseBulk("Funda silicona iPhone 16; Fundas; 3800; 12500; 10\n\nVidrio raro; Vidrios; 1300; ; 20\nCosa; Inventada; 100; 900; 2");
    expect(parsed).toHaveLength(3);
    expect(valid).toEqual([
      { name: "Funda silicona iPhone 16", category: "Fundas", cost: 3800, price: 12500, stock: 10 },
      { name: "Cosa", category: "Otros", cost: 100, price: 900, stock: 2 },
    ]);
  });
});

describe("alertas de stock", () => {
  it("marca en o por debajo del mínimo, y sin stock en rojo", () => {
    expect(isLow({ stock: 3, min_stock: 3 })).toBe(true);
    expect(isLow({ stock: 3, min_stock: 0 })).toBe(false);
    expect(stockTone({ stock: 0, min_stock: 2 })).toBe("red");
    expect(stockTone({ stock: 2, min_stock: 2 })).toBe("amber");
    expect(stockTone({ stock: 9, min_stock: 2 })).toBe("green");
  });
});
