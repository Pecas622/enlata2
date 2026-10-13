// Campañas: estado por fechas, presupuesto por día y el brief para cargar la campaña en Meta Ads.
// Todo es puro. El brief nunca inventa datos: usa la campaña, la marca y las piezas; lo que es sugerencia se marca como tal.
import { checkCopy, type Format, type Goal } from "./channels";
import { generateVariants, sourceText, type BrandCtx } from "./generator";

export type CampaignStatus = "Planificada" | "En curso" | "Terminada";

export type CampaignCore = {
  name: string;
  goal: Goal;
  starts_on: string;
  ends_on: string;
  budget: number;
  offer: string;
  audience: string;
  locations: string;
  age_min: number;
  age_max: number;
  interests: string;
};

export type PieceLite = { format: Format; status: string; body: string; title: string };

export function campaignStatus(c: Pick<CampaignCore, "starts_on" | "ends_on">, today: string): CampaignStatus {
  if (today < c.starts_on) return "Planificada";
  if (today > c.ends_on) return "Terminada";
  return "En curso";
}

export function statusTone(s: CampaignStatus): "blue" | "green" | "gray" {
  return s === "En curso" ? "green" : s === "Planificada" ? "blue" : "gray";
}

// Días de campaña, contando el primero y el último.
export function campaignDays(c: Pick<CampaignCore, "starts_on" | "ends_on">) {
  return Math.round((Date.parse(c.ends_on + "T12:00:00Z") - Date.parse(c.starts_on + "T12:00:00Z")) / 86_400_000) + 1;
}

export function dailyBudget(c: Pick<CampaignCore, "starts_on" | "ends_on" | "budget">) {
  const days = campaignDays(c);
  return days > 0 ? Math.floor(c.budget / days) : 0;
}

const ars = new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 });
export function fmtARS(n: number) {
  return ars.format(n);
}

// Avance: piezas listas (aprobadas o publicadas) sobre el total.
export function progress(pieces: Pick<PieceLite, "status">[]) {
  const ready = pieces.filter((p) => p.status === "Aprobado" || p.status === "Publicado").length;
  return { ready, total: pieces.length, pct: pieces.length ? Math.round((ready / pieces.length) * 100) : 0 };
}

// ---------- Brief para Meta Ads ----------

export type MetaObjective = { objective: string; destination: string; button: string; why: string };

// Objetivo de Meta sugerido según el objetivo de la campaña y por dónde vende la marca (web o WhatsApp).
export function metaObjective(goal: Goal, brand: Pick<BrandCtx, "website" | "whatsapp">): MetaObjective {
  const web = Boolean(brand.website.trim());
  const wa = Boolean(brand.whatsapp.trim());
  const toChat = { destination: wa ? "Apps de mensajes: WhatsApp" : "Messenger e Instagram Direct", button: "Enviar mensaje" };
  switch (goal) {
    case "Vender":
    case "Promoción":
      return web
        ? { objective: "Ventas", destination: `Sitio web (${brand.website.trim()})`, button: "Comprar", why: "Meta muestra el anuncio a quienes tienen más chances de comprar." }
        : { objective: "Interacción", ...toChat, why: "Sin tienda online, la venta se cierra por mensaje: el anuncio abre el chat." };
    case "Conseguir consultas":
      return { objective: "Clientes potenciales", ...toChat, why: "Busca personas que escriban para consultar." };
    case "Lanzamiento":
      return { objective: "Reconocimiento", destination: "Alcance (que lo vea la mayor cantidad de gente de la zona)", button: "Más información", why: "Para una novedad importa que la vean muchos, no el clic." };
    case "Comunidad":
      return { objective: "Interacción", destination: "Interacción con la publicación", button: "Más información", why: "Suma comentarios, guardados y seguidores." };
    case "Educar":
      return web
        ? { objective: "Tráfico", destination: `Sitio web (${brand.website.trim()})`, button: "Más información", why: "Lleva gente a leer más en la web." }
        : { objective: "Interacción", destination: "Interacción con la publicación", button: "Más información", why: "Que la guarden y la compartan." };
  }
}

// Ubicaciones sugeridas según los formatos que tiene la campaña.
export function placements(formats: Format[]): string[] {
  const out: string[] = [];
  if (formats.some((f) => f === "Post" || f === "Carrusel" || f === "Anuncio")) out.push("Feed de Instagram y Facebook");
  if (formats.includes("Reel")) out.push("Reels de Instagram y Facebook");
  if (formats.includes("Historia")) out.push("Historias de Instagram y Facebook");
  return out.length ? out : ["Ubicaciones automáticas (Advantage+)"];
}

const splitList = (s: string) => s.split(/[,;\n]+/).map((x) => x.trim()).filter(Boolean);

