import { NextResponse, type NextRequest } from "next/server";
import { assistantStep, sanitizeState, type AssistCtx, type BotMsg } from "@/lib/assistant";
import { askClaude } from "@/lib/assistant-ai";
import { deviceShort } from "@/lib/catalog";
import { loadPublicAppraisal, loadPublicCatalog } from "@/lib/public-catalog";
import { createClient } from "@/lib/supabase/server";

// La IA tiene 12 s; el resto es margen para leer el stock y registrar la charla.
export const maxDuration = 30;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type Line = { role: "user" | "bot"; text: string; cards?: string[] };

// Asistente del catálogo. Si hay ANTHROPIC_API_KEY responde la IA con las herramientas de stock y
// canje; si no hay clave, o la IA falla o tarda, responde el motor de reglas. Siempre registra la
// conversación para el panel.
export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const body = (await req.json().catch(() => null)) as { id?: unknown; messages?: unknown; state?: unknown } | null;
  const id = typeof body?.id === "string" && UUID.test(body.id) ? body.id : null;
  const lines: Line[] = Array.isArray(body?.messages)
    ? body.messages
        .filter((m): m is Line => !!m && (m.role === "user" || m.role === "bot") && typeof m.text === "string")
        .slice(-40)
        .map((m) => ({ role: m.role, text: m.text.slice(0, 600), cards: Array.isArray(m.cards) ? m.cards.filter((x) => typeof x === "string").slice(0, 4) : undefined }))
    : [];
  const input = lines.at(-1)?.role === "user" ? lines.at(-1)!.text.trim() : "";
  if (!id || !input) return NextResponse.json({ error: "Pedido inválido." }, { status: 400 });

  const supabase = await createClient();
  const cat = await loadPublicCatalog(supabase, slug);
  if (cat.state !== "ok" || !cat.cfg.assistant_on) return NextResponse.json({ error: "El asistente no está disponible." }, { status: 404 });
  const { cfg } = cat;
  const ctx: AssistCtx = {
    storeName: cfg.store_name,
    address: cfg.address,
    fx: cfg.fx,
    warrantyNew: cfg.warranty_new_days,
    warrantyUsed: cfg.warranty_used_days,
    devices: cat.devices,
    accessories: cat.accessories,
    appraisal: await loadPublicAppraisal(supabase, slug),
  };

  // Las tarjetas quedan como texto, para la IA y para que el panel sepa qué se mostró.
  const withCards = (text: string, ids?: string[]) => {
    const names = (ids ?? []).flatMap((id) => cat.devices.filter((d) => d.id === id).map(deviceShort));
    return names.length ? `${text}\n[Equipos mostrados: ${names.join(", ")}]` : text;
  };

  // El motor de reglas corre siempre: lleva el tema de la charla y es la respuesta de respaldo.
  const rules = assistantStep(input, sanitizeState(body?.state), ctx);
  let msgs: BotMsg[] = rules.msgs;
  let source: "ia" | "reglas" = "reglas";
  if (process.env.ANTHROPIC_API_KEY) {
    try {
      const turns = lines.map((l) => ({ role: l.role === "user" ? ("user" as const) : ("assistant" as const), content: withCards(l.text, l.cards) }));
      const ai = await askClaude(ctx, cfg.assistant_name, turns);
      msgs = [{ text: ai.text, handoff: ai.handoff, cards: ai.deviceIds.map((d) => ({ id: d })) }];
      source = "ia";
    } catch (e) {
      console.warn("asistente: la IA no respondió, uso el motor de reglas:", e instanceof Error ? e.message : e);
    }
  }

  const handoff = msgs.some((m) => m.handoff);
  await supabase.rpc("registrar_chat", {
    p_slug: slug,
    p_id: id,
    p_topic: rules.state.topic ?? "Consulta",
    p_messages: [...lines, ...msgs.map((m) => ({ role: "bot" as const, text: m.text, cards: m.cards?.map((c) => c.id) }))].map((l) => ({ role: l.role, text: withCards(l.text, l.cards) })),
    p_handoff: handoff,
  });
  return NextResponse.json({ msgs, state: rules.state, source });
}
