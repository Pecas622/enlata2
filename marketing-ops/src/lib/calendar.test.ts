import { describe, expect, it } from "vitest";
import { addDays, asView, isDay, weekOf, commercialDates, datesInMonth, easter, monthGrid, monthLabel, shiftMonth, suggestPlan, weekLoad, weekday } from "./calendar";
import { isValidCombo } from "./channels";

const brand = { name: "La Espiga", products: "Pan de masa madre, facturas, tortas por encargo" };

describe("grilla del mes", () => {
  it("arranca el lunes y cubre el mes entero", () => {
    const weeks = monthGrid("2026-10");
    expect(weeks[0][0]).toEqual({ day: "2026-09-28", inMonth: false });
    expect(weeks[0][3]).toEqual({ day: "2026-10-01", inMonth: true });
    expect(weeks.at(-1)!.at(-1)!.day).toBe("2026-11-01");
    expect(weeks.flat().filter((d) => d.inMonth)).toHaveLength(31);
    expect(weeks.every((w) => w.length === 7 && weekday(w[0].day) === 0)).toBe(true);
  });

  it("cambia de mes y de año", () => {
    expect(shiftMonth("2026-12", 1)).toBe("2027-01");
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
    expect(monthLabel("2026-10")).toBe("octubre 2026");
    expect(addDays("2026-02-28", 1)).toBe("2026-03-01");
  });
});

describe("fechas comerciales", () => {
  it("calcula las fechas móviles de Argentina", () => {
    const byName = (y: number, n: string) => commercialDates(y).find((d) => d.name === n)!.day;
    expect(byName(2026, "Día de la Madre")).toBe("2026-10-18");
    expect(byName(2026, "Día del Padre")).toBe("2026-06-21");
    expect(byName(2026, "Día de las Infancias")).toBe("2026-08-16");
    expect(byName(2026, "Black Friday")).toBe("2026-11-27");
    expect(easter(2026)).toBe("2026-04-05");
    expect(easter(2027)).toBe("2027-03-28");
    expect(byName(2026, "Carnaval")).toBe("2026-02-16");
  });

  it("filtra por mes", () => {
    expect(datesInMonth("2026-10").map((d) => d.name)).toEqual(["Día de la Madre"]);
    expect(datesInMonth("2026-12").map((d) => d.name)).toEqual(["Nochebuena", "Navidad", "Fin de año"]);
  });
});

describe("semanas flojas", () => {
  it("prorratea la meta en la semana cortada y avisa la que está vacía", () => {
    const load = weekLoad("2026-10", [{ publish_on: "2026-10-14" }, { publish_on: "2026-10-16" }, { publish_on: "2026-10-17" }], 3, "2026-10-13");
    const week = (start: string) => load.find((w) => w.start === start)!;
    expect(week("2026-09-28").short).toBe(false); // ya pasó
    expect(week("2026-10-12")).toMatchObject({ count: 3, target: 3, short: false });
    expect(week("2026-10-19")).toMatchObject({ count: 0, target: 3, short: true });
    expect(week("2026-10-26").target).toBe(3); // del 26 al 31: 6 días
  });
});

describe("plan del mes", () => {
  const today = "2026-10-13";

  it("pone la fecha comercial unos días antes y completa las semanas sin pisar días ocupados", () => {
    const existing = [{ publish_on: "2026-10-15", topic: "Jueves de budines" }];
    const plan = suggestPlan(brand, "2026-10", existing, { perWeek: 3, channels: ["Instagram"], today });
    const madre = plan.find((p) => p.reason.startsWith("Día de la Madre"))!;
    expect(madre).toMatchObject({ publish_on: "2026-10-13", goal: "Promoción", topic: "Regalos para el Día de la Madre en La Espiga" });
    expect(plan.every((p) => p.publish_on >= today && p.publish_on <= "2026-10-31")).toBe(true);
    expect(plan.some((p) => p.publish_on === "2026-10-15")).toBe(false);
    expect(new Set(plan.map((p) => p.publish_on)).size).toBe(plan.length);
    const load = weekLoad("2026-10", [...existing, ...plan], 3, today);
    expect(load.filter((w) => w.short)).toEqual([]);
    expect(plan.every((p) => isValidCombo(p.channel, p.format))).toBe(true);
  });

  it("no repite una fecha comercial que ya tiene pieza y mezcla objetivos", () => {
    const plan = suggestPlan(brand, "2026-10", [{ publish_on: null, topic: "Tortas por encargo para el Día de la Madre" }], { perWeek: 4, channels: ["Instagram", "WhatsApp"], today });
    expect(plan.some((p) => p.topic.includes("Día de la Madre"))).toBe(false);
    expect(new Set(plan.map((p) => p.goal)).size).toBeGreaterThanOrEqual(3);
    expect(plan.some((p) => p.channel === "WhatsApp")).toBe(true);
    expect(plan.every((p) => isValidCombo(p.channel, p.format))).toBe(true);
    expect(plan.filter((p) => p.goal === "Vender").length).toBeLessThan(plan.length / 2);
  });

  it("un mes que ya pasó no tiene plan", () => {
    expect(suggestPlan(brand, "2026-09", [], { perWeek: 3, channels: ["Instagram"], today })).toEqual([]);
  });
});

describe("vistas semanal y diaria", () => {
  it("la semana va de lunes a domingo aunque cruce el mes", () => {
    expect(weekOf("2026-10-14")).toEqual(["2026-10-12", "2026-10-13", "2026-10-14", "2026-10-15", "2026-10-16", "2026-10-17", "2026-10-18"]);
    expect(weekOf("2026-11-01")[0]).toBe("2026-10-26");
  });

  it("valida días y vistas que llegan por la URL", () => {
    expect(isDay("2026-10-14")).toBe(true);
    expect(isDay("2026-02-30")).toBe(false);
    expect(isDay("hoy")).toBe(false);
    expect(asView("semana")).toBe("semana");
    expect(asView("anio")).toBe("mes");
  });
});
