import { describe, expect, it } from "vitest";
import { brandHealth, homeTips, todayList, type HomePiece } from "./home";
import type { PieceResult } from "./metrics";

const today = "2026-10-14";
const piece = (id: string, status: string, publish_on: string | null, post_time: string | null = null, brand_id = "b1"): HomePiece => ({ id, brand_id, status, publish_on, post_time, title: id, topic: "" });
const pub = (id: string, day: string, reach: number | null): PieceResult => ({
  id, title: id, brand: "La Espiga", channel: "Instagram", format: "Reel", goal: "Comunidad", day, campaign_id: null,
  results: reach === null ? null : { reach, interactions: reach / 10, clicks: 0, inquiries: 2, sales: 0, spend: 0 },
});

describe("¿qué publico hoy?", () => {
  it("lo de hoy por horario, sin lo publicado, y después lo aprobado atrasado", () => {
    const list = todayList([
      piece("tarde", "Aprobado", today, "19:30:00"),
      piece("manana", "En revisión", today, "09:00:00"),
      piece("sin-hora", "Idea", today),
      piece("ya", "Publicado", today, "08:00:00"),
      piece("atrasada", "Aprobado", "2026-10-10"),
      piece("borrador-viejo", "Borrador", "2026-10-10"),
    ], today);
    expect(list.map((p) => p.id)).toEqual(["manana", "tarde", "sin-hora", "atrasada"]);
    expect(list.map((p) => p.hint)).toEqual(["Falta que la aprueben", "Lista para publicar", "Falta escribirla", expect.stringContaining("fecha pasada")]);
  });
});

describe("¿cómo va la marca?", () => {
  it("compara los últimos 30 días con los 30 anteriores", () => {
    const h = brandHealth([pub("a", "2026-10-10", 1000), pub("b", "2026-10-01", 500), pub("c", "2026-09-05", 1000), pub("d", "2026-10-12", null)], today);
    expect(h.published).toBe(3);
    expect(h.withResults).toBe(2);
    expect(h.totals.reach).toBe(1500);
    expect(h.change.reach).toBeCloseTo(0.5);
  });

  it("sin período anterior no inventa una comparación", () => {
    const h = brandHealth([pub("a", "2026-10-10", 1000)], today);
    expect(h.change.reach).toBeNull();
    expect(brandHealth([], today).summary).toContain("no hay piezas publicadas");
  });
});

describe("¿qué hago para mejorar?", () => {
  const brands = [{ id: "b1", name: "La Espiga", posts_per_week: 3 }];

  it("sin marca, lo primero es cargarla", () => {
    expect(homeTips({ pieces: [], brands: [], published: [], health: brandHealth([], today), today })).toEqual([expect.objectContaining({ href: "/marca/nueva" })]);
  });

  it("aprobaciones, atrasos, frecuencia y resultados sin cargar, en ese orden", () => {
    const pieces = [piece("r", "En revisión", "2026-10-15"), piece("late", "Aprobado", "2026-10-12")];
    const published = [pub("p", "2026-10-05", null)];
    const tips = homeTips({ pieces, brands, published, health: brandHealth(published, today), today });
    expect(tips.map((t) => t.who)).toEqual(["review", "create", "create", "create"]);
    expect(tips[0].text).toContain("1 pieza esperando");
    expect(tips[2].text).toContain("1 de 3 publicaciones");
    expect(tips[3].text).toContain("Cargá los resultados de 1 pieza publicada");
  });

  it("con la semana cubierta y resultados cargados, sugiere lo que dice el análisis", () => {
    const pieces = ["2026-10-14", "2026-10-16", "2026-10-18"].map((d, i) => piece(`x${i}`, "Aprobado", d));
    const published = [pub("a", "2026-10-10", 1000), pub("b", "2026-10-03", 300)];
    const tips = homeTips({ pieces, brands, published, health: brandHealth(published, today), today });
    expect(tips.length).toBeGreaterThan(0);
    expect(tips.every((t) => t.who === "all" && t.href === "/metricas")).toBe(true);
  });
});
