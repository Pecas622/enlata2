// Generador por plantillas: arma 3 variantes de una pieza con los datos de la marca y el pedido.
// Es el camino sin clave de IA (o cuando la IA falla) y nunca inventa precios, descuentos ni datos:
// solo usa lo que está cargado en la marca y lo que escribió la persona.
import {
  AD_PRIMARY_MAX,
  AD_TITLE_MAX,
  CHANNEL_RULES,
  EMAIL_SUBJECT_MAX,
  normalizeHashtags,
  type Channel,
  type Format,
  type Goal,
} from "./channels";

export type BrandCtx = {
  name: string;
  industry: string;
  city: string;
  description: string;
  audience: string;
  value_prop: string;
  products: string;
  tone: string[];
  words_avoid: string;
  cta: string;
  hashtags: string;
  website: string;
  instagram: string;
  whatsapp: string;
};

export type GenRequest = {
  channel: Channel;
  format: Format;
  goal: Goal;
  topic: string; // de qué habla la pieza: producto, servicio, novedad
  offer?: string; // promo o dato concreto, tal cual lo escribió la persona
  extra?: string; // algo más que tenga que decir
};

export type Variant = { angle: string; title: string; body: string; hashtags: string; cta: string };

const GOAL_EMOJI: Record<Goal, string> = {
  Vender: "✨",
  "Conseguir consultas": "💬",
  Lanzamiento: "🚀",
  Promoción: "🔥",
  Comunidad: "🙌",
  Educar: "💡",
};

const DEFAULT_CTA: Record<Goal, string> = {
  Vender: "Escribinos y te lo reservamos",
  "Conseguir consultas": "Escribinos y te asesoramos",
  Lanzamiento: "Escribinos para ser de los primeros",
  Promoción: "Escribinos antes de que se termine",
  Comunidad: "Contanos en los comentarios",
  Educar: "Guardalo para tenerlo a mano",
};

const AD_BUTTON: Record<Goal, string> = {
  Vender: "Comprar",
  "Conseguir consultas": "Enviar mensaje",
  Lanzamiento: "Más información",
  Promoción: "Enviar mensaje",
  Comunidad: "Más información",
  Educar: "Más información",
};

const STORY_STICKER: Record<Goal, string> = {
  Vender: "Sticker de link o de mensaje directo",
  "Conseguir consultas": "Sticker de preguntas: \"¿Qué querés saber?\"",
  Lanzamiento: "Sticker de cuenta regresiva",
  Promoción: "Sticker de link o de mensaje directo",
  Comunidad: "Sticker de encuesta",
  Educar: "Sticker de quiz",
};

type Hook = { angle: string; text: (c: Ctx) => string };
type Ctx = { topic: string; topicLow: string; brand: string; city: string; value: string; offer: string };

const HOOKS: Record<Goal, Hook[]> = {
  Vender: [
    { angle: "Pregunta", text: (c) => `¿Ya probaste ${c.topicLow} de ${c.brand}?` },
    { angle: "Beneficio", text: (c) => (c.value ? `${c.topic}: ${lower(c.value)}` : `${c.topic}, como tiene que ser.`) },
    { angle: "Escena", text: (c) => `Si estás buscando ${c.topicLow}${c.city ? ` en ${c.city}` : ""}, esto es para vos.` },
  ],
  "Conseguir consultas": [
    { angle: "Pregunta", text: (c) => `¿Tenés dudas con ${c.topicLow}? Preguntanos sin compromiso.` },
    { angle: "Ayuda", text: (c) => `Contanos qué necesitás y te pasamos todo sobre ${c.topicLow}.` },
    { angle: "Directo", text: (c) => `${c.topic}, sin vueltas: te asesoramos por mensaje.` },
  ],
  Lanzamiento: [
    { angle: "Novedad", text: (c) => `Nuevo en ${c.brand}: ${c.topicLow}.` },
    { angle: "Primicia", text: (c) => `Llegó ${c.topicLow} y lo queríamos contar primero acá.` },
    { angle: "Detrás de escena", text: (c) => `Lo estuvimos preparando un tiempo: ${c.topicLow}.` },
  ],
  Promoción: [
    { angle: "Oferta", text: (c) => (c.offer ? `${c.topic}: ${lower(c.offer)}.` : `Promo en ${c.brand}: ${c.topicLow}.`) },
    { angle: "Urgencia", text: (c) => (c.offer ? `No te lo pierdas: ${c.topicLow}, ${lower(c.offer)}.` : `Solo por estos días: ${c.topicLow}.`) },
    { angle: "Para compartir", text: (c) => (c.offer ? `Avisale a quien lo necesite: ${c.topicLow}, ${lower(c.offer)}.` : `Avisale a quien lo necesite: ${c.topicLow}.`) },
  ],
  Comunidad: [
    { angle: "Pregunta abierta", text: (c) => `Contanos en los comentarios: ¿cómo te gusta ${c.topicLow}?` },
    { angle: "Detrás de escena", text: (c) => `Así es ${c.topicLow} en ${c.brand}, desde adentro.` },
    { angle: "Agradecimiento", text: (c) => `Gracias por elegirnos. Hoy te queremos contar sobre ${c.topicLow}.` },
  ],
  Educar: [
    { angle: "Lo que nadie cuenta", text: (c) => `Lo que nadie te cuenta sobre ${c.topicLow}.` },
    { angle: "Antes de elegir", text: (c) => `Antes de elegir ${c.topicLow}, mirá esto.` },
    { angle: "Guardalo", text: (c) => `Guardá este post: ${c.topicLow}, explicado fácil.` },
  ],
};

