import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { externalRef, mpStatus, parseExternalRef, parsePrices, signupProblems, slugify } from "./billing";
import { validSignature } from "./mp-signature";

const STORE = "00000000-0000-4000-8000-000000000001";

describe("cobro con Mercado Pago", () => {
  it("traduce los estados de la suscripción", () => {
    expect(mpStatus("pending")).toBe("pendiente");
    expect(mpStatus("authorized")).toBe("activa");
    expect(mpStatus("paused")).toBe("pausada");
    expect(mpStatus("cancelled")).toBe("cancelada");
    expect(mpStatus("otro")).toBeNull();
  });

  it("arma y lee la referencia del local y el ítem", () => {
    expect(externalRef(STORE, "reportes")).toBe(`local:${STORE}:reportes`);
    expect(parseExternalRef(externalRef(STORE, "base"))).toEqual({ storeId: STORE, item: "base" });
    expect(parseExternalRef(`local:${STORE}:whatsapp`)).toBeNull();
    expect(parseExternalRef("cualquier cosa")).toBeNull();
    expect(parseExternalRef(undefined)).toBeNull();
  });

  it("lee los precios e ignora ítems desconocidos", () => {
    const p = parsePrices([{ item: "base", price_ars: "50000.00" }, { item: "imei", price_ars: 10000 }, { item: "otro", price_ars: 1 }]);
    expect(p.base).toBe(50000);
    expect(p.imei).toBe(10000);
    expect(p.reportes).toBe(0);
    expect(p).not.toHaveProperty("otro");
  });

  it("verifica la firma de las notificaciones", () => {
    const secret = "secreto";
    const v1 = createHmac("sha256", secret).update("id:abc123;request-id:req-1;ts:1700;").digest("hex");
    expect(validSignature(secret, `ts=1700,v1=${v1}`, "req-1", "ABC123")).toBe(true);
    expect(validSignature(secret, `ts=1701,v1=${v1}`, "req-1", "abc123")).toBe(false);
    expect(validSignature("otro", `ts=1700,v1=${v1}`, "req-1", "abc123")).toBe(false);
    expect(validSignature(secret, null, "req-1", "abc123")).toBe(false);
    expect(validSignature(secret, "basura", "req-1", "abc123")).toBe(false);
  });
});

describe("alta desde la web", () => {
  const ok = { store: "Mi Local", slug: "mi-local", name: "Ana", email: "ana@local.com", password: "12345678", pin: "1234" };

  it("acepta datos completos", () => {
    expect(signupProblems(ok)).toEqual([]);
  });

  it("explica cada problema", () => {
    expect(signupProblems({ store: " ", slug: "A", name: "", email: "ana", password: "123", pin: "12a4" })).toEqual([
      "Escribí el nombre del local.",
      "El link tiene que tener entre 3 y 40 letras minúsculas, números o guiones.",
      "Escribí tu nombre.",
      "Revisá el email.",
      "La contraseña tiene que tener al menos 8 caracteres.",
      "El PIN tiene que tener 4 números.",
    ]);
  });

  it("propone el link a partir del nombre", () => {
    expect(slugify("Ñandú Store · Córdoba!")).toBe("nandu-store-cordoba");
    expect(slugify("  --iPhone  Club--  ")).toBe("iphone-club");
    expect(slugify("x".repeat(60))).toHaveLength(40);
  });
});
