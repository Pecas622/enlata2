import { redirect } from "next/navigation";
import { canOpen, permsFor } from "@/lib/roles";
import { getCurrentUser } from "@/lib/session";

// Usuario actual con permiso para la sección; si su rol no la tiene, vuelve al dashboard.
export async function requireSection(section: string) {
  const user = await getCurrentUser();
  if (!canOpen(user.role, section, user.modules)) redirect("/dashboard");
  return { user, perms: permsFor(user.role) };
}
