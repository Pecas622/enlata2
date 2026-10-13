import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Role } from "@/lib/roles";

export type CurrentUser = { id: string; name: string; role: Role; workspaceId: string; workspaceName: string; email: string };

// Perfil del usuario logueado. Sin perfil activo no hay acceso, aunque la sesión de Auth exista.
export const getCurrentUser = cache(async (): Promise<CurrentUser> => {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: profile } = await supabase
    .from("profiles")
    .select("id, name, role, active, workspace_id, workspaces(name)")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile || !profile.active) redirect("/login?error=sin-perfil");
  const ws = profile.workspaces as unknown as { name: string } | null;
  return { id: profile.id, name: profile.name, role: profile.role as Role, workspaceId: profile.workspace_id, workspaceName: ws?.name ?? "", email: user.email ?? "" };
});
