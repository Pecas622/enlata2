"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { requireSection } from "@/lib/guard";
import { ROLES, type Role } from "@/lib/roles";
import { createClient } from "@/lib/supabase/server";
import { brandsFor, inviteLink, inviteMessage, isEmail } from "@/lib/team";

export type InviteState = { error?: string; link?: string; message?: string; email?: string };

async function origin() {
  const h = await headers();
  return `${h.get("x-forwarded-proto") ?? "https"}://${h.get("host")}`;
}

export async function inviteMember(_prev: InviteState, form: FormData): Promise<InviteState> {
  const { user } = await requireSection("equipo");
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const name = String(form.get("name") ?? "").trim();
  const role = String(form.get("role") ?? "") as Role;
  if (!isEmail(email)) return { error: "Escribí un email válido." };
  if (!ROLES.includes(role)) return { error: "Elegí el rol." };
  const brands = brandsFor(role, form.getAll("brands").map(String));
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("invite_member", { p_email: email, p_name: name, p_role: role, p_brand_ids: brands });
  if (error) return { error: error.message };
  const link = inviteLink(await origin(), data as string);
  revalidatePath("/equipo");
  return { link, email, message: inviteMessage(user.workspaceName, role, link) };
}

export async function cancelInvitation(id: string): Promise<{ error?: string }> {
  await requireSection("equipo");
  const supabase = await createClient();
  const { error } = await supabase.rpc("cancel_invitation", { p_id: id });
  if (error) return { error: error.message };
  revalidatePath("/equipo");
  return {};
}

export async function updateMember(id: string, role: Role, active: boolean, brandIds: string[]): Promise<{ error?: string }> {
  await requireSection("equipo");
  if (!ROLES.includes(role)) return { error: "Elegí el rol." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("update_member", { p_id: id, p_role: role, p_active: active, p_brand_ids: brandsFor(role, brandIds) });
  if (error) return { error: error.message };
  revalidatePath("/equipo");
  return {};
}

