import Link from "next/link";
import { PageHeader } from "@/components/ui";
import { listBrands, listContents } from "@/lib/data";
import { requireSection } from "@/lib/guard";
import { ContentTable } from "./ContentTable";

export default async function ContenidosPage({ searchParams }: { searchParams: Promise<{ estado?: string }> }) {
  const { perms } = await requireSection("contenidos");
  const { estado } = await searchParams;
  const [rows, brands] = await Promise.all([listContents(), listBrands()]);
  return (
    <>
      <PageHeader
        title="Contenidos"
        subtitle="Todas las piezas, de la idea a publicada. Tocá una para editarla o aprobarla."
        action={perms.create ? <Link className="btn btn-primary" href="/generar">Generar contenido</Link> : undefined}
      />
      <ContentTable rows={rows} brands={brands.map((b) => ({ id: b.id, name: b.name }))} initialStatus={estado} />
    </>
  );
}
