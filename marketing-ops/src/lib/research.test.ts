import { describe, expect, it } from "vitest";
import type { BrandCtx } from "./generator";
import { extractJson, normUrl, parseResearch, ruleIdeas } from "./research";
import { researchWithClaude, sourcesIn, userPrompt } from "./research-ai";

const brand: BrandCtx = {
  name: "La Espiga", industry: "Panadería y pastelería", city: "Godoy Cruz, Mendoza", description: "Panadería de barrio con masa madre.",
  audience: "Vecinos de Godoy Cruz", value_prop: "Todo sale del horno esa mañana.", products: "Pan de masa madre, facturas, tortas por encargo",
  tone: ["Cercano"], words_avoid: "", cta: "Pedí por WhatsApp", hashtags: "#LaEspiga", website: "", instagram: "@laespiga", whatsapp: "",
};

const found = [
  { url: "https://example.com/tendencias-panaderia", title: "Qué se come en 2026" },
  { url: "https://example.com/el-molino", title: "El Molino en Instagram" },
  { url: "https://example.com/dia-de-la-madre?utm_source=x", title: "Día de la Madre: qué se regala" },
];

const reply = {
  resumen: "La masa madre sigue de moda y los competidores muestran el proceso.",
  tendencias: [
    { titulo: "Masa madre", detalle: "Se habla mucho del pan de fermentación lenta.", fuentes: ["https://example.com/tendencias-panaderia/"] },
    { titulo: "Inventada", detalle: "Sin fuente real.", fuentes: ["https://otro-sitio.com/nada"] },
  ],
  competencia: [
    { nombre: "El Molino", que_publica: "Reels del horno a la mañana.", fuentes: ["https://example.com/el-molino"] },
    { nombre: "Sin fuentes", que_publica: "Algo.", fuentes: [] },
  ],
  ideas: [
    { tema: "Un día con la masa madre de La Espiga", por_que: "La masa madre está en todos lados.", red: "Instagram", formato: "Reel", objetivo: "Comunidad", fuentes: ["https://example.com/tendencias-panaderia"] },
    { tema: "Tortas para el Día de la Madre", por_que: "Es la fecha que viene.", red: "WhatsApp", formato: "Reel", objetivo: "Promoción", fuentes: ["https://example.com/dia-de-la-madre"] },
    { tema: "Promo 2x1 con 30 % off", por_que: "Vende.", red: "Instagram", formato: "Post", objetivo: "Vender", fuentes: [] },
    { tema: "Conocé al panadero", por_que: "Cercanía.", red: "TikTok", formato: "Reel", objetivo: "Inventado", fuentes: [] },
  ],
};

describe("lectura de la respuesta", () => {
  it("encuentra el JSON aunque venga con texto alrededor o en un bloque", () => {
    expect(extractJson('Voy a buscar.\n```json\n{"a": 1}\n```\nListo')).toEqual({ a: 1 });
    expect(extractJson('Encontré esto: {"a": 2} y nada más')).toEqual({ a: 2 });
    expect(() => extractJson("no encontré nada")).toThrow("JSON");
  });

  it("compara URLs sin barra final, # ni utm", () => {
    expect(normUrl("https://example.com/a/?utm_source=x#top")).toBe("https://example.com/a");
    expect(normUrl("no es url")).toBe("");
  });
});

describe("control de la investigación", () => {
  const out = parseResearch("```json\n" + JSON.stringify(reply) + "\n```", found, brand);

  it("descarta tendencias y competidores sin fuentes que la búsqueda haya encontrado", () => {
    expect(out.trends.map((t) => t.title)).toEqual(["Masa madre"]);
    expect(out.competitors.map((c) => c.name)).toEqual(["El Molino"]);
  });

  it("descarta ideas con números inventados y arregla red, formato y objetivo inválidos", () => {
    expect(out.ideas.map((i) => i.topic)).toEqual(["Un día con la masa madre de La Espiga", "Tortas para el Día de la Madre", "Conocé al panadero"]);
    expect(out.ideas[1]).toMatchObject({ channel: "Instagram", format: "Reel", goal: "Promoción", sources: ["https://example.com/dia-de-la-madre"] });
    expect(out.ideas[2]).toMatchObject({ channel: "TikTok", format: "Reel", goal: "Comunidad" });
    expect(out.dropped).toBe(3);
  });

  it("guarda solo las fuentes usadas, con su título", () => {
    expect(out.sources).toEqual([
      { url: "https://example.com/tendencias-panaderia", title: "Qué se come en 2026" },
      { url: "https://example.com/el-molino", title: "El Molino en Instagram" },
      { url: "https://example.com/dia-de-la-madre", title: "Día de la Madre: qué se regala" },
    ]);
  });

  it("si no queda nada con fuentes, falla para no guardar humo", () => {
    expect(() => parseResearch(JSON.stringify({ resumen: "x", tendencias: [{ titulo: "x", detalle: "y", fuentes: ["https://falsa.com"] }], competencia: [], ideas: [] }), found, brand)).toThrow("fuentes");
  });
});

