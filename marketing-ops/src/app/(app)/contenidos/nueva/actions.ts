"use server";

import { redirect } from "next/navigation";
import { CHANNELS, FORMATS, GOALS, isValidCombo, type Channel, type Format } from "@/lib/channels";
import { requireSection } from "@/lib/guard";
import { hookOf } from "@/lib/planner";
import { createClient } from "@/lib/supabase/server";

export type OwnPieceState = { error?: string };

// Una pieza que ya está escrita (o hecha afuera de la app): entra como Borrador, sin usar IA, y sigue el circuito de aprobación.
export async function saveOwnPiece(_prev: OwnPieceState, form: FormData): Promise<OwnPieceState> {
  const { perms } = await requireSection("contenidos");
  if (!perms.create) return { error: "Tu rol no crea contenidos." };
  const s = (k: string) => String(form.get(k) ?? "").trim();
  const [channel, format, goal] = [s("channel"), s("format"), s("goal")];
  if (!(CHANNELS as readonly string[]).includes(channel) || !(FORMATS as readonly string[]).includes(format) || !(GOALS as readonly string[]).includes(goal)) return { error: "Elegí red, formato y objetivo." };
  if (!isValidCombo(channel as Channel, format as Format)) return { error: `${format} no está disponible en ${channel}.` };
  const title = s("title").slice(0, 120);
  const body = s("body").slice(0, 4000);
  if (!title) return { error: "Poné un título para encontrarla después." };
  if (!body) return { error: "Pegá el texto de la pieza." };
  const publishOn = s("publish_on");
  if (publishOn && !/^\d{4}-\d{2}-\d{2}$/.test(publishOn)) return { error: "La fecha no es válida." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("save_content", {
    p_id: null,
    p: {
      brand_id: s("brand_id"), channel, format, goal, topic: title, title, body, hashtags: s("hashtags").slice(0, 400),
      cta: "", hook: hookOf(body), publish_on: publishOn, source: "manual",
    },
  });
  if (error) return { error: error.message };
  const campaignId = s("campaign_id");
  if (campaignId) {
    // La pieza ya quedó guardada; si no se puede sumar a la campaña, se suma después desde la campaña.
    const link = await supabase.rpc("set_content_campaign", { p_content_id: data, p_campaign_id: campaignId });
    if (link.error) console.error("No se pudo sumar a la campaña:", link.error.message);
  }
  redirect(`/contenidos/${data}?nueva=1`);
}
