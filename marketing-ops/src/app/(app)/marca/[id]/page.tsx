import Link from "next/link";
import { notFound } from "next/navigation";
import { Notice, PageHeader } from "@/components/ui";
import { getBrand } from "@/lib/data";
import { fmtDateTime } from "@/lib/dates";
import { requireSection } from "@/lib/guard";
import { BrandForm } from "../BrandForm";

export default async function MarcaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { perms } = await requireSection("marca");
  const brand = await getBrand(id);
  if (!brand) notFound();
  return (
    <>
      <Link href="/marca" className="back">← Marcas</Link>
      <PageHeader
        title={brand.name}
        subtitle={`Última actualización: ${fmtDateTime(brand.updated_at)}`}
        action={perms.create ? <Link className="btn btn-primary" href={`/generar?marca=${brand.id}`}>Generar contenido</Link> : undefined}
      />
      {!perms.editBrand && <div style={{ marginBottom: 12 }}><Notice tone="blue">Solo el Administrador edita la marca. Vos la ves para escribir con su tono.</Notice></div>}
      <BrandForm brand={brand} canEdit={perms.editBrand} />
    </>
  );
}