function cap(s: string) {
  return s ? s[0].toUpperCase() + s.slice(1) : s;
}
function lower(s: string) {
  // Baja solo la primera letra, para no romper siglas ni nombres propios del medio.
  return s && s[1] !== s[1]?.toUpperCase() ? s[0].toLowerCase() + s.slice(1) : s;
}
function sentence(s: string) {
  const t = s.trim();
  return !t ? "" : /[.!?…]$/.test(t) ? cap(t) : cap(t) + ".";
}
function trimTo(s: string, max: number) {
  if (s.length <= max) return s;
  const cut = s.slice(0, max - 1);
  return cut.slice(0, Math.max(cut.lastIndexOf(" "), max * 0.6)).replace(/[,;:\s]+$/, "") + "…";
}
function list(s: string) {
  return s.split(/[,;\n]+/).map((x) => x.trim()).filter(Boolean);
}

// Emojis solo si el tono es cercano o divertido y la red los usa.
export function usesEmoji(brand: Pick<BrandCtx, "tone">, channel: Channel) {
  return CHANNEL_RULES[channel].emojis && brand.tone.some((t) => t === "Cercano" || t === "Divertido");
}

// El llamado a la acción de la marca, ajustado al canal: en WhatsApp no tiene sentido "escribinos por WhatsApp".
export function ctaFor(brand: Pick<BrandCtx, "cta">, req: Pick<GenRequest, "goal" | "channel">) {
  const base = brand.cta.trim() || DEFAULT_CTA[req.goal];
  if (req.channel === "WhatsApp" && /whats ?app/i.test(base)) return "Respondé este mensaje y lo coordinamos";
  return base;
}

const STOPWORDS = new Set(["de", "del", "la", "el", "los", "las", "y", "para", "con", "en", "un", "una", "por", "a", "al"]);

// Hashtags de la marca más uno del tema (sus palabras juntas, si queda corto), hasta el máximo de la red.
// Los anuncios no llevan: en Meta Ads no suman alcance y le restan lugar al texto.
export function hashtagsFor(brand: Pick<BrandCtx, "hashtags">, req: Pick<GenRequest, "channel" | "topic" | "format">) {
  const max = CHANNEL_RULES[req.channel].maxHashtags;
  if (max === 0 || req.format === "Anuncio") return "";
  const words = req.topic.toLowerCase().split(/\s+/).filter((w) => w && !STOPWORDS.has(w));
  const topicTag = words.join("");
  return normalizeHashtags([...list(brand.hashtags), ...(words.length && topicTag.length <= 20 ? [topicTag] : [])], max);
}

function context(brand: BrandCtx, req: GenRequest): Ctx {
  const topic = cap(req.topic.trim() || list(brand.products)[0] || brand.name);
  return {
    topic,
    topicLow: lower(topic),
    brand: brand.name,
    city: brand.city.split(",")[0].trim(),
    value: brand.value_prop.trim().replace(/[.]$/, ""),
    offer: (req.offer ?? "").trim().replace(/[.]$/, ""),
  };
}

function middle(brand: BrandCtx, req: GenRequest, c: Ctx, i: number): string[] {
  const lines: string[] = [];
  const value = sentence(brand.value_prop);
  const desc = sentence(brand.description);
  // Cada variante cuenta algo distinto para que no sean la misma pieza tres veces.
  if (i === 0 && value) lines.push(value);
  else if (i === 1 && desc) lines.push(desc);
  else if (value || desc) lines.push(value || desc);
  // En una promoción la oferta ya va en la primera línea; en el resto, se suma al medio.
  if (c.offer && req.goal !== "Promoción") lines.push(sentence(c.offer));
  if (req.extra?.trim()) lines.push(sentence(req.extra));
  return lines;
}

