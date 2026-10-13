"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { GOALS } from "@/lib/channels";
import { requireSection } from "@/lib/guard";
import { createClient } from "@/lib/supabase/server";

export type CampaignState = { error?: string; ok?: string };

export async function saveCampaign(_prev: CampaignState, form: FormData): Promise<CampaignState> {
  const { perms } = await requireSection("campanas");
  if (!perms.create) return { error: "Tu rol no crea ni edita campañas." };
  const id = String(form.get("id") ?? "") || null;
  const s = (k: string) => String(form.get(k) ?? "").trim();
  const goal = s("goal");
  if (!(GOALS as readonly string[]).includes(goal)) return { error: "Elegí el objetivo." };
  const budget = s("budget").replace(/\./g, "").replace(",", ".");
  if (budget && !/^\d+(\.\d+)?$/.test(budget)) return { error: "El presupuesto tiene que ser un número, en pesos." };
  const p = {
    brand_id: s("brand_id"), name: s("name"), goal, starts_on: s("starts_on"), ends_on: s("ends_on"), budget: budget || "0",
    offer: s("offer"), audience: s("audience"), locations: s("locations"), age_min: s("age_min"), age_max: s("age_max"),
    interests: s("interests"), notes: s("notes"),
  };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("save_campaign", { p_id: id, p });
  if (error) return { error: error.message };
  revalidatePath("/campanas");
  if (!id) redirect(`/campanas/${data}?nueva=1`);
  revalidatePath(`/campanas/${id}`);
  return { ok: "Cambios guardados." };
}

export async function setPieceCampaign(contentId: string, campaignId: string | null): Promise<{ error?: string }> {
  await requireSection("campanas");
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_content_campaign", { p_content_id: contentId, p_campaign_id: campaignId });
  if (error) return { error: error.message };
  revalidatePath("/campanas");
  revalidatePath(`/contenidos/${contentId}`);
  if (campaignId) revalidatePath(`/campanas/${campaignId}`);
  return {};
}
