import Link from "next/link";
import { notFound } from "next/navigation";
import { Notice, PageHeader } from "@/components/ui";
import { getBrand } from "@/lib/data";
import { fmtDateTime } from "@/lib/dates";
import { requireSection } from "@/lib/guard";
import { MediaPanel } from "@/components/media/MediaPanel";
import { listMedia } from "@/lib/media-server";
import { BrandForm } from "../BrandForm";

export default async function MarcaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user, perms } = await requireSection("marca");
  const brand = await getBrand(id);
  if (!brand) notFound();
  const media = await listMedia({ brandId: brand.id });
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
      <div style={{ marginTop: 16 }}>
        <MediaPanel
          workspaceId={user.workspaceId} brandId={brand.id} items={media} canEdit={perms.create} back={`/marca/${brand.id}`} withLogo
          title="Logo, fotos y videos" hint="El banco de la marca: el logo y las fotos y videos para usar en las piezas. Es privado, solo lo ve tu equipo."
        />
      </div>
    </>
  );
}
