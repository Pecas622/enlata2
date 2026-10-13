import Link from "next/link";
import { Badge, PageHeader } from "@/components/ui";
import { listBrands, listContents } from "@/lib/data";
import { requireSection } from "@/lib/guard";

export default async function MarcasPage() {
  const { perms } = await requireSection("marca");
  const [brands, contents] = await Promise.all([listBrands(), listContents()]);
  return (
    <>
      <PageHeader
        title="Marcas"
        subtitle="Lo que el generador sabe de cada negocio: qué vende, a quién le habla y cómo."
        action={perms.editBrand ? <Link className="btn btn-primary" href="/marca/nueva" data-testid="brand-new">Nueva marca</Link> : undefined}
      />
      {brands.length === 0 && <div className="card empty">Todavía no hay marcas. Cargá la primera para empezar a generar contenido.</div>}
      <div className="grid-2">
        {brands.map((b) => {
          const count = contents.filter((c) => c.brand_id === b.id).length;
          return (
            <Link key={b.id} href={`/marca/${b.id}`} className="card brand-card" data-testid="brand-card">
              <h3><span className="dot" style={{ background: b.color }} />{b.name}</h3>
              <p>{[b.industry, b.city].filter(Boolean).join(" · ")}</p>
              {b.value_prop && <p style={{ color: "var(--text)" }}>{b.value_prop}</p>}
              <div className="tags">
                {b.tone.map((t) => <Badge key={t} tone="blue">{t}</Badge>)}
                <Badge tone="gray">{count} {count === 1 ? "pieza" : "piezas"}</Badge>
              </div>
            </Link>
          );
        })}
      </div>
    </>
  );
}
