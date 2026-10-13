// Canales, formatos y objetivos, con los límites de cada red y el chequeo de una pieza antes de guardarla.
// Los límites son los de cada red a octubre de 2026; los "recomendados" son para que el texto no se corte.

export const CHANNELS = ["Instagram", "Facebook", "TikTok", "LinkedIn", "WhatsApp", "Email"] as const;
export type Channel = (typeof CHANNELS)[number];

export const FORMATS = ["Post", "Carrusel", "Reel", "Historia", "Anuncio", "Mensaje"] as const;
export type Format = (typeof FORMATS)[number];

export const GOALS = ["Vender", "Conseguir consultas", "Lanzamiento", "Promoción", "Comunidad", "Educar"] as const;
export type Goal = (typeof GOALS)[number];

export const TONES = ["Cercano", "Profesional", "Divertido", "Inspirador", "Directo"] as const;
export type Tone = (typeof TONES)[number];

const FORMATS_BY_CHANNEL: Record<Channel, readonly Format[]> = {
  Instagram: ["Post", "Carrusel", "Reel", "Historia", "Anuncio"],
  Facebook: ["Post", "Carrusel", "Reel", "Historia", "Anuncio"],
  TikTok: ["Reel", "Anuncio"],
  LinkedIn: ["Post", "Carrusel"],
  WhatsApp: ["Mensaje", "Historia"],
  Email: ["Mensaje"],
};

export function formatsFor(channel: Channel): readonly Format[] {
  return FORMATS_BY_CHANNEL[channel];
}

export function isValidCombo(channel: Channel, format: Format) {
  return FORMATS_BY_CHANNEL[channel].includes(format);
}

// Cómo se llama el formato en cada red.
export function formatLabel(format: Format, channel?: Channel): string {
  if (format === "Reel") return channel === "TikTok" ? "Video" : "Reel";
  if (format === "Historia") return channel === "WhatsApp" ? "Estado" : "Historia";
  if (format === "Mensaje") return channel === "Email" ? "Email" : "Mensaje de difusión";
  return format;
}

type ChannelRule = { maxChars: number; maxHashtags: number; emojis: boolean };

export const CHANNEL_RULES: Record<Channel, ChannelRule> = {
  Instagram: { maxChars: 2200, maxHashtags: 5, emojis: true },
  Facebook: { maxChars: 2000, maxHashtags: 3, emojis: true },
  TikTok: { maxChars: 2200, maxHashtags: 5, emojis: true },
  LinkedIn: { maxChars: 3000, maxHashtags: 3, emojis: false },
  WhatsApp: { maxChars: 1000, maxHashtags: 0, emojis: true },
  Email: { maxChars: 3000, maxHashtags: 0, emojis: false },
};

// Recomendados por formato para que no se corte en pantalla.
export const AD_PRIMARY_MAX = 125;
export const AD_TITLE_MAX = 40;
export const STORY_MAX = 120;
export const EMAIL_SUBJECT_MAX = 60;

// "#pan, masa madre  #Godoy-Cruz" → "#pan #masamadre #godoycruz". Sin repetidos.
export function normalizeHashtags(input: string | string[], max = Infinity): string {
  const raw = Array.isArray(input) ? input : input.split(/[\s,;]+/);
  const out: string[] = [];
  for (const piece of raw) {
    const tag = piece
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9ñ]/g, "");
    if (tag && !out.includes(tag)) out.push(tag);
  }
  return out.slice(0, max).map((t) => "#" + t).join(" ");
}

export function countHashtags(text: string) {
  return (text.match(/#[\p{L}\p{N}_]+/gu) ?? []).length;
}

export function splitWords(list: string) {
  return list.split(/[,;\n]+/).map((w) => w.trim().toLowerCase()).filter(Boolean);
}

function plain(s: string) {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

// Palabras que la marca pidió no usar y que aparecen en el texto.
export function forbiddenUsed(text: string, wordsAvoid: string): string[] {
  const t = " " + plain(text).replace(/[^a-z0-9ñ]+/g, " ") + " ";
  return splitWords(wordsAvoid).filter((w) => t.includes(" " + plain(w).replace(/[^a-z0-9ñ]+/g, " ").trim() + " "));
}

// Precios, porcentajes y "2x1" que aparecen en el texto pero no en lo que escribió la persona ni en la marca.
// La IA no puede inventar ofertas: si aparece una, se avisa antes de guardar.
export function unbackedNumbers(text: string, source: string): string[] {
  const found = text.match(/\$\s?\d[\d.,]*|\d[\d.,]*\s?%|\d+\s?x\s?\d+|\bUS\$\s?\d[\d.,]*/gi) ?? [];
  const src = plain(source).replace(/\s+/g, "");
  return [...new Set(found.map((f) => f.trim()))].filter((f) => !src.includes(plain(f).replace(/\s+/g, "")));
}

export type CopyCheck = { body: string; hashtags: string; cta: string };
export type BrandRules = { words_avoid: string };

export function checkCopy(copy: CopyCheck, channel: Channel, format: Format, brand: BrandRules, source = ""): string[] {
  const rule = CHANNEL_RULES[channel];
  const warnings: string[] = [];
  const full = [copy.body, copy.hashtags].filter(Boolean).join("\n\n");
  if (!copy.body.trim()) warnings.push("Todavía no tiene texto.");
  if (full.length > rule.maxChars) warnings.push(`Tiene ${full.length} caracteres y ${channel} acepta hasta ${rule.maxChars}.`);
  if (format === "Anuncio") {
    const primary = (copy.body.match(/Texto principal:\s*(.*)/i)?.[1] ?? copy.body).trim();
    if (primary.length > AD_PRIMARY_MAX) warnings.push(`El texto principal del anuncio pasa los ${AD_PRIMARY_MAX} caracteres y se corta en el feed.`);
    const title = copy.body.match(/Título:\s*(.*)/i)?.[1]?.trim() ?? "";
    if (title.length > AD_TITLE_MAX) warnings.push(`El título del anuncio pasa los ${AD_TITLE_MAX} caracteres.`);
  }
  if (format === "Historia" && copy.body.length > STORY_MAX * 2) warnings.push("Es largo para una historia: se lee en pocos segundos.");
  if (channel === "Email") {
    const subject = copy.body.match(/Asunto:\s*(.*)/i)?.[1]?.trim() ?? "";
    if (!subject) warnings.push("Al email le falta la línea \"Asunto:\".");
    else if (subject.length > EMAIL_SUBJECT_MAX) warnings.push(`El asunto pasa los ${EMAIL_SUBJECT_MAX} caracteres y se corta en el celular.`);
  }
  const tags = countHashtags(copy.hashtags);
  if (rule.maxHashtags === 0 && tags > 0) warnings.push(`En ${channel} no van hashtags.`);
  else if (tags > rule.maxHashtags) warnings.push(`Tiene ${tags} hashtags; para ${channel} conviene hasta ${rule.maxHashtags}.`);
  const bad = forbiddenUsed(full, brand.words_avoid);
  if (bad.length) warnings.push(`Usa palabras que la marca evita: ${bad.join(", ")}.`);
  if (!copy.cta.trim() && !/whats|escrib|ped[ií]|reserv|compr|sac[aá] turno|link|respond/i.test(copy.body)) {
    warnings.push("Falta un llamado a la acción.");
  }
  if (source) {
    const nums = unbackedNumbers(copy.body, source);
    if (nums.length) warnings.push(`Revisá ${nums.join(", ")}: no estaba en el pedido ni en la marca.`);
  }
  return warnings;
}
