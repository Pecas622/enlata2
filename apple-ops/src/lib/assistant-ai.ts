// Asistente con IA (Claude). Corre solo en el servidor: la clave sale de ANTHROPIC_API_KEY y nunca
// llega al navegador. El modelo no inventa precios ni disponibilidad: todo lo que sabe del stock y
// del canje sale de las herramientas buscar_stock y cotizar_canje. Si algo falla o tarda más de
// 12 s, la ruta vuelve al motor de reglas.
import Anthropic from "@anthropic-ai/sdk";
import type { BetaMessageParam, BetaTool, BetaToolResultBlockParam } from "@anthropic-ai/sdk/resources/beta/messages/messages";
import { findAccessories, findDevices, paymentsText, tradeInQuote, warrantyText, baseRefs, type AssistCtx } from "./assistant";
import { capLabel } from "./quote";

export const AI_MODEL = "claude-opus-5-5";
export const AI_TIMEOUT_MS = 12_000;
const MAX_TURNS = 6;

export type ChatTurn = { role: "user" | "assistant"; content: string };
export type AiReply = { text: string; handoff: boolean; deviceIds: string[] };

const KIND_ENUM = ["iPhone", "iPad", "Mac", "Watch", "AirPods", "Accesorio"];
const COND_ENUM = ["impecable", "marcas leves", "pantalla o tapa rota"];

export const TOOLS: BetaTool[] = [
  {
    name: "buscar_stock",
    description:
      "Busca en el stock actual del local los equipos disponibles (o los accesorios con stock). Es la única fuente de precios y disponibilidad: usala antes de mencionar cualquier equipo, precio o accesorio.",
    strict: true,
    input_schema: {
      type: "object",
      properties: {
        tipo: { type: "string", enum: KIND_ENUM, description: "Tipo de producto." },
        modelo: { type: "string", description: "Modelo exacto si el cliente lo dijo, por ejemplo \"iPhone 15 Pro\". Omitilo para ver todos los del tipo." },
        capacidad_gb: { type: "integer", description: "Capacidad en GB (1 TB = 1024)." },
        texto: { type: "string", description: "Para accesorios: qué busca el cliente, por ejemplo \"funda iPhone 15\"." },
      },
      required: ["tipo"],
      additionalProperties: false,
    },
  },
  {
    name: "cotizar_canje",
    description:
      "Cotiza en forma orientativa un iPhone usado que el cliente entrega en plan canje, con la tabla de tasación del local. Si no hay valor de referencia, hay que derivar a un asesor.",
    strict: true,
    input_schema: {
      type: "object",
      properties: {
        modelo: { type: "string", description: "Modelo del iPhone del cliente, por ejemplo \"iPhone 13 Pro\"." },
        capacidad_gb: { type: "integer", description: "Capacidad en GB." },
        estado: { type: "string", enum: COND_ENUM, description: "Estado físico según el cliente." },
        bateria: { type: "integer", description: "Salud de batería en %, si el cliente la sabe." },
      },
      required: ["modelo", "capacidad_gb", "estado"],
      additionalProperties: false,
    },
  },
  {
    name: "mostrar_equipos",
    description: "Muestra al cliente tarjetas de equipos del stock (con foto, precio y botón para verlos). Usá ids que haya devuelto buscar_stock.",
    strict: true,
    input_schema: {
      type: "object",
      properties: { ids: { type: "array", items: { type: "string" }, description: "Hasta 4 ids de equipos." } },
      required: ["ids"],
      additionalProperties: false,
    },
  },
  {
    name: "derivar_a_asesor",
    description:
      "Le muestra al cliente el botón para seguir por WhatsApp con una persona del local. Usalo ante reclamos, pedidos de descuento, cuotas o recargos, equipos sin valor de referencia, o cuando el cliente pida hablar con alguien.",
    strict: true,
    input_schema: {
      type: "object",
      properties: { motivo: { type: "string", description: "Motivo breve de la derivación." } },
      required: ["motivo"],
      additionalProperties: false,
    },
  },
];

