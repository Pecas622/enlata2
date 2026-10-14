import { describe, expect, it } from "vitest";
import { brandsFor, brandsLabel, daysLeft, inviteLink, inviteMessage, isEmail } from "./team";

const brands = [{ id: "b1", name: "La Espiga" }, { id: "b2", name: "Rodar Bikes" }];

describe("equipo", () => {
  it("valida emails", () => {
    expect(isEmail("carla@laespiga.com")).toBe(true);
    expect(isEmail(" carla@laespiga.com ")).toBe(true);
    expect(isEmail("carla@laespiga")).toBe(false);
    expect(isEmail("carla laespiga.com")).toBe(false);
  });

  it("arma el link y el mensaje para mandar", () => {
    const link = inviteLink("https://marketing-ops-seven.vercel.app/", "abc123");
    expect(link).toBe("https://marketing-ops-seven.vercel.app/registro?invitacion=abc123");
    expect(inviteMessage("Pecas622", "Revisor", link)).toContain("como Revisor");
  });

  it("solo el Revisor tiene marcas elegidas", () => {
    expect(brandsFor("Revisor", ["b1", "b1"])).toEqual(["b1"]);
    expect(brandsFor("Revisor", [])).toBeNull();
    expect(brandsFor("Creador", ["b1"])).toBeNull();
    expect(brandsLabel("Revisor", ["b1"], brands)).toBe("La Espiga");
    expect(brandsLabel("Revisor", null, brands)).toBe("Todas las marcas");
    expect(brandsLabel("Creador", ["b1"], brands)).toBe("Todas las marcas");
  });

  it("cuenta los días que le quedan a una invitación", () => {
    const now = new Date("2026-10-13T12:00:00Z");
    expect(daysLeft("2026-10-27T12:00:00Z", now)).toBe(14);
    expect(daysLeft("2026-10-01T12:00:00Z", now)).toBe(0);
  });
});
