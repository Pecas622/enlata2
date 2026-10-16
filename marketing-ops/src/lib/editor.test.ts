import { describe, expect, it } from "vitest";
import type Anthropic from "@anthropic-ai/sdk";
import { countEmojis, editInstruction, editSource, parseEdit, ruleEdit, shorten, stripEmojis, EditRejected, type EditPiece } from "./editor";
import { editUserPrompt, editWithClaude } from "./editor-ai";
import { generateVariants, type BrandCtx } from "./generator";
import { AiUnavailable } from "./generator-ai";

const espiga: BrandCtx = {
  name: "La Espiga", industry: "Panadería", city: "Godoy Cruz, Mendoza",
  description: "Panadería de barrio con masa madre y facturas del día.", audience: "Vecinos y oficinas de la zona",
  value_prop: "Todo sale del horno esa misma mañana, con masa madre y sin premezclas.",
  products: "Pan de masa madre, facturas, medialunas, tortas por encargo", tone: ["Cercano"], words_avoid: "barato, industrial",
  cta: "Pedí por WhatsApp y retirá sin hacer fila", hashtags: "laespiga, masamadre, godoycruz", website: "", instagram: "@laespiga", whatsapp: "",
};

const post = `¿Ya probaste las medialunas de manteca de La Espiga? ✨

Todo sale del horno esa misma mañana. Usamos masa madre y nada de premezclas, como antes.
Las hacemos a mano todos los días. Hay de manteca y de grasa.
También tenemos facturas surtidas para la oficina. Pedilas con tiempo.

👉 Pedí por WhatsApp y retirá sin hacer fila.
📍 Godoy Cruz, Mendoza`;

const piece = (p: Partial<EditPiece> = {}): EditPiece => ({
  body: post, hashtags: "#laespiga #masamadre", cta: "Pedí por WhatsApp y retirá sin hacer fila", channel: "Instagram", format: "Post", goal: "Vender", ...p,
});

describe("pedidos", () => {
  it("un pedido rápido o uno escrito; vacío no sirve", () => {
    expect(editInstruction("corto", "lo que sea")).toMatchObject({ label: "Más corto", action: "corto" });
    expect(editInstruction("", "  nombrá   los envíos ")).toEqual({ prompt: "nombrá los envíos", label: "nombrá los envíos", action: null });
    expect(editInstruction("", "   ")).toBeNull();
    expect(editInstruction("", "x".repeat(500))!.prompt).toHaveLength(300);
  });
});

describe("editar sin IA", () => {
  it("más corto: deja el gancho, lo principal y el llamado, y saca el resto", () => {
    const r = ruleEdit(piece(), "corto", espiga);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const body = r.copy.body;
    expect(body.length).toBeLessThan(post.length);
    expect(body.split("\n")[0]).toBe("¿Ya probaste las medialunas de manteca de La Espiga? ✨");
    expect(body).toContain("👉 Pedí por WhatsApp y retirá sin hacer fila.");
    expect(body).toContain("Todo sale del horno esa misma mañana.");
    expect(body).not.toContain("premezclas");
    expect(body).not.toContain("facturas surtidas");
    expect(body).not.toContain("📍");
    expect(r.copy.hashtags).toBe("#laespiga #masamadre");
    // Ya corto, no hay nada para sacar.
    expect(ruleEdit(piece({ body: r.copy.body }), "corto", espiga)).toMatchObject({ ok: false, error: expect.stringContaining("Ya está corto") });
  });

  it("más corto en un carrusel recorta cada placa sin perder la etiqueta", () => {
    const body = "Placa 1: Medialunas del día. Recién salidas del horno.\nPlaca 2: Masa madre. Sin premezclas.\n\nTexto del posteo: Vení a buscarlas. Pedí por WhatsApp.";
    expect(shorten(body, "")).toBe("Placa 1: Medialunas del día.\nPlaca 2: Masa madre.\n\nTexto del posteo: Vení a buscarlas.");
  });

  it("sacar y sumar emojis", () => {
    const r = ruleEdit(piece(), "sin-emojis", espiga);
    expect(r.ok && countEmojis(r.copy.body)).toBe(0);
    expect(r.ok && r.copy.body.split("\n")[0]).toBe("¿Ya probaste las medialunas de manteca de La Espiga?");
    expect(ruleEdit(piece({ body: "Hola" }), "sin-emojis", espiga)).toMatchObject({ ok: false });
    const plain = stripEmojis(post);
    const add = ruleEdit(piece({ body: plain }), "emojis", espiga);
    expect(add.ok && add.copy.body.split("\n")[0]).toMatch(/✨$/);
    expect(add.ok && add.copy.body).toContain("👉 Pedí por WhatsApp");
    expect(ruleEdit(piece({ body: plain, channel: "LinkedIn" }), "emojis", espiga)).toMatchObject({ ok: false, error: expect.stringContaining("LinkedIn") });
  });

  it("reforzar el llamado: suma el de la marca si no está", () => {
    const r = ruleEdit(piece({ body: "Medialunas recién salidas.", cta: "" }), "cta", espiga);
    expect(r).toMatchObject({ ok: true, copy: { body: "Medialunas recién salidas.\n\nPedí por WhatsApp y retirá sin hacer fila.", cta: "Pedí por WhatsApp y retirá sin hacer fila" } });
    expect(ruleEdit(piece(), "cta", espiga)).toMatchObject({ ok: false });
  });

  it("corregir: espacios, puntuación y mayúsculas", () => {
    const r = ruleEdit(piece({ body: "hola vecinos  , hoy hay medialunas.Pedí por whatsapp en laespiga.com.ar" }), "corregir", espiga);
    expect(r).toMatchObject({ ok: true, copy: { body: "Hola vecinos, hoy hay medialunas. Pedí por whatsapp en laespiga.com.ar" } });
  });

  it("lo que necesita la IA lo dice", () => {
    expect(ruleEdit(piece(), "vendedor", espiga)).toMatchObject({ ok: false, error: expect.stringContaining("Esto lo hace la IA") });
    expect(ruleEdit(piece(), null, espiga)).toMatchObject({ ok: false });
  });

  it("las plantillas acortadas siguen sin números inventados", () => {
    for (const v of generateVariants(espiga, { channel: "Instagram", format: "Post", goal: "Vender", topic: "medialunas" })) {
      const r = ruleEdit(piece({ body: v.body, cta: v.cta }), "corto", espiga);
      if (r.ok) expect(r.copy.body.length).toBeLessThanOrEqual(v.body.length);
    }
  });
});

