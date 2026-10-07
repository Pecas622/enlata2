import Link from "next/link";
import { redirect } from "next/navigation";
import { requireSection } from "@/lib/guard";
import { BulkForm } from "./BulkForm";

export default async function CargaMasivaPage() {
  const { perms } = await requireSection("accesorios");
  if (!perms.editStock) redirect("/accesorios");
  return (
    <>
      <Link href="/accesorios" className="back">← Accesorios</Link>
      <div className="card" style={{ maxWidth: 680 }}>
        <h1 className="page-title" style={{ fontSize: 22 }} data-testid="page-title">Carga masiva de accesorios</h1>
        <BulkForm />
      </div>
    </>
  );
}
