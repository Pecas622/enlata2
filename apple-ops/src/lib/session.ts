import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { parseModules, type ModuleId } from "@/lib/modules";
import type { Role } from "@/lib/roles";

export type CurrentUser = { id: string; name: string; role: Role; storeId: string; storeName: string; modules: ModuleId[]; billingStatus: string; email: string };

// Perfil del usuario logueado. Sin perfil activo no hay acceso, aunque la sesión de Auth exista.
export const getCurrentUser = cache(async (): Promise<CurrentUser> => {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: profile } = await supabase
    .from("profiles")
    .select("id, name, role, active, store_id, stores(name, modules, billing_status)")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile || !profile.active) redirect("/login?error=sin-perfil");
  const store = profile.stores as unknown as { name: string; modules: string[]; billing_status: string } | null;
  return { id: profile.id, name: profile.name, role: profile.role as Role, storeId: profile.store_id, storeName: store?.name ?? "", modules: parseModules(store?.modules), billingStatus: store?.billing_status ?? "activo", email: user.email ?? "" };
});
