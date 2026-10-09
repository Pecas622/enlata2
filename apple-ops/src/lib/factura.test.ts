import { describe, expect, it } from "vitest";
import { cbteTipo, cuitValido, docReceptor, fmtNumero, invoiceAmounts, letraFor, qrUrl, receptorError, saleTotalARS } from "./factura";

describe("factura", () => {
  it("elige la letra según el emisor y el receptor", () => {
    expect(letraFor("Monotributo", 5)).toBe("C");
    expect(letraFor("Monotributo", 1)).toBe("C");
    expect(letraFor("Responsable Inscripto", 5)).toBe("B");
    expect(letraFor("Responsable Inscripto", 4)).toBe("B");
    expect(letraFor("Responsable Inscripto", 1)).toBe("A");
    expect(letraFor("Responsable Inscripto", 6)).toBe("A");
  });

  it("usa los códigos de comprobante de ARCA", () => {
    expect([cbteTipo("A", "Factura"), cbteTipo("B", "Factura"), cbteTipo("C", "Factura")]).toEqual([1, 6, 11]);
    expect([cbteTipo("A", "Nota de crédito"), cbteTipo("B", "Nota de crédito"), cbteTipo("C", "Nota de crédito")]).toEqual([3, 8, 13]);
  });

  it("valida el dígito verificador del CUIT", () => {
    expect(cuitValido("20-11111111-2")).toBe(true);
    expect(cuitValido("20-11111111-3")).toBe(false);
    expect(cuitValido("20111111112")).toBe(true);
    expect(cuitValido("2011111111")).toBe(false);
  });

  it("identifica al receptor por CUIT, DNI o como consumidor final", () => {
    expect(docReceptor({ doc: "20-11111111-2" })).toEqual({ docTipo: 80, docNro: "20111111112" });
    expect(docReceptor({ doc: "30.123.456" })).toEqual({ docTipo: 96, docNro: "30123456" });
    expect(docReceptor({ doc: "" })).toEqual({ docTipo: 99, docNro: "0" });
  });

  it("pide CUIT y razón social cuando corresponde", () => {
    expect(receptorError("Responsable Inscripto", { condicion: 5, doc: "", nombre: "" })).toBeNull();
    expect(receptorError("Responsable Inscripto", { condicion: 5, doc: "30123456", nombre: "" })).toBeNull();
    expect(receptorError("Responsable Inscripto", { condicion: 1, doc: "30123456", nombre: "X" })).toMatch(/CUIT válido/);
    expect(receptorError("Responsable Inscripto", { condicion: 1, doc: "20111111112", nombre: "" })).toMatch(/razón social/);
    expect(receptorError("Responsable Inscripto", { condicion: 1, doc: "20111111112", nombre: "Acme SA" })).toBeNull();
    expect(receptorError("Monotributo", { condicion: 5, doc: "123", nombre: "" })).toMatch(/DNI/);
  });

  it("pasa la venta a pesos con la cotización y el descuento, sin restar el canje", () => {
    const total = saleTotalARS({ fx: 1200, discountPct: 10, lines: [
      { qty: 1, unitPrice: 800, currency: "USD" },
      { qty: 2, unitPrice: 15000, currency: "ARS" },
    ] });
    expect(total).toBe((800 * 1200 + 30000) * 0.9);
  });

  it("discrimina el IVA en A y B pero no en C", () => {
    expect(invoiceAmounts(121000, "B", 21)).toEqual({ neto: 100000, iva: 21000, total: 121000 });
    expect(invoiceAmounts(100, "A", 21)).toEqual({ neto: 82.64, iva: 17.36, total: 100 });
    expect(invoiceAmounts(100, "A", 10.5)).toEqual({ neto: 90.5, iva: 9.5, total: 100 });
    expect(invoiceAmounts(5000.555, "C", 21)).toEqual({ neto: 5000.56, iva: 0, total: 5000.56 });
  });

  it("numera como en el comprobante impreso", () => {
    expect(fmtNumero(3, 125)).toBe("00003-00000125");
    expect(fmtNumero(1, null)).toBe("00001---------");
  });

  it("arma el QR de ARCA", () => {
    const url = qrUrl({ fecha: "2026-10-08", cuit: "20111111112", ptoVta: 1, tipoCmp: 6, nroCmp: 12, importe: 121000,
      tipoDocRec: 99, nroDocRec: "0", cae: "76123456789012" });
    expect(url.startsWith("https://www.afip.gob.ar/fe/qr/?p=")).toBe(true);
    const data = JSON.parse(Buffer.from(url.split("p=")[1], "base64").toString());
    expect(data).toMatchObject({ ver: 1, fecha: "2026-10-08", cuit: 20111111112, ptoVta: 1, tipoCmp: 6, nroCmp: 12, importe: 121000,
      moneda: "PES", ctz: 1, tipoDocRec: 99, nroDocRec: 0, tipoCodAut: "E", codAut: 76123456789012 });
  });
});
