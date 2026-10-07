import { describe, expect, it } from "vitest";
import { assistantStep, chipText, emptyState, findAccessories, handoffSummary, parseBattery, parseCap, parseCond, parseIphoneModel, parseKind, sanitizeState, type AssistCtx, type ChatState } from "./assistant";
import { askClaude, runTool, toApiMessages } from "./assistant-ai";
import type { PublicDevice } from "./public-catalog";

const dev = (id: string, model: string, capacity: number, price: number, extra: Partial<PublicDevice> = {}): PublicDevice => ({
  id, kind: model.startsWith("iPhone") ? "iPhone" : model.startsWith("iPad") ? "iPad" : "Mac", model, capacity, color: "Negro",
  condition: "Usado A", battery: 90, price_usd: price, warranty_days: 90, featured: false, entry_date: "2026-10-01", photo_path: null, ...extra,
});

const ctx: AssistCtx = {
  storeName: "Tu Local Apple",
  address: "Av. San Martín 1234, Mendoza",
  fx: 1200,
  warrantyNew: 365,
  warrantyUsed: 90,
  devices: [
    dev("d1", "iPhone 15 Pro", 256, 1050),
    dev("d2", "iPhone 13", 128, 520),
    dev("d3", "iPhone 15 Pro", 128, 950, { featured: true }),
    dev("d4", "iPad Air M1", 64, 480),
  ],
  accessories: [
    { id: "a1", name: "Funda silicona iPhone 15", category: "Fundas", price_ars: 18000 },
    { id: "a2", name: "Vidrio templado iPhone 13", category: "Vidrios", price_ars: 9000 },
    { id: "a3", name: "Cargador 20W USB-C", category: "Cargadores", price_ars: 25000 },
  ],
  appraisal: {
    baseValues: [
      { model: "iPhone 13", capacity: 128, value: 370 },
      { model: "iPhone 13", capacity: 256, value: 420 },
      { model: "iPhone 15", capacity: 128, value: 580 },
    ],
    condMult: { "Usado A": 1, "Usado B": 0.9 },
    defectCosts: { "Pantalla dañada": 90, "Tapa trasera rota": 35 },
    targetMargin: 0,
  },
};

// Simula una conversación: cada mensaje pasa por el motor con el estado anterior.
function talk(...inputs: string[]) {
  let st: ChatState = emptyState();
  let last!: ReturnType<typeof assistantStep>;
  for (const input of inputs) {
    last = assistantStep(input, st, ctx);
    st = last.state;
  }
  return last;
}

describe("lectura del mensaje", () => {
  it("reconoce modelo, tipo, capacidad y batería", () => {
    expect(parseIphoneModel("tenes iphone 15 pro max?")).toBe("iPhone 15 Pro Max");
    expect(parseIphoneModel("un 13 mini")).toBe("iPhone 13 mini");
    expect(parseIphoneModel("tengo 13 años")).toBeNull();
    expect(parseKind("busco una macbook")).toBe("Mac");
    expect(parseKind("auriculares con cable")).toBeNull();
    expect(parseCap("de 256gb")).toBe(256);
    expect(parseCap("1 tb")).toBe(1024);
    expect(parseBattery("bateria al 86")).toBe(86);
    expect(parseBattery("tiene 120%")).toBeNull();
  });
  it("entiende el estado con número o con palabras", () => {
    expect(parseCond("1", true)).toEqual({ cond: "Usado A", defects: [] });
    expect(parseCond("3", true)).toEqual({ cond: "Usado B", defects: ["Pantalla dañada"] });
    expect(parseCond("1", false)).toBeNull();
    expect(parseCond("tiene la pantalla rota", false)).toEqual({ cond: "Usado B", defects: ["Pantalla dañada"] });
    expect(parseCond("esta impecable", false)).toEqual({ cond: "Usado A", defects: [] });
  });
});

