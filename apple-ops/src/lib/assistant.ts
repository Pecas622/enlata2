// Asistente de chat del catálogo: motor de reglas (réplica de assistantStep() del prototipo) y las
// búsquedas que comparte con la IA (buscar_stock y cotizar_canje). Todo sale de datos públicos:
// equipos disponibles y visibles, accesorios con stock y la tabla de tasación del local.
import { appraise, type AppraisalConfig } from "./appraise";
import { fmtARS } from "./money";
import type { PublicAccessory, PublicDevice } from "./public-catalog";

export type AssistCtx = {
  storeName: string;
  address: string;
  fx: number;
  warrantyNew: number;
  warrantyUsed: number;
  devices: PublicDevice[];
  accessories: PublicAccessory[];
  appraisal: AppraisalConfig;
};

export type Draft = { model?: string; capacity?: number; cond?: string; defects?: string[]; battery?: number };
export type TradeQuote = { low: number; high: number; label: string };
export type ChatState = {
  mode: "canje" | null;
  stage?: "collect" | "quote";
  awaiting?: "model" | "cap" | "cond" | "battery" | null;
  askedBattery?: boolean;
  draft: Draft;
  quote?: TradeQuote;
  topic?: string;
  userMsgs: string[];
};
export type ChatCard = { id: string; note?: string };
export type BotMsg = { text: string; handoff?: boolean; cards?: ChatCard[]; chips?: string[] };

export const HANDOFF_CHIP = "Hablar con un asesor";
export const START_CHIPS = ["Ver iPhone disponibles", "Cotizar mi equipo", "¿Cómo puedo pagar?"];
export const emptyState = (): ChatState => ({ mode: null, draft: {}, userMsgs: [] });

export const defaultGreeting = (storeName: string) =>
  `¡Hola! Soy el asistente de ${storeName}. ¿Te muestro equipos, cotizamos tu canje o te cuento cómo pagar?`;

// Lo que manda un chip como mensaje del cliente.
export function chipText(chip: string) {
  if (chip === HANDOFF_CHIP) return "quiero hablar con un asesor";
  if (chip === "Cotizar mi equipo") return "quiero cotizar mi equipo en plan canje";
  return chip;
}

export const norm = (s: string) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
const r5 = (n: number) => Math.round(n / 5) * 5;
const same = (a: string, b: string) => norm(a).replace(/\s+/g, " ").trim() === norm(b).replace(/\s+/g, " ").trim();

// ---------- lectura del mensaje ----------
export function parseIphoneModel(t: string) {
  const hasWord = /iphone|iph\b/.test(t);
  const m = t.match(/(?:iphone\s*|iph\s*)?\b(1[1-6])\b\s*(pro\s*max|pro|plus|mini)?/);
  if (!m) return null;
  const variant = (m[2] || "").replace(/\s+/g, " ").trim();
  if (!hasWord && !variant) return null;
  const v = variant === "pro max" ? " Pro Max" : variant === "pro" ? " Pro" : variant === "plus" ? " Plus" : variant === "mini" ? " mini" : "";
  return "iPhone " + m[1] + v;
}

export function parseKind(t: string) {
  if (/ipad|tablet/.test(t)) return "iPad";
  if (/macbook|\bmac\b|notebook|laptop/.test(t)) return "Mac";
  if (/watch|reloj/.test(t)) return "Watch";
  if (/airpod|auricular/.test(t) && !/con cable/.test(t)) return "AirPods";
  if (/iphone|celu|celular|telefono/.test(t) || parseIphoneModel(t)) return "iPhone";
  return null;
}

export function parseCap(t: string) {
  if (/\b1\s*tb\b/.test(t)) return 1024;
  const m = t.match(/\b(64|128|256|512)\s*(?:gb|g\b)?/);
  return m ? Number(m[1]) : null;
}

export function parseBattery(t: string) {
  let m = t.match(/(?:bateria|bat)\D{0,10}(\d{2,3})/);
  if (!m) m = t.match(/\b(\d{2,3})\s*%/);
  if (!m) return null;
  const n = Number(m[1]);
  return n >= 40 && n <= 100 ? n : null;
}

