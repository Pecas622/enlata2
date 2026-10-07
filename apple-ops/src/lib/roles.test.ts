import { describe, expect, it } from "vitest";
import { PERM_MATRIX, ROLES, canOpen, navFor, permsFor } from "./roles";

describe("permsFor", () => {
  it("el vendedor no ve costos ni anula ventas", () => {
    const p = permsFor("Vendedor");
    expect(p.seeCost).toBe(false);
    expect(p.voidSale).toBe(false);
  });
  it("el cajero cuenta a ciegas", () => {
    expect(permsFor("Cajero").blindCount).toBe(true);
    expect(permsFor("Encargado").blindCount).toBe(false);
  });
  it("solo el administrador gestiona usuarios", () => {
    expect(permsFor("Administrador").manageUsers).toBe(true);
    expect(permsFor("Encargado").manageUsers).toBe(false);
  });
});

describe("menú por rol", () => {
  it("coincide con el prototipo", () => {
    expect(navFor("Cajero").map((i) => i.id)).toEqual(["dashboard", "ventas", "accesorios", "clientes", "caja"]);
    expect(navFor("Vendedor").map((i) => i.id)).toEqual(["dashboard", "ventas", "canje", "stock", "accesorios", "clientes"]);
    expect(navFor("Administrador")).toHaveLength(13);
  });
  it("bloquea secciones fuera del rol", () => {
    expect(canOpen("Vendedor", "caja")).toBe(false);
    expect(canOpen("Cajero", "caja")).toBe(true);
  });
});

describe("matriz de permisos", () => {
  it("coincide con la del prototipo", () => {
    const expected: Record<string, number[]> = {
      "Ver costos y ganancia": [1, 1, 0, 0], "Vender y cobrar": [1, 1, 1, 1], "Descuentos sin tope": [1, 1, 0, 0],
      "Tomar canje sobre el valor sugerido": [1, 1, 0, 0], "Editar precios y stock": [1, 1, 0, 0], "Ingresar equipos": [1, 1, 0, 0],
      "Anular ventas": [1, 1, 0, 0], "Abrir y cerrar caja": [1, 1, 0, 1], "Ver todos los cierres": [1, 1, 0, 0], Reportes: [1, 1, 0, 0],
      "Usuarios y configuración": [1, 0, 0, 0],
    };
    for (const [label, fn] of PERM_MATRIX) expect(ROLES.map((r) => (fn(r) ? 1 : 0)), label).toEqual(expected[label]);
  });
});
