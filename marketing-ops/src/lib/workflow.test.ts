import { describe, expect, it } from "vitest";
import { ROLES, permsFor } from "./roles";
import { actionsFor, canEdit, canMove, STATUSES } from "./workflow";

describe("circuito de aprobación", () => {
  it("el Creador manda a revisión y publica lo aprobado, pero no aprueba", () => {
    expect(canMove("Borrador", "En revisión", "Creador")).toBe(true);
    expect(canMove("En revisión", "Aprobado", "Creador")).toBe(false);
    expect(canMove("Aprobado", "Publicado", "Creador")).toBe(true);
  });
  it("el Revisor aprueba o pide cambios, y nada más", () => {
    expect(canMove("En revisión", "Aprobado", "Revisor")).toBe(true);
    expect(canMove("En revisión", "Borrador", "Revisor")).toBe(true);
    expect(canMove("Borrador", "En revisión", "Revisor")).toBe(false);
    expect(canMove("Aprobado", "Publicado", "Revisor")).toBe(false);
    expect(canEdit("Borrador", "Revisor")).toBe(false);
  });
  it("una pieza publicada no se mueve ni se edita", () => {
    for (const to of STATUSES) for (const r of ROLES) expect(canMove("Publicado", to, r)).toBe(false);
    for (const r of ROLES) expect(canEdit("Publicado", r)).toBe(false);
    expect(actionsFor("Publicado", "Administrador")).toEqual([]);
  });
  it("los botones salen de la misma regla", () => {
    for (const s of STATUSES) for (const r of ROLES) for (const a of actionsFor(s, r)) expect(canMove(s, a.to, r)).toBe(true);
    expect(actionsFor("En revisión", "Revisor").map((a) => a.label)).toEqual(["Aprobar", "Pedir cambios"]);
    expect(actionsFor("En revisión", "Revisor")[1].needsNote).toBe(true);
  });
  it("permisos por rol", () => {
    expect(permsFor("Administrador")).toEqual({ editBrand: true, create: true, review: true });
    expect(permsFor("Creador")).toEqual({ editBrand: false, create: true, review: false });
    expect(permsFor("Revisor")).toEqual({ editBrand: false, create: false, review: true });
  });
});