export function parseDefects(t: string) {
  const d: string[] = [];
  if (/pantalla.{0,12}(rota|quebrad|trizad|daniad|astillad)|(rota|trizada|quebrada).{0,12}pantalla/.test(t)) d.push("Pantalla dañada");
  if (/tapa.{0,12}(rota|trizad|quebrad)/.test(t)) d.push("Tapa trasera rota");
  return d;
}

export function parseCond(t: string, awaiting: boolean) {
  if (awaiting && /^\s*1\s*$/.test(t)) return { cond: "Usado A", defects: [] };
  if (awaiting && /^\s*2\s*$/.test(t)) return { cond: "Usado B", defects: [] };
  if (awaiting && /^\s*3\s*$/.test(t)) return { cond: "Usado B", defects: ["Pantalla dañada"] };
  if (/impecable|perfecto|como nuevo|sin marcas|sin rayon|excelente|impecabl/.test(t)) return { cond: "Usado A", defects: [] };
  if (/rayon|marca|detalle|golpe|desgaste|usado|bueno|normal|regular/.test(t)) return { cond: "Usado B", defects: parseDefects(t) };
  const df = parseDefects(t);
  return df.length ? { cond: "Usado B", defects: df } : null;
}

// ---------- búsquedas compartidas con la IA ----------
export function findDevices(ctx: AssistCtx, q: { kind?: string | null; model?: string | null; cap?: number | null }) {
  return ctx.devices
    .filter((d) => (!q.kind || d.kind === q.kind) && (!q.model || same(d.model, q.model)) && (!q.cap || d.capacity === q.cap))
    .sort((a, b) => Number(b.featured) - Number(a.featured) || a.price_usd - b.price_usd);
}

const ACC_WORDS = ["funda", "vidrio", "templado", "cargador", "cable", "soporte", "magsafe", "socket"];

export function findAccessories(ctx: AssistCtx, text: string) {
  const t = norm(text);
  const nums = t.match(/\b(1[1-6])\b/g) || [];
  const words = ACC_WORDS.filter((w) => t.includes(w));
  const hay = (a: PublicAccessory) => norm(`${a.name} ${a.category}`);
  let list = ctx.accessories.filter(
    (a) =>
      (!words.length || words.some((w) => hay(a).includes(w === "templado" ? "vidrio" : w))) &&
      (!nums.length || nums.some((n) => a.name.includes(n)) || !/iphone/.test(norm(a.name))),
  );
  if (!list.length) list = ctx.accessories.filter((a) => words.some((w) => norm(a.name).includes(w)));
  return list;
}

export function baseRefs(ctx: AssistCtx, model: string) {
  return ctx.appraisal.baseValues.filter((r) => same(r.model, model));
}

// Rango orientativo del canje: de 90% del valor de tasación al valor, como el prototipo.
export function tradeInQuote(ctx: AssistCtx, d: Required<Pick<Draft, "model" | "capacity" | "cond">> & Draft):
  | ({ ok: true } & TradeQuote)
  | { ok: false; reason: "sin-valor" | "no-tomable" } {
  const row = baseRefs(ctx, d.model).find((r) => r.capacity === d.capacity);
  if (!row) return { ok: false, reason: "sin-valor" };
  const ap = appraise(ctx.appraisal, { model: row.model, capacity: row.capacity, cond: d.cond, battery: d.battery ?? null, defects: d.defects ?? [], icloudFree: true, imeiClean: true });
  if (!ap.ok || !(ap.value > 0)) return { ok: false, reason: "no-tomable" };
  return { ok: true, low: r5(ap.value * 0.9), high: ap.value, label: `${row.model} ${row.capacity}GB` };
}

