import Link from "next/link";
import { redirect } from "next/navigation";
import { requireSection } from "@/lib/guard";
import { AccForm } from "../AccForm";

export default async function NuevoAccesorioPage() {
  const { perms } = await requireSection("accesorios");
  if (!perms.editStock) redirect("/accesorios");
  return (
    <>
      <Link href="/accesorios" className="back">← Accesorios</Link>
      <div className="card" style={{ maxWidth: 640 }}>
        <h1 className="page-title" style={{ fontSize: 22 }} data-testid="page-title">Nuevo accesorio</h1>
        <AccForm seeCost={perms.seeCost} />
      </div>
    </>
  );
}
