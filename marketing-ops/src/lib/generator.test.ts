import { describe, expect, it } from "vitest";
import { checkCopy, countHashtags, formatsFor, CHANNELS, FORMATS, GOALS, isValidCombo } from "./channels";
import { ctaFor, generateVariants, hashtagsFor, sourceText, usesEmoji, type BrandCtx, type GenRequest } from "./generator";

const espiga: BrandCtx = {
  name: "La Espiga",
  industry: "Panadería",
  city: "Godoy Cruz, Mendoza",
  description: "Panadería de barrio con masa madre y facturas del día.",
  audience: "Vecinos y oficinas de la zona",
  value_prop: "Todo sale del horno esa misma mañana, con masa madre y sin premezclas.",
  products: "Pan de masa madre, facturas, medialunas, tortas por encargo",
  tone: ["Cercano"],
  words_avoid: "barato, industrial",
  cta: "Pedí por WhatsApp y retirá sin hacer fila",
  hashtags: "laespiga, masamadre, godoycruz",
  website: "",
  instagram: "@laespiga",
  whatsapp: "+54 9 261 555 0101",
};
const req = (r: Partial<GenRequest> = {}): GenRequest => ({ channel: "Instagram", format: "Post", goal: "Vender", topic: "medialunas de manteca", ...r });

describe("generateVariants", () => {
  it("en un anuncio, la oferta entra en el texto principal aunque el objetivo no sea promoción", () => {
    for (const v of generateVariants(espiga, req({ format: "Anuncio", goal: "Vender", offer: "Budín de limón con glaseado" }))) {
      expect(v.body.match(/Texto principal: (.*)/)![1]).toContain("Budín de limón con glaseado");
    }
  });

  it("arma tres variantes con ángulos distintos", () => {
    const v = generateVariants(espiga, req());
    expect(v).toHaveLength(3);
    expect(new Set(v.map((x) => x.angle)).size).toBe(3);
    expect(new Set(v.map((x) => x.body)).size).toBe(3);
    for (const x of v) expect(x.body.toLowerCase()).toContain("medialunas");
  });

  it("toda combinación válida de canal, formato y objetivo pasa el chequeo sin avisos", () => {
    for (const channel of CHANNELS)
      for (const format of formatsFor(channel))
        for (const goal of GOALS) {
          const r = req({ channel, format, goal, offer: goal === "Promoción" ? "2x1 los martes" : undefined });
          for (const v of generateVariants(espiga, r)) {
            expect(checkCopy(v, channel, format, espiga, sourceText(espiga, r)), `${channel}/${format}/${goal}: ${v.body}`).toEqual([]);
          }
        }
  });

  it("no inventa ofertas: sin offer no aparecen precios ni porcentajes", () => {
    for (const goal of GOALS) for (const v of generateVariants(espiga, req({ goal }))) expect(v.body).not.toMatch(/\$|%|\dx\d/);
  });

  it("la oferta aparece tal cual la escribió la persona", () => {
    const v = generateVariants(espiga, req({ goal: "Promoción", offer: "2x1 los martes" }));
    expect(v.every((x) => x.body.includes("2x1 los martes"))).toBe(true);
  });

  it("los formatos llevan su estructura", () => {
    expect(generateVariants(espiga, req({ format: "Reel" }))[0].body).toMatch(/^0-3 s · Gancho:/);
    expect(generateVariants(espiga, req({ format: "Carrusel" }))[0].body).toMatch(/^Placa 1:/);
    expect(generateVariants(espiga, req({ format: "Anuncio" }))[0].body).toMatch(/Texto principal:.*\nTítulo:.*\nDescripción:.*\nBotón:/);
    expect(generateVariants(espiga, req({ channel: "Email", format: "Mensaje" }))[0].body).toMatch(/^Asunto: /);
    expect(generateVariants(espiga, req({ format: "Historia" }))[0].body).toMatch(/Sticker:/);
  });

  it("seed rota las plantillas", () => {
    expect(generateVariants(espiga, req(), 1)[0].angle).toBe(generateVariants(espiga, req())[1].angle);
  });
});

describe("reglas por canal", () => {
  it("emojis solo con tono cercano o divertido y en redes que los usan", () => {
    expect(usesEmoji(espiga, "Instagram")).toBe(true);
    expect(usesEmoji(espiga, "LinkedIn")).toBe(false);
    expect(usesEmoji({ tone: ["Profesional"] }, "Instagram")).toBe(false);
    expect(generateVariants({ ...espiga, tone: ["Profesional"] }, req())[0].body).not.toMatch(/\p{Extended_Pictographic}/u);
  });

  it("hashtags hasta el máximo de la red y ninguno en WhatsApp o email", () => {
    expect(hashtagsFor(espiga, req())).toBe("#laespiga #masamadre #godoycruz #medialunasmanteca");
    expect(hashtagsFor(espiga, req({ format: "Anuncio" }))).toBe("");
    expect(countHashtags(hashtagsFor(espiga, req({ channel: "Facebook" })))).toBeLessThanOrEqual(3);
    expect(hashtagsFor(espiga, req({ channel: "WhatsApp" }))).toBe("");
    expect(hashtagsFor(espiga, req({ channel: "Email" }))).toBe("");
  });

  it("en WhatsApp no dice \"escribinos por WhatsApp\"", () => {
    expect(ctaFor(espiga, { goal: "Vender", channel: "WhatsApp" })).not.toMatch(/whatsapp/i);
    expect(ctaFor({ cta: "" }, { goal: "Educar", channel: "Instagram" })).toBe("Guardalo para tenerlo a mano");
  });

  it("combos válidos", () => {
    expect(isValidCombo("TikTok", "Carrusel")).toBe(false);
    expect(isValidCombo("Email", "Mensaje")).toBe(true);
    for (const c of CHANNELS) expect(formatsFor(c).every((f) => FORMATS.includes(f))).toBe(true);
  });
});

describe("checkCopy", () => {
  const ok = { body: "Medialunas recién hechas. Pedí por WhatsApp.", hashtags: "#laespiga", cta: "Pedí por WhatsApp" };
  it("avisa palabras que la marca evita", () => {
    expect(checkCopy({ ...ok, body: "Las más baratas no, las más ricas. Pan BARATO." }, "Instagram", "Post", espiga)).toContain("Usa palabras que la marca evita: barato.");
  });
  it("avisa precios o descuentos que no estaban en el pedido", () => {
    const w = checkCopy({ ...ok, body: "20% off en medialunas y docena a $5.000" }, "Instagram", "Post", espiga, "medialunas");
    expect(w.join(" ")).toContain("20%");
    expect(w.join(" ")).toContain("$5.000");
    expect(checkCopy({ ...ok, body: "2x1 los martes" }, "Instagram", "Post", espiga, "promo 2x1 los martes")).toEqual([]);
  });
  it("avisa largo, hashtags de más y falta de llamado a la acción", () => {
    expect(checkCopy({ ...ok, body: "x".repeat(1200) }, "WhatsApp", "Mensaje", espiga).join(" ")).toContain("hasta 1000");
    expect(checkCopy({ ...ok, hashtags: "#a #b #c #d" }, "Facebook", "Post", espiga).join(" ")).toContain("hasta 3");
    expect(checkCopy({ ...ok, hashtags: "#a" }, "WhatsApp", "Mensaje", espiga)).toContain("En WhatsApp no van hashtags.");
    expect(checkCopy({ body: "Hoy hay medialunas.", hashtags: "", cta: "" }, "Instagram", "Post", espiga)).toContain("Falta un llamado a la acción.");
  });
});