export const paymentsText = (ctx: AssistCtx) =>
  `Podés pagar en efectivo (pesos o dólares), transferencia, tarjeta o Mercado Pago. Los equipos están en dólares y en pesos se toma la cotización del día (US$ 1 = ${fmtARS(ctx.fx)}). Para cuotas o recargos con tarjeta, te lo confirma un asesor.`;
export const warrantyText = (ctx: AssistCtx) =>
  `Los equipos nuevos tienen ${ctx.warrantyNew} días de garantía y los usados ${ctx.warrantyUsed} días. Los usados están revisados y con iCloud libre. La garantía no cubre golpes ni humedad.`;

// ---------- motor de reglas ----------
export function assistantStep(input: string, st: ChatState, ctx: AssistCtx): { state: ChatState; msgs: BotMsg[] } {
  const t = norm(input);
  const out: BotMsg[] = [];
  const s: ChatState = { ...st, draft: { ...(st.draft || {}) }, userMsgs: [...(st.userMsgs || []), input].slice(-6) };
  const done = () => ({ state: s, msgs: out });
  const say = (text: string, extra: Omit<BotMsg, "text"> = {}) => out.push({ text, ...extra });
  const handoff = (text: string) => {
    s.topic = s.topic || "Derivado";
    say(text, { handoff: true });
  };
  const kind = parseKind(t), model = parseIphoneModel(t), cap = parseCap(t);

  if (/asesor|persona|humano|vendedor|hablar con|llamen|llamar/.test(t)) {
    handoff("Dale, te paso con una persona del equipo por WhatsApp. Ya le llevo un resumen de lo que hablamos.");
    return done();
  }
  // Reclamos y descuentos los atiende siempre una persona.
  if (/reclamo|queja|no funciona|se rompio|me vendieron|devolu|descuento|rebaja|mejor precio/.test(t)) {
    handoff("Eso lo tiene que ver una persona del equipo. Te paso por WhatsApp con un resumen de lo que hablamos.");
    return done();
  }

  // ---- plan canje (conversación guiada) ----
  const wantsCanje = /canje|cambio mi|entrego|entregar|tomar mi|tomen mi|cotiz|mi iphone|mi celu|permuta|parte de pago/.test(t);
  if (wantsCanje && s.mode !== "canje") {
    s.mode = "canje"; s.stage = "collect"; s.draft = {}; s.topic = "Plan canje"; s.askedBattery = false;
  }
  if (s.mode === "canje" && s.stage === "collect") {
    if (kind && kind !== "iPhone") {
      s.mode = null;
      handoff(`Los ${kind === "Mac" || kind === "iPad" ? kind : "equipos de ese tipo"} los tasamos en el local. Te paso con un asesor para coordinarlo.`);
      return done();
    }
    if (model && !s.draft.model) s.draft.model = model;
    if (cap && !s.draft.capacity) s.draft.capacity = cap;
    const bat = parseBattery(t);
    if (bat && !s.draft.battery) { s.draft.battery = bat; s.askedBattery = true; }
    const cnd = parseCond(t, s.awaiting === "cond");
    if (cnd && !s.draft.cond) { s.draft.cond = cnd.cond; s.draft.defects = cnd.defects; }
    if (s.awaiting === "battery" && /no se|ni idea|no lo se/.test(t)) s.askedBattery = true;
    if (!s.draft.model) {
      s.awaiting = "model";
      say("Perfecto, te ayudo con la cotización. ¿Qué modelo de iPhone tenés? Por ejemplo: iPhone 13 Pro.");
      return done();
    }
    const refs = baseRefs(ctx, s.draft.model);
    if (!refs.length) {
      s.mode = null;
      handoff(`Para el ${s.draft.model} prefiero que lo cotice un asesor para darte un valor justo. Te paso con una persona.`);
      return done();
    }
    if (!s.draft.capacity) {
      if (refs.length === 1) s.draft.capacity = refs[0].capacity;
      else {
        s.awaiting = "cap";
        say(`¿Qué capacidad tiene tu ${s.draft.model}? (${refs.map((r) => r.capacity + " GB").join(", ")})`);
        return done();
      }
    }
    if (!refs.find((r) => r.capacity === s.draft.capacity)) {
      s.mode = null;
      handoff(`Para ${s.draft.model} de ${s.draft.capacity} GB no tengo referencia cargada. Te paso con un asesor.`);
      return done();
    }
    if (!s.draft.cond) {
      s.awaiting = "cond";
      say("¿Cómo está el equipo?\n1. Impecable, sin marcas\n2. Con marcas leves de uso\n3. Con la pantalla o la tapa rota\nRespondé con el número o contame con tus palabras.");
      return done();
    }
    if (!s.draft.battery && !s.askedBattery) {
      s.awaiting = "battery"; s.askedBattery = true;
      say('¿Sabés el porcentaje de batería? (Ajustes > Batería > Salud). Si no sabés, escribí "no sé".');
      return done();
    }
    const q = tradeInQuote(ctx, { ...s.draft, model: s.draft.model, capacity: s.draft.capacity, cond: s.draft.cond });
    if (!q.ok) {
      s.mode = null;
      handoff("Esa cotización la prefiero hacer con un asesor. Te paso con una persona.");
      return done();
    }
    s.quote = { low: q.low, high: q.high, label: q.label }; s.stage = "quote"; s.awaiting = null;
    say(
      `Por tu ${q.label} te lo tomaríamos, orientativamente, entre US$ ${q.low} y US$ ${q.high} (≈ ${fmtARS(q.low * ctx.fx)} a ${fmtARS(q.high * ctx.fx)}).\n\nEs una estimación: se confirma revisando el equipo en el local (iCloud, batería y estado general). Si me decís qué equipo te interesa, te calculo la diferencia.`,
      { chips: ["Ver iPhone disponibles", HANDOFF_CHIP] },
    );
    return done();
  }

  // ---- búsqueda de equipos ----
  const isAccQuery = /funda|vidrio|templado|cargador|cable|soporte|accesorio|pop ?socket|magsafe|auricular.*cable|con cable/.test(t);
  if (kind && !isAccQuery) {
    const list = findDevices(ctx, { kind, model: kind === "iPhone" ? model : null, cap });
    const quote = s.quote;
    const note = (d: PublicDevice) => (quote ? `Diferencia aprox.: US$ ${Math.max(0, d.price_usd - quote.high)} a US$ ${Math.max(0, d.price_usd - quote.low)} con tu equipo` : undefined);
    s.topic = s.topic || "Equipos";
    const what = model || kind;
    if (!list.length) {
      say(`Ahora no tengo ${what} disponible${cap ? " de " + cap + " GB" : ""}. Si querés, un asesor te avisa cuando entre uno.`, { chips: [HANDOFF_CHIP, "Ver iPhone disponibles"] });
    } else {
      const shown = list.slice(0, 4);
      say(`Estos son los ${what} que tengo disponibles hoy:`, { cards: shown.map((d) => ({ id: d.id, note: note(d) })) });
      if (list.length > shown.length) say(`Hay ${list.length - shown.length} más en el catálogo. ¿Querés que te ayude a elegir?`);
      say("¿Te gustaría pagarlo con plan canje o te paso con un asesor?", { chips: ["Cotizar mi equipo", HANDOFF_CHIP] });
    }
    return done();
  }

  // ---- accesorios ----
  if (isAccQuery) {
    s.topic = s.topic || "Accesorios";
    const list = findAccessories(ctx, input);
    if (!list.length) say("De eso no tengo stock ahora. Si querés, un asesor te consulta con el proveedor.", { chips: [HANDOFF_CHIP] });
    else say("Esto es lo que tengo:\n" + list.slice(0, 5).map((a) => `• ${a.name}: ${fmtARS(a.price_ars)}`).join("\n"), { chips: ["Cotizar mi equipo", HANDOFF_CHIP] });
    return done();
  }

  if (/pago|pagar|medio|transferencia|tarjeta|efectivo|mercado ?pago|cuota|financ/.test(t)) {
    s.topic = s.topic || "Pagos";
    // Cuotas y recargos los confirma una persona.
    if (/cuota|recargo|financ/.test(t)) say(paymentsText(ctx), { handoff: true });
    else say(paymentsText(ctx), { chips: [HANDOFF_CHIP, "Cotizar mi equipo"] });
    return done();
  }
  if (/garantia|garantizado|revisado|icloud/.test(t)) {
    say(warrantyText(ctx));
    return done();
  }
  if (/donde|direccion|ubicacion|local|horario|abren|cierran/.test(t)) {
    say(`Estamos en ${ctx.address}. Para confirmar horarios, escribinos por WhatsApp y te respondemos al toque.`, { chips: [HANDOFF_CHIP] });
    return done();
  }
  if (/^(hola|buenas|buen dia|buenos dias|buenas tardes|buenas noches|hey|que tal)\b/.test(t) && t.length < 30) {
    say(`¡Hola! Soy el asistente de ${ctx.storeName}. Te puedo mostrar equipos disponibles, cotizar tu equipo en plan canje o contarte las formas de pago.`, { chips: START_CHIPS });
    return done();
  }
  if (/precio|cuanto|sale|vale|stock|tienen|disponible|hay/.test(t)) {
    say("¿De qué equipo querés saber? Decime el modelo, por ejemplo iPhone 15 Pro 256 GB.", { chips: ["Ver iPhone disponibles"] });
    return done();
  }
  say("No estoy seguro de haber entendido. Te puedo ayudar con equipos disponibles, accesorios, plan canje y formas de pago, o te paso con una persona.", {
    chips: ["Ver iPhone disponibles", "Cotizar mi equipo", HANDOFF_CHIP],
  });
  return done();
}

