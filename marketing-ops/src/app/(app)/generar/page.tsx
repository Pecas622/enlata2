import Link from "next/link";
import { PageHeader } from "@/components/ui";
import { listBrands } from "@/lib/data";
import { requireSection } from "@/lib/guard";
import { GenerateForm } from "./GenerateForm";

export default async function GenerarPage({ searchParams }: { searchParams: Promise<{ marca?: string }> }) {
  const { perms } = await requireSection("generar");
  const { marca } = await searchParams;
  const brands = await listBrands();
  return (
    <>
      <PageHeader title="Generar contenido" subtitle="Elegí la marca, la red y qué querés lograr. Te damos 3 versiones para elegir y editar." />
      {brands.length === 0 ? (
        <div className="card empty">
          Primero cargá una marca para que el generador sepa cómo habla tu negocio.
          {perms.editBrand && <div style={{ marginTop: 12 }}><Link className="btn btn-primary" href="/marca/nueva">Cargar marca</Link></div>}
        </div>
      ) : (
        <GenerateForm brands={brands.map((b) => ({ id: b.id, name: b.name, color: b.color }))} initialBrand={marca} aiEnabled={Boolean(process.env.ANTHROPIC_API_KEY)} />
      )}
    </>
  );
}
