"use server";

import { revalidatePath } from "next/cache";
import { STATUSES, type Status } from "@/lib/workflow";
import { createClient } from "@/lib/supabase/server";

export type ActionState = { error?: string; ok?: string };

export async function saveContent(_prev: ActionState, form: FormData): Promise<ActionState> {
  const id = String(form.get("id") ?? "");
  const p = {
    title: String(form.get("title") ?? "").trim().slice(0, 120),
    body: String(form.get("body") ?? "").slice(0, 4000),
    hashtags: String(form.get("hashtags") ?? "").trim().slice(0, 400),
    cta: String(form.get("cta") ?? "").trim().slice(0, 200),
    publish_on: String(form.get("publish_on") ?? ""),
  };
  const supabase = await createClient();
  const { error } = await supabase.rpc("save_content", { p_id: id, p });
  if (error) return { error: error.message };
  revalidatePath(`/contenidos/${id}`);
  revalidatePath("/contenidos");
  return { ok: "Cambios guardados." };
}

export async function moveContent(_prev: ActionState, form: FormData): Promise<ActionState> {
  const id = String(form.get("id") ?? "");
  const to = String(form.get("to") ?? "") as Status;
  if (!STATUSES.includes(to)) return { error: "Estado inválido." };
  const note = String(form.get("note") ?? "").trim();
  if (form.get("needsNote") === "1" && !note) return { error: "Contá qué hay que cambiar." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_content_status", { p_id: id, p_status: to, p_note: note });
  if (error) return { error: error.message };
  revalidatePath(`/contenidos/${id}`);
  revalidatePath("/contenidos");
  revalidatePath("/inicio");
  return {};
}