describe("lo que devuelve la IA", () => {
  const src = editSource(piece(), espiga, "hacelo más vendedor");

  it("normaliza hashtags y se queda con el llamado de antes si no trae uno", () => {
    const out = parseEdit(JSON.stringify({ texto: " Medialunas del día. Pedí por WhatsApp. ", hashtags: ["#LaEspiga", "masa madre", "a", "b", "c", "d"], cta: "", cambios: "Lo acorté." }), piece(), src);
    expect(out).toEqual({ copy: { body: "Medialunas del día. Pedí por WhatsApp.", hashtags: "#laespiga #masamadre #a #b #c", cta: "Pedí por WhatsApp y retirá sin hacer fila" }, summary: "Lo acorté." });
  });

  it("descarta lo que trae precios o porcentajes que no estaban", () => {
    expect(() => parseEdit(JSON.stringify({ texto: "Medialunas con 20% off", hashtags: [], cta: "x", cambios: "" }), piece(), src)).toThrow(EditRejected);
    const ok = editSource(piece(), espiga, "decí que la docena está $5.000");
    expect(parseEdit(JSON.stringify({ texto: "La docena a $5.000", hashtags: [], cta: "x", cambios: "" }), piece(), ok).copy.body).toBe("La docena a $5.000");
    expect(() => parseEdit("no es json", piece(), src)).toThrow(EditRejected);
    expect(() => parseEdit(JSON.stringify({ texto: "" }), piece(), src)).toThrow(EditRejected);
  });

  it("en anuncios y WhatsApp no deja hashtags", () => {
    const out = parseEdit(JSON.stringify({ texto: "Texto principal: Medialunas", hashtags: ["#a"], cta: "", cambios: "" }), piece({ format: "Anuncio" }), src);
    expect(out.copy.hashtags).toBe("");
  });

  it("el pedido lleva la pieza, la marca y lo que se pide", () => {
    const p = editUserPrompt(espiga, piece(), "hacelo más vendedor");
    expect(p).toContain(post);
    expect(p).toContain("Pedido: hacelo más vendedor");
    expect(p).toContain("barato, industrial");
  });

  it("con un cliente de mentira: usa la respuesta válida y rechaza la que inventa", async () => {
    const fake = (texto: string) => ({
      beta: { messages: { create: async () => ({ stop_reason: "end_turn", content: [{ type: "text", text: JSON.stringify({ texto, hashtags: ["laespiga"], cta: "Pedí por WhatsApp", cambios: "Más directo." }) }] }) } },
    }) as unknown as Anthropic;
    await expect(editWithClaude(espiga, piece(), "más vendedor", fake("Medialunas del día. Pedí por WhatsApp."))).resolves.toMatchObject({ summary: "Más directo.", copy: { hashtags: "#laespiga" } });
    await expect(editWithClaude(espiga, piece(), "más vendedor", fake("Medialunas 2x1 hoy"))).rejects.toThrow(AiUnavailable);
  });
});
