import { describe, expect, it } from "vitest";
import { fetchVenta, fxFromQuote, fxUrl, isStale } from "./fx";

const reply = (status: number, body: unknown) => (async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;

describe("cotización automática", () => {
  it("usa el precio de venta más el ajuste, en pesos enteros", () => {
    expect(fxFromQuote(1234.5)).toBe(1235);
    expect(fxFromQuote(1200, 15)).toBe(1215);
    expect(fxFromQuote(1200, -20)).toBe(1180);
    expect(fxFromQuote(5, -100)).toBe(1);
  });

  it("se vuelve a consultar pasada media hora o si nunca se consultó", () => {
    const now = Date.parse("2026-10-07T12:00:00Z");
    expect(isStale(null, now)).toBe(true);
    expect(isStale("2026-10-07T11:45:00Z", now)).toBe(false);
    expect(isStale("2026-10-07T11:20:00Z", now)).toBe(true);
  });

  it("lee el precio de venta de DolarAPI y devuelve null si la respuesta no sirve", async () => {
    expect(fxUrl("bolsa")).toBe("https://dolarapi.com/v1/dolares/bolsa");
    expect(await fetchVenta("blue", reply(200, { compra: 1180, venta: 1210, casa: "blue" }))).toBe(1210);
    expect(await fetchVenta("blue", reply(500, {}))).toBeNull();
    expect(await fetchVenta("blue", reply(200, { venta: "nada" }))).toBeNull();
    expect(await fetchVenta("blue", (async () => { throw new Error("sin red"); }) as unknown as typeof fetch)).toBeNull();
  });
});
