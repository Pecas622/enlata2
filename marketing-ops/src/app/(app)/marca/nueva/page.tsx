import Link from "next/link";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/ui";
import { requireSection } from "@/lib/guard";
import { BrandForm } from "../BrandForm";

export default async function NuevaMarcaPage() {
  const { perms } = await requireSection("marca");
  if (!perms.editBrand) redirect("/marca");
  return (
    <>
      <Link href="/marca" className="back">← Marcas</Link>
      <PageHeader title="Nueva marca" subtitle="Con estos datos el generador escribe como tu negocio. Podés completarlos de a poco." />
      <BrandForm canEdit />
    </>
  );
}