describe("motor de reglas", () => {
  it("busca equipos del stock con destacados primero y luego por precio", () => {
    const r = talk("tenes iphone 15 pro?");
    expect(r.msgs[0].cards?.map((c) => c.id)).toEqual(["d3", "d1"]);
    expect(r.state.topic).toBe("Equipos");
  });
  it("dice que no hay cuando no está en stock, sin inventar", () => {
    const r = talk("tenes iphone 16?");
    expect(r.msgs[0].text).toMatch(/no tengo iPhone 16 disponible/);
    expect(r.msgs[0].cards).toBeUndefined();
  });
  it("cotiza el canje paso a paso con appraise() y da un rango orientativo", () => {
    const steps = ["quiero entregar mi iphone en parte de pago", "iphone 13", "256", "2", "bateria 85"];
    const asks = steps.map((_, i) => talk(...steps.slice(0, i + 1)).msgs[0].text);
    expect(asks[0]).toMatch(/Qué modelo/);
    expect(asks[1]).toMatch(/capacidad.*128 GB, 256 GB/);
    expect(asks[2]).toMatch(/Cómo está el equipo/);
    expect(asks[3]).toMatch(/porcentaje de batería/);
    // 420 × 0,9 = 378 → −3% batería (13) = 365 → 365. Rango: r5(365 × 0,9) = 330 a 365.
    expect(asks[4]).toContain("entre US$ 330 y US$ 365");
    expect(asks[4]).toMatch(/orientativamente/);
    expect(asks[4]).toMatch(/se confirma revisando el equipo en el local/);
  });
  it("con la cotización hecha, las tarjetas muestran la diferencia", () => {
    const r = talk("quiero cotizar mi iphone 13 128 impecable", "no se", "ver iphone 13 disponibles");
    expect(r.msgs[0].cards?.[0]).toEqual({ id: "d2", note: "Diferencia aprox.: US$ 150 a US$ 185 con tu equipo" });
  });
  it("deriva a una persona si el modelo no tiene valor de referencia", () => {
    const r = talk("quiero cotizar mi iphone 11");
    expect(r.msgs[0].handoff).toBe(true);
    expect(r.state.mode).toBeNull();
  });
  it("deriva ante pedido de persona, reclamos, descuentos y cuotas", () => {
    for (const q of ["quiero hablar con un asesor", "tengo un reclamo", "me hacen descuento?", "se puede en cuotas?"]) {
      expect(talk(q).msgs[0].handoff, q).toBe(true);
    }
    expect(talk("como puedo pagar?").msgs[0].handoff).toBeUndefined();
  });
  it("tasa en el local otros tipos de equipo", () => {
    const r = talk("quiero entregar mi macbook");
    expect(r.msgs[0].handoff).toBe(true);
  });
  it("responde pagos, garantía y ubicación con los datos del local", () => {
    expect(talk("como puedo pagar?").msgs[0].text).toMatch(/US\$ 1 = \$\s1\.200/);
    expect(talk("que garantia tienen?").msgs[0].text).toContain("usados 90 días");
    expect(talk("donde estan?").msgs[0].text).toContain("Av. San Martín 1234");
  });
  it("busca accesorios por palabra y modelo", () => {
    expect(findAccessories(ctx, "funda para iphone 15").map((a) => a.id)).toEqual(["a1"]);
    expect(talk("tenes vidrio templado?").msgs[0].text).toMatch(/Vidrio templado iPhone 13: \$\s?9\.000/);
  });
  it("los chips mandan un texto que el motor entiende", () => {
    expect(talk(chipText("Cotizar mi equipo")).state.mode).toBe("canje");
    expect(talk(chipText("Hablar con un asesor")).msgs[0].handoff).toBe(true);
  });
});

describe("estado que viaja en el navegador", () => {
  it("descarta campos desconocidos o con tipos incorrectos", () => {
    const s = sanitizeState({ mode: "hack", draft: { model: 5, cond: "Nuevo", defects: ["x", "Tapa trasera rota"] }, userMsgs: [1, "hola"], quote: { low: "1" } });
    expect(s).toMatchObject({ mode: null, draft: { model: undefined, cond: undefined, defects: ["Tapa trasera rota"] }, userMsgs: ["hola"], quote: undefined });
  });
  it("arma el resumen para WhatsApp", () => {
    const st = talk("quiero cotizar mi iphone 13 128", "1").state;
    expect(handoffSummary(st)).toBe("Hola! Vengo del chat del catálogo. quiero cotizar mi iphone 13 128 / 1. Mi equipo: iPhone 13 128GB, Usado A.");
  });
});

