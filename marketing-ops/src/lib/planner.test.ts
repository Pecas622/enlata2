import { describe, expect, it } from "vitest";
import { isValidCombo } from "./channels";
import { hookOf, parsePieces, parseStrategy, planSlots, rulePlan, suggestedTime, type PlanBrand } from "./planner";
import { planWithClaude, strategyPrompt } from "./planner-ai";

const brand: PlanBrand = {
  name: "La Espiga", industry: "Panadería y pastelería", city: "Godoy Cruz, Mendoza", description: "Panadería de barrio con masa madre.",
  audience: "Vecinos de Godoy Cruz", value_prop: "Todo sale del horno esa mañana.", products: "Pan de masa madre, facturas, tortas por encargo",
  tone: ["Cercano"], words_avoid: "barato", cta: "Pedí por WhatsApp", hashtags: "#LaEspiga", website: "", instagram: "@laespiga", whatsapp: "",
  goals: "Más pedidos de tortas", channels: ["Instagram", "WhatsApp"], posts_per_week: 3, ad_budget: 0, market: "Gran Mendoza", visual_style: "Fotos con luz natural",
};

describe("plan por reglas", () => {
  const plan = rulePlan(brand, "2026-10", [], "2026-10-14");

  it("cada fecha trae todo: horario, gancho, estructura, texto, recursos y por qué", () => {
    expect(plan.items.length).toBeGreaterThan(5);
    for (const p of plan.items) {
      expect(p.publish_on >= "2026-10-14" && p.publish_on <= "2026-10-31").toBe(true);
      expect(p.post_time).toMatch(/^\d{2}:\d{2}$/);
      expect(isValidCombo(p.channel, p.format)).toBe(true);
      expect(["Instagram", "WhatsApp"]).toContain(p.channel);
      for (const k of ["hook", "structure", "body", "resources", "rationale", "title"] as const) expect(p[k]).not.toBe("");
    }
    expect(plan.items.find((p) => p.topic.includes("Día de la Madre"))).toBeTruthy();
    expect(plan.summary).toContain("La Espiga");
  });

  it("los recursos suman la identidad visual y el gancho sale sin etiquetas", () => {
    expect(plan.items[0].resources).toContain("luz natural");
    expect(hookOf("Placa 1: Lo que nadie te cuenta\nPlaca 2: x")).toBe("Lo que nadie te cuenta");
    expect(hookOf("0-3 s · Gancho: ¿Ya probaste?\n3-10 s · ...")).toBe("¿Ya probaste?");
    expect(hookOf("Asunto: Novedades\n\nHola,")).toBe("Novedades");
  });

  it("respeta la frecuencia de la marca y no pisa días ocupados", () => {
    const busy = [{ publish_on: "2026-10-20", topic: "Algo" }];
    const slots = planSlots({ ...brand, posts_per_week: 1 }, "2026-10", busy, "2026-10-14");
    expect(slots.map((s) => s.publish_on)).not.toContain("2026-10-20");
    expect(slots.length).toBeLessThan(plan.items.length);
  });

  it("los horarios son de referencia según red y día", () => {
    expect(suggestedTime("Instagram", "Reel", "2026-10-14")).toBe("19:30");
    expect(suggestedTime("Instagram", "Reel", "2026-10-17")).toBe("12:00");
    expect(suggestedTime("LinkedIn", "Post", "2026-10-14")).toBe("09:00");
  });
});

