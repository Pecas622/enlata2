import { describe, expect, it } from "vitest";
import { canOpen, navFor, permsFor } from "./roles";

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
    expect(navFor("Administrador")).toHaveLength(12);
  });
  it("bloquea secciones fuera del rol", () => {
    expect(canOpen("Vendedor", "caja")).toBe(false);
    expect(canOpen("Cajero", "caja")).toBe(true);
  });
});