// Texto que lleva la persona del local cuando el cliente sigue por WhatsApp.
export function handoffSummary(state: ChatState) {
  const d = state.draft || {};
  const canje = d.model
    ? ` Mi equipo: ${d.model}${d.capacity ? " " + d.capacity + "GB" : ""}${d.cond ? ", " + d.cond : ""}${d.battery ? ", batería " + d.battery + "%" : ""}.`
    : "";
  return `Hola! Vengo del chat del catálogo. ${(state.userMsgs || []).slice(-3).join(" / ")}.${canje}`;
}

// El estado viaja en el navegador: el servidor solo acepta campos conocidos con el tipo correcto.
export function sanitizeState(raw: unknown): ChatState {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const str = (v: unknown, max = 200) => (typeof v === "string" ? v.slice(0, max) : undefined);
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : undefined);
  const d = (r.draft && typeof r.draft === "object" ? r.draft : {}) as Record<string, unknown>;
  const q = (r.quote && typeof r.quote === "object" ? r.quote : null) as Record<string, unknown> | null;
  const oneOf = <T extends string>(v: unknown, opts: readonly T[]) => (opts.includes(v as T) ? (v as T) : undefined);
  return {
    mode: r.mode === "canje" ? "canje" : null,
    stage: oneOf(r.stage, ["collect", "quote"] as const),
    awaiting: oneOf(r.awaiting, ["model", "cap", "cond", "battery"] as const) ?? null,
    askedBattery: r.askedBattery === true,
    draft: {
      model: str(d.model, 40),
      capacity: num(d.capacity),
      cond: oneOf(d.cond, ["Usado A", "Usado B"] as const),
      defects: Array.isArray(d.defects) ? d.defects.filter((x): x is string => x === "Pantalla dañada" || x === "Tapa trasera rota") : undefined,
      battery: num(d.battery),
    },
    quote: q && num(q.low) !== undefined && num(q.high) !== undefined ? { low: num(q.low)!, high: num(q.high)!, label: str(q.label, 60) ?? "" } : undefined,
    topic: str(r.topic, 40),
    userMsgs: Array.isArray(r.userMsgs) ? r.userMsgs.filter((x): x is string => typeof x === "string").slice(-6).map((x) => x.slice(0, 300)) : [],
  };
}
