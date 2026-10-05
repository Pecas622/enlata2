import Link from "next/link";
import { requireSection } from "@/lib/guard";
import { UserForm } from "../UserForm";

export default async function NuevoUsuarioPage() {
  await requireSection("usuarios");
  return (
    <>
      <Link href="/usuarios" className="back">← Usuarios</Link>
      <h1 className="page-title" data-testid="page-title">Nuevo usuario</h1>
      <p className="page-sub">Entra con su email y contraseña; en el mostrador cambia de usuario con su PIN.</p>
      <UserForm />
    </>
  );
}