export type AdCopy = { primary: string; title: string; description: string; button: string; source: "pieza" | "plantilla"; warnings: string[] };

// Lee "Texto principal: / Título: / Descripción: / Botón:" de una pieza de anuncio.
export function parseAd(body: string): Omit<AdCopy, "source" | "warnings"> | null {
  const get = (k: string) => body.match(new RegExp(`^${k}:\\s*(.*)$`, "im"))?.[1]?.trim() ?? "";
  const primary = get("Texto principal");
  if (!primary) return null;
  return { primary, title: get("Título"), description: get("Descripción"), button: get("Botón") };
}

export type Brief = {
  objective: MetaObjective;
  dates: string;
  days: number;
  budget: number;
  daily: number;
  locations: string;
  locationsSuggested: boolean;
  ages: string;
  audience: string;
  interests: string[];
  interestsSuggested: boolean;
  placements: string[];
  ads: AdCopy[];
  missing: string[];
};

export function buildBrief(c: CampaignCore, brand: BrandCtx, pieces: PieceLite[]): Brief {
  const objective = metaObjective(c.goal, brand);
  const fromPieces = pieces
    .filter((p) => p.format === "Anuncio" && p.status !== "Idea")
    .map((p) => parseAd(p.body))
    .filter((a): a is NonNullable<typeof a> => a !== null)
    .map((a) => ({ ...a, button: a.button || objective.button, source: "pieza" as const, warnings: [] }));
  // Sin anuncios escritos, se proponen con las plantillas (los mismos datos de la marca y la oferta de la campaña).
  const req = { channel: "Instagram" as const, format: "Anuncio" as const, goal: c.goal, topic: c.name, offer: c.offer };
  const ads: AdCopy[] = fromPieces.length
    ? fromPieces
    : generateVariants(brand, req, 0).flatMap((v) => {
        const a = parseAd(v.body);
        return a ? [{ ...a, button: objective.button, source: "plantilla" as const, warnings: checkCopy(v, "Instagram", "Anuncio", brand, sourceText(brand, req)) }] : [];
      });
  const interests = splitList(c.interests);
  const suggested = interests.length ? interests : [brand.industry, ...splitList(brand.products)].filter(Boolean).slice(0, 6);
  const missing: string[] = [];
  if (c.budget <= 0) missing.push("Cargá el presupuesto para calcular cuánto invertir por día.");
  if (!c.audience.trim() && !brand.audience.trim()) missing.push("Contá a quién apunta la campaña.");
  if (!pieces.length) missing.push("Todavía no tiene piezas: sumá las que van a salir o generá anuncios para la campaña.");
  return {
    objective,
    dates: `${fmtDay(c.starts_on)} al ${fmtDay(c.ends_on)}`,
    days: campaignDays(c),
    budget: c.budget,
    daily: dailyBudget(c),
    locations: c.locations.trim() || brand.city,
    locationsSuggested: !c.locations.trim(),
    ages: `${c.age_min} a ${c.age_max === 65 ? "65 o más" : c.age_max} años`,
    audience: c.audience.trim() || brand.audience,
    interests: suggested,
    interestsSuggested: !interests.length,
    placements: placements([...new Set(pieces.map((p) => p.format))]),
    ads,
    missing,
  };
}

function fmtDay(d: string) {
  return `${Number(d.slice(8, 10))}/${Number(d.slice(5, 7))}/${d.slice(0, 4)}`;
}

// El brief como texto, para copiarlo y pasárselo a quien carga los anuncios.
export function briefText(name: string, brandName: string, b: Brief) {
  const lines = [
    `Campaña: ${name} (${brandName})`,
    `Objetivo en Meta: ${b.objective.objective} · ${b.objective.destination}`,
    `Fechas: ${b.dates} (${b.days} días)`,
    b.budget > 0 ? `Presupuesto: ${fmtARS(b.budget)} en total, unos ${fmtARS(b.daily)} por día` : "Presupuesto: a definir",
    `Ubicación: ${b.locations || "a definir"}`,
    `Edad: ${b.ages}`,
    b.audience ? `Público: ${b.audience}` : "",
    `Intereses${b.interestsSuggested ? " (sugeridos, revisalos en Meta)" : ""}: ${b.interests.join(", ") || "a definir"}`,
    `Ubicaciones: ${b.placements.join(", ")}`,
    "",
    ...b.ads.flatMap((a, i) => [`Anuncio ${i + 1}`, `Texto principal: ${a.primary}`, `Título: ${a.title}`, `Descripción: ${a.description}`, `Botón: ${a.button}`, ""]),
  ];
  return lines.filter((l, i) => l !== "" || lines[i - 1] !== "").join("\n").trim();
}