describe("control de la IA", () => {
  const slots = planSlots(brand, "2026-10", [], "2026-10-14");

  it("estrategia: solo fechas dadas, redes de la marca y temas sin ofertas inventadas", () => {
    const out = parseStrategy({
      resumen: "Mes de la madre.",
      piezas: [
        { fecha: slots[0].publish_on, red: "TikTok", formato: "Reel", objetivo: "Vender", tema: "Torta del día", por_que: "x" },
        { fecha: slots[1].publish_on, red: "Instagram", formato: "Carrusel", objetivo: "Educar", tema: "Cómo se hace la masa madre", por_que: "La investigación mostró interés." },
        { fecha: slots[2].publish_on, red: "Instagram", formato: "Post", objetivo: "Promoción", tema: "Tortas con 20 % off", por_que: "Vende" },
        { fecha: "2026-10-01", red: "Instagram", formato: "Post", objetivo: "Vender", tema: "Fuera del plan", por_que: "" },
      ],
    }, slots, ["Instagram", "WhatsApp"], new Set());
    expect(out.slots).toHaveLength(slots.length);
    expect(out.slots[0].channel).toBe(slots[0].channel); // TikTok no es red de la marca
    expect(out.slots[1]).toMatchObject({ channel: "Instagram", format: "Carrusel", topic: "Cómo se hace la masa madre", reason: "La investigación mostró interés." });
    expect(out.slots[2].topic).toBe(slots[2].topic); // con oferta inventada vuelve a las reglas
    expect(out.slots.map((s) => s.publish_on)).not.toContain("2026-10-01");
    expect(out.fixed).toBe(slots.length - 2);
  });

  it("piezas: lo que se pasa de largo, inventa precios o usa palabras prohibidas se escribe con plantillas", () => {
    const s = slots.slice(0, 3).map((x) => ({ ...x, channel: "Instagram" as const, format: "Post" as const }));
    const ok = { fecha: s[0].publish_on, titulo: "Masa madre", gancho: "¿Sabés cuánto tarda un pan de verdad?", estructura: "1. Gancho\n2. Proceso\n3. CTA", texto: "¿Sabés cuánto tarda un pan de verdad?\n\nPedí por WhatsApp.", hashtags: ["LaEspiga", "masa madre", "pan", "mendoza", "godoycruz", "extra"], cta: "Pedí por WhatsApp", recursos: "Foto del pan", horario: "18:00" };
    const out = parsePieces({ piezas: [
      ok,
      { ...ok, fecha: s[1].publish_on, texto: "Tortas a $ 9.000. Pedí por WhatsApp." },
      { ...ok, fecha: s[2].publish_on, texto: "El pan más barato. Pedí por WhatsApp.", horario: "25:99" },
    ] }, s.map((x) => ({ ...x, reason: "Porque sí" })), brand);
    expect(out.items[0]).toMatchObject({ title: "Masa madre", post_time: "18:00", rationale: "Porque sí", hashtags: "#laespiga #masamadre #pan #mendoza #godoycruz" });
    expect(out.items[1].body).not.toContain("9.000");
    expect(out.items[2].body).not.toContain("barato");
    expect(out.fixed).toBe(2);
  });
});

describe("plan con IA: llamada", () => {
  it("decide las fechas, desarrolla en tandas y si una tanda falla usa plantillas", async () => {
    const slots = planSlots(brand, "2026-10", [], "2026-10-14");
    let n = 0;
    const fake = { beta: { messages: { create: async (body: { system: string; messages: { content: string }[] }) => {
      n++;
      if (body.system.startsWith("Sos director")) {
        return { stop_reason: "end_turn", content: [{ type: "text", text: JSON.stringify({ resumen: "Plan con foco en tortas.", piezas: slots.map((s) => ({ fecha: s.publish_on, red: s.channel, formato: s.format, objetivo: s.goal, tema: `IA: ${s.topic}`, por_que: "Porque el público pide tortas." })) }) }] };
      }
      if (body.messages[0].content.includes(slots[0].publish_on)) throw new Error("timeout");
      const fechas = [...body.messages[0].content.matchAll(/"fecha": "([\d-]+)"/g)].map((m) => m[1]);
      return { stop_reason: "end_turn", content: [{ type: "text", text: JSON.stringify({ piezas: fechas.map((f) => ({ fecha: f, titulo: "T", gancho: "Gancho", estructura: "1. a", texto: "Texto de la pieza. Pedí por WhatsApp.", hashtags: [], cta: "Pedí por WhatsApp", recursos: "Foto", horario: "12:00" })) }) }] };
    } } } };
    const out = await planWithClaude(brand, "2026-10", slots, {}, fake as never);
    expect(n).toBe(1 + Math.ceil(slots.length / 5));
    expect(out.summary).toBe("Plan con foco en tortas.");
    expect(out.items.every((i) => i.topic.startsWith("IA: "))).toBe(true);
    expect(out.items[0].body).not.toBe("Texto de la pieza. Pedí por WhatsApp."); // su tanda falló: plantilla
    expect(out.items.at(-1)!.body).toBe("Texto de la pieza. Pedí por WhatsApp.");
    expect(out.fixed).toBe(Math.min(5, slots.length));
  });

  it("el pedido trae la investigación, lo que funcionó y los temas ya cargados", () => {
    const slots = planSlots(brand, "2026-10", [], "2026-10-14");
    const p = strategyPrompt(brand, "2026-10", slots, {
      research: { summary: "La masa madre sigue de moda.", trends: [], competitors: [{ name: "El Molino", detail: "Reels del horno", sources: [] }], ideas: [] },
      worked: [{ title: "Lo que más enganchó: “Detrás del horno”", detail: "Reel" }],
      existing: ["Facturas del domingo"],
    });
    expect(p).toContain("La masa madre sigue de moda");
    expect(p).toContain("El Molino: Reels del horno");
    expect(p).toContain("Detrás del horno");
    expect(p).toContain("Facturas del domingo");
    expect(p).toContain("Más pedidos de tortas");
  });

  it("si la IA se niega, avisa para volver a las reglas", async () => {
    const fake = { beta: { messages: { create: async () => ({ stop_reason: "refusal", content: [] }) } } };
    await expect(planWithClaude(brand, "2026-10", planSlots(brand, "2026-10", [], "2026-10-14"), {}, fake as never)).rejects.toThrow("refusal");
  });
});