function buildBody(brand: BrandCtx, req: GenRequest, hook: Hook, i: number): { title: string; body: string } {
  const c = context(brand, req);
  const emoji = usesEmoji(brand, req.channel);
  const cta = ctaFor(brand, req);
  const hookText = hook.text(c);
  const hookLine = emoji ? `${hookText} ${GOAL_EMOJI[req.goal]}` : hookText;
  const ctaLine = emoji ? `👉 ${sentence(cta)}` : sentence(cta);
  const mid = middle(brand, req, c, i);
  const where = c.city && emoji ? `📍 ${brand.city}` : c.city ? brand.city : "";
  const title = trimTo(hookText.replace(/[¿?¡!.]/g, "").trim(), 60);

  switch (req.format) {
    case "Carrusel": {
      const items = list(brand.products).slice(0, 3);
      const slides = [
        hookText,
        ...(req.goal === "Educar" ? ["Lo primero: " + lower(sentence(brand.value_prop || brand.description || c.topic))] : mid.slice(0, 2)),
        ...(items.length ? [`En ${brand.name} tenés: ${items.join(", ")}.`] : []),
        sentence(cta),
      ].filter(Boolean);
      const placas = slides.map((s, n) => `Placa ${n + 1}: ${s}`).join("\n");
      return { title, body: `${placas}\n\nTexto del posteo: ${hookLine} ${ctaLine}`.trim() };
    }
    case "Reel": {
      const shot = req.goal === "Educar" ? "Mostrá el paso a paso en primer plano" : `Mostrá ${c.topicLow} en uso, con planos cortos`;
      const scenes = [
        `0-3 s · Gancho: ${hookText}`,
        `3-10 s · ${shot}. Texto en pantalla: "${trimTo(mid[0] || c.topic, 70)}"`,
        mid[1] ? `10-20 s · Texto en pantalla: "${trimTo(mid[1], 70)}"` : `10-20 s · Mostrá el lugar y a quien lo hace.`,
        `20-25 s · Cierre con ${brand.name}: "${cta}"`,
      ];
      return { title, body: `${scenes.join("\n")}\n\nTexto del posteo: ${hookLine} ${ctaLine}` };
    }
    case "Historia": {
      return {
        title,
        body: [`Texto: ${trimTo(hookLine, 90)}`, `Sticker: ${STORY_STICKER[req.goal]}`, `Cierre: ${cta}`].join("\n"),
      };
    }
    case "Anuncio": {
      const primary = trimTo([hookLine, mid[0]].filter(Boolean).join(" "), AD_PRIMARY_MAX);
      const adTitle = trimTo(c.offer && req.goal === "Promoción" ? cap(c.offer) : c.topic, AD_TITLE_MAX);
      return {
        title,
        body: [`Texto principal: ${primary}`, `Título: ${adTitle}`, `Descripción: ${c.city && (brand.name + c.city).length <= 27 ? `${brand.name} · ${c.city}` : trimTo(brand.name, 30)}`, `Botón: ${AD_BUTTON[req.goal]}`].join("\n"),
      };
    }
    case "Mensaje": {
      if (req.channel === "Email") {
        const subject = trimTo(hookText, EMAIL_SUBJECT_MAX);
        return { title, body: [`Asunto: ${subject}`, "", "Hola,", "", ...mid, "", sentence(cta), "", `Equipo de ${brand.name}`].join("\n") };
      }
      const hi = `Hola! Te escribimos de ${brand.name}.`;
      return { title, body: [`${hi} ${hookLine}`, "", ...mid, "", ctaLine].join("\n").replace(/\n{3,}/g, "\n\n") };
    }
    default: {
      const parts = [hookLine, "", ...mid, "", ctaLine];
      if (where && req.channel !== "LinkedIn") parts.push(where);
      return { title, body: parts.join("\n").replace(/\n{3,}/g, "\n\n") };
    }
  }
}

// Tres variantes con ángulos distintos. `seed` rota las plantillas para "Generar otras".
export function generateVariants(brand: BrandCtx, req: GenRequest, seed = 0): Variant[] {
  const hooks = HOOKS[req.goal];
  const hashtags = hashtagsFor(brand, req);
  const cta = ctaFor(brand, req);
  return [0, 1, 2].map((i) => {
    const hook = hooks[(i + seed) % hooks.length];
    const { title, body } = buildBody(brand, req, hook, i);
    return { angle: hook.angle, title, body, hashtags, cta };
  });
}

// Texto con todo lo que la persona escribió y lo que tiene la marca: es la "fuente" contra la que se
// controla que la IA no haya inventado precios ni porcentajes.
export function sourceText(brand: BrandCtx, req: GenRequest) {
  return [brand.name, brand.description, brand.value_prop, brand.products, brand.cta, req.topic, req.offer ?? "", req.extra ?? ""].join(" ");
}
