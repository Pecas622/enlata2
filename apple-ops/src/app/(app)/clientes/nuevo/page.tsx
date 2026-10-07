import Link from "next/link";
import { requireSection } from "@/lib/guard";
import { ClientForm } from "../ClientForm";

export default async function NuevoClientePage() {
  await requireSection("clientes");
  return (
    <>
      <Link href="/clientes" className="back">← Clientes</Link>
      <div className="card" style={{ maxWidth: 640 }}>
        <h1 className="page-title" style={{ fontSize: 22 }} data-testid="page-title">Nuevo cliente</h1>
        <ClientForm />
      </div>
    </>
  );
}
