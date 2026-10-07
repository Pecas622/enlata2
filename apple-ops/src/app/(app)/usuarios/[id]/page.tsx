import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSection } from "@/lib/guard";
import { createClient } from "@/lib/supabase/server";
import { UserForm, type UserRow } from "../UserForm";

export default async function EditarUsuarioPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireSection("usuarios");
  const supabase = await createClient();
  const { data } = await supabase.from("profiles").select("id, name, role, commission_pct, active").eq("id", id).maybeSingle();
  if (!data) notFound();
  const user = { ...data, commission_pct: Number(data.commission_pct) } as UserRow;
  return (
    <>
      <Link href="/usuarios" className="back">← Usuarios</Link>
      <h1 className="page-title" data-testid="page-title">{user.name}</h1>
      <p className="page-sub">{user.role}</p>
      <UserForm user={user} />
    </>
  );
}
