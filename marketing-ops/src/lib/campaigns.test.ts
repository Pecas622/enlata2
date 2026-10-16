import { describe, expect, it } from "vitest";
import { briefText, buildBrief, campaignDays, campaignStatus, dailyBudget, metaObjective, parseAd, placements, progress, type CampaignCore } from "./campaigns";
import type { BrandCtx } from "./generator";

const brand: BrandCtx = {
  name: "La Espiga", industry: "Panadería y pastelería", city: "Godoy Cruz, Mendoza", description: "Panadería de barrio.",
  audience: "Vecinos de Godoy Cruz", value_prop: "Todo sale del horno esa misma mañana.", products: "Pan de masa madre, facturas, tortas por encargo",
  tone: ["Cercano"], words_avoid: "barato", cta: "Pedí por WhatsApp", hashtags: "laespiga", website: "", instagram: "@laespiga", whatsapp: "+54 9 261 555 0101",
};
const camp: CampaignCore = {
  name: "Día de la Madre", goal: "Promoción", starts_on: "2026-10-08", ends_on: "2026-10-18", budget: 55000,
  offer: "Torta de frutillas con 15% off encargando antes del jueves", product: "Tortas por encargo", link: "", audience: "", locations: "", age_min: 25, age_max: 65, interests: "",
};

describe("fechas y presupuesto", () => {
  it("el estado sale de las fechas", () => {
    expect(campaignStatus(camp, "2026-10-07")).toBe("Planificada");
    expect(campaignStatus(camp, "2026-10-08")).toBe("En curso");
    expect(campaignStatus(camp, "2026-10-18")).toBe("En curso");
    expect(campaignStatus(camp, "2026-10-19")).toBe("Terminada");
  });

  it("cuenta el primer y el último día y reparte el presupuesto", () => {
    expect(campaignDays(camp)).toBe(11);
    expect(dailyBudget(camp)).toBe(5000);
    expect(campaignDays({ starts_on: "2026-10-31", ends_on: "2026-11-01" })).toBe(2);
  });

  it("avance por piezas listas", () => {
    expect(progress([{ status: "Aprobado" }, { status: "Publicado" }, { status: "Borrador" }, { status: "Idea" }])).toEqual({ ready: 2, total: 4, pct: 50 });
    expect(progress([])).toEqual({ ready: 0, total: 0, pct: 0 });
  });
});

