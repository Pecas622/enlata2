"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { TONES } from "@/lib/channels";
import { createClient } from "@/lib/supabase/server";

export type BrandState = { error?: string; ok?: boolean };

const TEXT_FIELDS = ["name", "industry", "city", "description", "audience", "value_prop", "products", "words_avoid", "cta", "hashtags", "website", "instagram", "whatsapp", "color"] as const;

export async function saveBrand(_prev: BrandState, form: FormData): Promise<BrandState> {
  const id = String(form.get("id") ?? "") || null;
  const payload: Record<string, unknown> = {};
  for (const f of TEXT_FIELDS) payload[f] = String(form.get(f) ?? "").trim().slice(0, 1200);
  payload.tone = form.getAll("tone").map(String).filter((t) => (TONES as readonly string[]).includes(t));
  if (!payload.name) return { error: "Poné el nombre de la marca." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("save_brand", { p_id: id, p: payload });
  if (error) return { error: error.message };
  revalidatePath("/marca");
  if (!id) redirect(`/marca/${data}`);
  return { ok: true };
}