export function systemPrompt(ctx: AssistCtx, name: string) {
  return `Sos ${name}, el asistente del catálogo online de ${ctx.storeName}, un local que vende productos Apple (equipos nuevos y usados, accesorios y plan canje).

Reglas:
- Hablá en español rioplatense, con voseo, breve y cordial. Respuestas de 1 a 4 oraciones, sin markdown.
- Nunca inventes precios, disponibilidad, garantías ni valores de canje: usá solo lo que devuelven las herramientas. Antes de nombrar un equipo o un precio, llamá a buscar_stock.
- Cuando muestres equipos concretos, llamá a mostrar_equipos con sus ids.
- Toda cotización de canje es orientativa y se confirma revisando el equipo en el local (iCloud, batería y estado). Para cotizar necesitás modelo, capacidad y estado; preguntá lo que falte, de a una cosa.
- Derivá a una persona con derivar_a_asesor ante reclamos, descuentos, cuotas o recargos, equipos sin valor de referencia, o si el cliente lo pide.
- Nunca hables de costos, márgenes, IMEI ni datos de otros clientes. Si te piden algo fuera del local y sus productos, decí amablemente que solo podés ayudar con eso.

Datos del local:
- Dirección: ${ctx.address}. Para horarios, que escriban por WhatsApp.
- Formas de pago: ${paymentsText(ctx)}
- Garantía: ${warrantyText(ctx)}
- Cotización del dólar de hoy: US$ 1 = $ ${ctx.fx}. Los equipos se cotizan en dólares y los accesorios en pesos.`;
}

// Historial del navegador → mensajes para la API: arranca en el cliente, alterna roles y se recorta.
export function toApiMessages(turns: ChatTurn[]): BetaMessageParam[] {
  const out: { role: "user" | "assistant"; content: string }[] = [];
  for (const t of turns.slice(-20)) {
    const content = String(t.content ?? "").slice(0, 1000).trim();
    if (!content || (t.role !== "user" && t.role !== "assistant")) continue;
    if (!out.length && t.role !== "user") continue;
    const last = out[out.length - 1];
    if (last && last.role === t.role) last.content += "\n" + content;
    else out.push({ role: t.role, content });
  }
  return out;
}

const COND_MAP: Record<string, { cond: string; defects: string[] }> = {
  impecable: { cond: "Usado A", defects: [] },
  "marcas leves": { cond: "Usado B", defects: [] },
  "pantalla o tapa rota": { cond: "Usado B", defects: ["Pantalla dañada"] },
};

type ToolOutcome = { content: string; isError?: boolean; deviceIds?: string[]; handoff?: boolean };

