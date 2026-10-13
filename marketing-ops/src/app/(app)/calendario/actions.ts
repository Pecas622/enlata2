"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { CHANNELS, type Channel } from "@/lib/channels";
import { isMonth, suggestPlan } from "@/lib/calendar";
import { getBrand, listContents } from "@/lib/data";
import { localDay } from "@/lib/dates";
import { requireSection } from "@/lib/guard";
import { createClient } from "@/lib/supabase/server";

export async function reschedule(id: string, day: string | null): Promise<{ error?: string }> {
  await requireSection("calendario");
  if (day !== null && !/^\d{4}-\d{2}-\d{2}$/.test(day)) return { error: "Fecha inválida." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("schedule_content", { p_id: id, p_day: day });
  if (error) return { error: error.message };
  revalidatePath("/calendario");
  revalidatePath("/contenidos");
  revalidatePath(`/contenidos/${id}`);
  return {};
}

export type PlanParams = { brandId: string; month: string; perWeek: number; channels: string[] };

// Recalcula el plan en el servidor y guarda solo las ideas elegidas: el navegador manda claves, no contenido.
export async function addPlan(params: PlanParams, keys: string[]): Promise<{ error?: string }> {
  const { perms } = await requireSection("calendario");
  if (!perms.create) return { error: "Tu rol no crea contenidos." };
  if (!isMonth(params.month)) return { error: "Mes inválido." };
  const brand = await getBrand(params.brandId);
  if (!brand) return { error: "Elegí una marca." };
  const channels = params.channels.filter((c): c is Channel => (CHANNELS as readonly string[]).includes(c));
  const existing = (await listContents()).filter((c) => c.brand_id === brand.id);
  const plan = suggestPlan(brand, params.month, existing, { perWeek: params.perWeek, channels, today: localDay() });
  const chosen = plan.filter((p) => keys.includes(`${p.publish_on}|${p.topic}`));
  if (!chosen.length) return { error: "Elegí al menos una idea." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("add_plan_ideas", { p_brand_id: brand.id, p_items: chosen });
  if (error) return { error: error.message };
  revalidatePath("/calendario");
  revalidatePath("/contenidos");
  revalidatePath("/inicio");
  redirect(`/calendario?mes=${params.month}&marca=${brand.id}&agregadas=${data}`);
}
