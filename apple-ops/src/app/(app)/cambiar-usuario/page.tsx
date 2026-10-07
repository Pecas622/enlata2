import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/session";
import { SwitchForm } from "./SwitchForm";

export default async function SwitchUserPage() {
  const user = await getCurrentUser();
  const supabase = await createClient();
  const { data } = await supabase.from("profiles").select("id, name, role").eq("active", true).neq("id", user.id).order("name");
  return (
    <>
      <h1 className="page-title">Cambiar usuario</h1>
      <p className="page-sub">Elegí quién atiende y pedile su PIN.</p>
      <SwitchForm users={data ?? []} />
    </>
  );
}