// Ejecuta una herramienta con los datos públicos del local. Valida la entrada a mano.
export function runTool(ctx: AssistCtx, name: string, raw: unknown): ToolOutcome {
  const input = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const s = (v: unknown) => (typeof v === "string" ? v.trim().slice(0, 80) : "");
  const n = (v: unknown) => (typeof v === "number" && Number.isInteger(v) ? v : null);
  const json = (v: unknown) => ({ content: JSON.stringify(v) });

  if (name === "buscar_stock") {
    const tipo = s(input.tipo);
    if (!KIND_ENUM.includes(tipo)) return { content: "tipo inválido", isError: true };
    if (tipo === "Accesorio") {
      const list = findAccessories(ctx, s(input.texto) || "accesorio").slice(0, 8);
      return json({ accesorios: list.map((a) => ({ nombre: a.name, categoria: a.category, precio_ars: a.price_ars })), total: list.length });
    }
    const list = findDevices(ctx, { kind: tipo, model: s(input.modelo) || null, cap: n(input.capacidad_gb) });
    return json({
      equipos: list.slice(0, 8).map((d) => ({
        id: d.id,
        equipo: `${d.model}${d.capacity ? " " + capLabel(d.capacity) : ""}`,
        color: d.color,
        estado: d.condition,
        bateria: d.condition === "Nuevo sellado" ? null : d.battery,
        precio_usd: d.price_usd,
        precio_ars_aprox: Math.round(d.price_usd * ctx.fx),
        garantia_dias: d.warranty_days,
      })),
      total: list.length,
    });
  }

  if (name === "cotizar_canje") {
    const modelo = s(input.modelo), cap = n(input.capacidad_gb), estado = COND_MAP[s(input.estado)];
    const bat = n(input.bateria);
    if (!modelo || !cap || !estado) return { content: "faltan modelo, capacidad_gb o estado", isError: true };
    const refs = baseRefs(ctx, modelo);
    const q = tradeInQuote(ctx, { model: modelo, capacity: cap, cond: estado.cond, defects: estado.defects, battery: bat && bat >= 40 && bat <= 100 ? bat : undefined });
    if (!q.ok) {
      return json({
        ok: false,
        accion: "derivar_a_asesor",
        motivo: refs.length ? `Sin valor de referencia para ${capLabel(cap)}` : "Modelo sin valor de referencia",
        capacidades_con_referencia_gb: refs.map((r) => r.capacity),
      });
    }
    return json({
      ok: true,
      equipo: q.label,
      rango_usd: [q.low, q.high],
      rango_ars_aprox: [Math.round(q.low * ctx.fx), Math.round(q.high * ctx.fx)],
      aclaracion: "Orientativo: se confirma revisando el equipo en el local (iCloud, batería y estado general).",
    });
  }

  if (name === "mostrar_equipos") {
    const ids = Array.isArray(input.ids) ? input.ids.filter((x): x is string => typeof x === "string") : [];
    const ok = ids.filter((id) => ctx.devices.some((d) => d.id === id)).slice(0, 4);
    return { content: ok.length ? `Se muestran ${ok.length} tarjetas.` : "Ningún id corresponde a un equipo disponible.", deviceIds: ok, isError: !ok.length };
  }

  if (name === "derivar_a_asesor") return { content: "Se muestra el botón de WhatsApp.", handoff: true };

  return { content: `Herramienta desconocida: ${name}`, isError: true };
}

export class AiUnavailable extends Error {}

export async function askClaude(ctx: AssistCtx, assistantName: string, turns: ChatTurn[], client = new Anthropic()): Promise<AiReply> {
  const messages = toApiMessages(turns);
  if (!messages.length || messages[messages.length - 1].role !== "user") throw new AiUnavailable("sin mensaje del cliente");
  const signal = AbortSignal.timeout(AI_TIMEOUT_MS);
  const deviceIds = new Set<string>();
  let handoff = false;

  for (let turn = 0; turn < MAX_TURNS; turn++) {
    const res = await client.beta.messages.create(
      {
        model: AI_MODEL,
        max_tokens: 4096,
        output_config: { effort: "low" },
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        system: systemPrompt(ctx, assistantName),
        tools: TOOLS,
        tool_choice: { type: "auto" },
        messages,
      },
      { signal, maxRetries: 0 },
    );
    if (res.stop_reason === "refusal") throw new AiUnavailable("la IA no respondió (refusal)");

    const toolUses = res.content.filter((b) => b.type === "tool_use");
    if (res.stop_reason === "tool_use" && toolUses.length) {
      messages.push({ role: "assistant", content: res.content });
      const results: BetaToolResultBlockParam[] = toolUses.map((b) => {
        const r = runTool(ctx, b.name, b.input);
        r.deviceIds?.forEach((id) => deviceIds.add(id));
        if (r.handoff) handoff = true;
        return { type: "tool_result", tool_use_id: b.id, content: r.content, ...(r.isError ? { is_error: true } : {}) };
      });
      messages.push({ role: "user", content: results });
      continue;
    }
    if (res.stop_reason === "pause_turn") {
      messages.push({ role: "assistant", content: res.content });
      continue;
    }

    const text = res.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("\n").trim();
    if (!text) throw new AiUnavailable(`respuesta vacía (${res.stop_reason})`);
    return { text, handoff, deviceIds: [...deviceIds] };
  }
  throw new AiUnavailable("demasiadas vueltas de herramientas");
}