describe("brief para Meta Ads", () => {
  it("sin web, vender o promocionar va a mensajes de WhatsApp; con web, a ventas", () => {
    expect(metaObjective("Promoción", brand)).toMatchObject({ objective: "Interacción", destination: "Apps de mensajes: WhatsApp", button: "Enviar mensaje" });
    expect(metaObjective("Vender", { website: "rodarbikes.com.ar", whatsapp: "" })).toMatchObject({ objective: "Ventas", button: "Comprar" });
    expect(metaObjective("Lanzamiento", brand).objective).toBe("Reconocimiento");
    expect(metaObjective("Conseguir consultas", { website: "", whatsapp: "" }).destination).toBe("Messenger e Instagram Direct");
  });

  it("con página propia, el lanzamiento lleva tráfico a esa página y la página gana sobre la web de la marca", () => {
    expect(metaObjective("Lanzamiento", brand, "https://app.ejemplo.com/registro")).toMatchObject({ objective: "Tráfico", destination: "Sitio web (https://app.ejemplo.com/registro)" });
    expect(metaObjective("Lanzamiento", brand).destination).not.toContain("zona");
    expect(metaObjective("Vender", { website: "rodarbikes.com.ar", whatsapp: "" }, "https://rodarbikes.com.ar/promo").destination).toBe("Sitio web (https://rodarbikes.com.ar/promo)");
  });

  it("ubicaciones según los formatos", () => {
    expect(placements(["Reel", "Post"])).toEqual(["Feed de Instagram y Facebook", "Reels de Instagram y Facebook"]);
    expect(placements([])).toEqual(["Ubicaciones automáticas (Advantage+)"]);
  });

  it("lee los campos de un anuncio", () => {
    expect(parseAd("Texto principal: Hola\nTítulo: Tortas\nDescripción: La Espiga\nBotón: Enviar mensaje")).toEqual({ primary: "Hola", title: "Tortas", description: "La Espiga", button: "Enviar mensaje" });
    expect(parseAd("Un post cualquiera")).toBeNull();
  });

  it("sin anuncios escritos propone textos con la oferta tal cual, y avisa lo que falta", () => {
    const b = buildBrief(camp, brand, []);
    expect(b.ads.length).toBeGreaterThanOrEqual(1);
    expect(b.ads.every((a) => a.source === "plantilla" && a.button === "Enviar mensaje")).toBe(true);
    expect(b.ads.some((a) => a.primary.includes("15% off"))).toBe(true);
    expect(b.locations).toBe("Godoy Cruz, Mendoza");
    expect(b.locationsSuggested).toBe(true);
    expect(b.interests).toEqual(["Panadería y pastelería", "Pan de masa madre", "facturas", "tortas por encargo"]);
    expect(b.interestsSuggested).toBe(true);
    expect(b.ages).toBe("25 a 65 o más años");
    expect(b.missing).toEqual(["Todavía no tiene piezas: sumá las que van a salir o generá anuncios para la campaña."]);
  });

  it("usa los anuncios de la campaña y lo que cargó la persona", () => {
    const ad = { format: "Anuncio" as const, status: "Aprobado", title: "Tortas", body: "Texto principal: Encargá la torta para mamá\nTítulo: Tortas por encargo\nDescripción: La Espiga\nBotón: Enviar mensaje" };
    const b = buildBrief({ ...camp, locations: "Godoy Cruz y Luján", interests: "Repostería; Día de la Madre", budget: 0 }, brand, [ad, { format: "Reel", status: "Borrador", title: "x", body: "y" }]);
    expect(b.ads).toEqual([{ primary: "Encargá la torta para mamá", title: "Tortas por encargo", description: "La Espiga", button: "Enviar mensaje", source: "pieza", warnings: [] }]);
    expect(b.interests).toEqual(["Repostería", "Día de la Madre"]);
    expect(b.placements).toEqual(["Feed de Instagram y Facebook", "Reels de Instagram y Facebook"]);
    expect(b.missing).toContain("Cargá el presupuesto para calcular cuánto invertir por día.");
    const text = briefText("Día de la Madre", "La Espiga", b);
    expect(text).toContain("Objetivo en Meta: Interacción · Apps de mensajes: WhatsApp");
    expect(text).toContain("Presupuesto: a definir");
    expect(text).toContain("Anuncio 1\nTexto principal: Encargá la torta para mamá");
    expect(text).not.toMatch(/\n\n\n/);
  });

  it("los anuncios hablan de lo que promociona la campaña, no de su nombre, y no nombran la ciudad si el mercado es más amplio", () => {
    const enlata: BrandCtx = {
      name: "Enlata2", industry: "Software para negocios", city: "Mendoza, Argentina", description: "Sistemas que ya vienen listos para cada tipo de negocio.",
      audience: "Dueños de locales de iPhone", value_prop: "No hay que armar nada: el sistema ya viene hecho para tu rubro.", products: "Enlata2 para locales de iPhone, Enlata2 Marketing",
      tone: ["Directo"], words_avoid: "", cta: "Escribinos por WhatsApp", hashtags: "enlata2", website: "enlata2.vercel.app", instagram: "@enlata2.app", whatsapp: "+54 9 261 629 8065", market: "Todo el país",
    };
    const launch: CampaignCore = { ...camp, name: "Abrimos la lata: Enlata2 Marketing", goal: "Lanzamiento", offer: "", product: "Enlata2 Marketing", link: "https://app.ejemplo.com/registro" };
    const b = buildBrief(launch, enlata, []);
    expect(b.objective.objective).toBe("Tráfico");
    expect(b.locations).toBe("Todo el país");
    const all = b.ads.map((a) => `${a.primary} ${a.title} ${a.description}`).join(" ");
    expect(all).not.toMatch(/abrimos la lata/i);
    expect(all).not.toContain("Mendoza");
    expect(all).toContain("Enlata2 Marketing");
    expect(all).not.toContain("enlata2 Marketing");
  });
});