describe("ideas sin IA", () => {
  it("usa las fechas que vienen y lo que vende la marca", () => {
    const ideas = ruleIdeas(brand, "2026-10-01");
    expect(ideas[0]).toMatchObject({ topic: "Regalos para el Día de la Madre en La Espiga", goal: "Promoción" });
    expect(ideas[0].why).toContain("18/10");
    expect(ideas.map((i) => i.topic)).toContain("Las preguntas que más nos hacen sobre pan de masa madre");
    expect(ideas.length).toBeLessThanOrEqual(6);
  });

  it("a fin de año mira las fechas del año siguiente", () => {
    expect(ruleIdeas(brand, "2026-12-28").map((i) => i.topic)).toContain("Saludo de Año Nuevo de La Espiga");
  });
});

describe("investigación con IA: llamada", () => {
  it("pide buscar en internet, sigue si la búsqueda se pausa y valida contra lo encontrado", async () => {
    const calls: { tools: unknown[]; messages: { role: string }[] }[] = [];
    const first = {
      stop_reason: "pause_turn",
      content: [
        { type: "text", text: "Voy a buscar competidores." },
        { type: "server_tool_use", id: "s1", name: "web_search", input: { query: "panaderías Godoy Cruz" } },
        { type: "web_search_tool_result", tool_use_id: "s1", content: found.slice(0, 2).map((f) => ({ type: "web_search_result", ...f, encrypted_content: "x", page_age: null })) },
      ],
    };
    const second = {
      stop_reason: "end_turn",
      content: [
        { type: "web_search_tool_result", tool_use_id: "s2", content: [{ type: "web_search_result", ...found[2], encrypted_content: "x", page_age: null }] },
        { type: "text", text: "```json\n" + JSON.stringify(reply).slice(0, 40) },
        { type: "text", text: JSON.stringify(reply).slice(40) + "\n```", citations: [{ type: "web_search_result_location", url: found[0].url, title: found[0].title, cited_text: "", encrypted_index: "" }] },
      ],
    };
    const fake = { beta: { messages: { create: async (body: { tools: unknown[]; messages: { role: string }[] }) => { calls.push(structuredClone(body)); return calls.length === 1 ? first : second; } } } };
    const out = await researchWithClaude(brand, "El Molino", "2026-10-13", fake as never);
    expect(calls).toHaveLength(2);
    expect(calls[0].tools[0]).toMatchObject({ type: "web_search_20260209", user_location: { country: "AR", city: "Godoy Cruz, Mendoza" } });
    expect(calls[1].messages.map((m) => m.role)).toEqual(["user", "assistant"]);
    expect(out.ideas).toHaveLength(3);
    expect(out.competitors[0].name).toBe("El Molino");
  });

  it("junta las fuentes de resultados y citas, y el pedido trae el foco y las fechas", () => {
    expect(sourcesIn([{ type: "x", content: [{ type: "web_search_result", url: "https://a.com", title: "A" }] }, { citations: [{ type: "web_search_result_location", url: "https://b.com", title: "B" }] }]))
      .toEqual([{ url: "https://a.com", title: "A" }, { url: "https://b.com", title: "B" }]);
    const p = userPrompt(brand, "El Molino", "2026-10-13");
    expect(p).toContain("mirar en especial: El Molino");
    expect(p).toContain("Día de la Madre (18/10)");
  });

  it("si la IA se niega, avisa para volver a las ideas sin IA", async () => {
    const fake = { beta: { messages: { create: async () => ({ stop_reason: "refusal", content: [] }) } } };
    await expect(researchWithClaude(brand, "", "2026-10-13", fake as never)).rejects.toThrow("refusal");
  });
});