describe("herramientas de la IA", () => {
  it("buscar_stock devuelve solo datos públicos y equivalentes en pesos", () => {
    const r = JSON.parse(runTool(ctx, "buscar_stock", { tipo: "iPhone", modelo: "iPhone 13" }).content);
    expect(r.equipos).toEqual([{ id: "d2", equipo: "iPhone 13 128 GB", color: "Negro", estado: "Usado A", bateria: 90, precio_usd: 520, precio_ars_aprox: 624000, garantia_dias: 90 }]);
    const acc = JSON.parse(runTool(ctx, "buscar_stock", { tipo: "Accesorio", texto: "cargador" }).content);
    expect(acc.accesorios).toEqual([{ nombre: "Cargador 20W USB-C", categoria: "Cargadores", precio_ars: 25000 }]);
  });
  it("cotizar_canje usa la misma tasación y pide derivar sin referencia", () => {
    const ok = JSON.parse(runTool(ctx, "cotizar_canje", { modelo: "iPhone 13", capacidad_gb: 256, estado: "marcas leves", bateria: 85 }).content);
    expect(ok).toMatchObject({ ok: true, rango_usd: [330, 365], rango_ars_aprox: [396000, 438000] });
    expect(ok.aclaracion).toMatch(/Orientativo/);
    const rota = JSON.parse(runTool(ctx, "cotizar_canje", { modelo: "iPhone 15", capacidad_gb: 128, estado: "pantalla o tapa rota" }).content);
    // 580 × 0,9 = 522 − 90 = 432 → 430; rango 385 a 430.
    expect(rota.rango_usd).toEqual([385, 430]);
    const sin = JSON.parse(runTool(ctx, "cotizar_canje", { modelo: "iPhone 13", capacidad_gb: 512, estado: "impecable" }).content);
    expect(sin).toMatchObject({ ok: false, accion: "derivar_a_asesor", capacidades_con_referencia_gb: [128, 256] });
  });
  it("mostrar_equipos ignora ids que no están en el stock público", () => {
    expect(runTool(ctx, "mostrar_equipos", { ids: ["d1", "inventado"] }).deviceIds).toEqual(["d1"]);
    expect(runTool(ctx, "derivar_a_asesor", { motivo: "cuotas" }).handoff).toBe(true);
    expect(runTool(ctx, "otra", {}).isError).toBe(true);
  });
  it("el historial arranca en el cliente y alterna roles", () => {
    expect(toApiMessages([
      { role: "assistant", content: "¡Hola!" },
      { role: "user", content: "hola" },
      { role: "user", content: "tenes iphone?" },
      { role: "assistant", content: "Sí" },
    ])).toEqual([{ role: "user", content: "hola\ntenes iphone?" }, { role: "assistant", content: "Sí" }]);
  });
});

describe("vuelta con la IA", () => {
  // Cliente falso con la misma forma que client.beta.messages.create.
  const fake = (responses: object[]) => {
    const calls: Record<string, unknown>[] = [];
    const client = { beta: { messages: { create: async (p: Record<string, unknown>) => { calls.push(structuredClone(p)); return responses.shift(); } } } };
    return { client: client as never, calls };
  };

  it("ejecuta las herramientas y devuelve texto, tarjetas y derivación", async () => {
    const { client, calls } = fake([
      { stop_reason: "tool_use", content: [{ type: "tool_use", id: "t1", name: "buscar_stock", input: { tipo: "iPhone", modelo: "iPhone 15 Pro" } }] },
      { stop_reason: "tool_use", content: [{ type: "tool_use", id: "t2", name: "mostrar_equipos", input: { ids: ["d3"] } }, { type: "tool_use", id: "t3", name: "derivar_a_asesor", input: { motivo: "cuotas" } }] },
      { stop_reason: "end_turn", content: [{ type: "text", text: "Tengo el iPhone 15 Pro de 128 GB a US$ 950." }] },
    ]);
    const r = await askClaude(ctx, "Asistente", [{ role: "user", content: "tenes 15 pro en cuotas?" }], client);
    expect(r).toEqual({ text: "Tengo el iPhone 15 Pro de 128 GB a US$ 950.", handoff: true, deviceIds: ["d3"] });
    expect(calls[0]).toMatchObject({ model: "claude-opus-5-5", output_config: { effort: "low" }, fallbacks: "default", betas: ["server-side-fallback-2026-07-01"], tool_choice: { type: "auto" } });
    const toolResult = (calls[1].messages as { content: { type: string; content: string }[] }[])[2].content[0];
    expect(JSON.parse(toolResult.content).equipos.map((e: { id: string }) => e.id)).toEqual(["d3", "d1"]);
  });

  it("falla (y la ruta usa las reglas) ante un rechazo o una respuesta vacía", async () => {
    await expect(askClaude(ctx, "A", [{ role: "user", content: "hola" }], fake([{ stop_reason: "refusal", content: [] }]).client)).rejects.toThrow(/refusal/);
    await expect(askClaude(ctx, "A", [{ role: "user", content: "hola" }], fake([{ stop_reason: "end_turn", content: [] }]).client)).rejects.toThrow(/vacía/);
    await expect(askClaude(ctx, "A", [{ role: "assistant", content: "hola" }], fake([]).client)).rejects.toThrow();
  });
});
