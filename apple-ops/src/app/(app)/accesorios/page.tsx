import Link from "next/link";
import { Notice, PageHeader } from "@/components/ui";
import { isLow } from "@/lib/accessories";
import { requireSection } from "@/lib/guard";
import { createClient } from "@/lib/supabase/server";
import { AccTable } from "./AccTable";
import { loadAccessories } from "./data";

export default async function AccesoriosPage({ searchParams }: { searchParams: Promise<{ cargados?: string }> }) {
  const { cargados } = await searchParams;
  const { perms } = await requireSection("accesorios");
  const rows = await loadAccessories(await createClient(), perms.seeCost);
  const low = rows.filter(isLow);
  return (
    <>
      <PageHeader
        title="Accesorios"
        subtitle="Fundas, vidrios, cargadores y más, con stock y alertas de reposición"
        action={perms.editStock && (
          <>
            <Link href="/accesorios/carga" className="btn btn-secondary" data-testid="acc-bulk">Carga masiva</Link>
            <Link href="/accesorios/nuevo" className="btn btn-primary" data-testid="acc-new">+ Nuevo accesorio</Link>
          </>
        )}
      />
      {cargados && <div style={{ marginBottom: 14 }} data-testid="bulk-done"><Notice tone="blue">Se cargaron {cargados} accesorios.</Notice></div>}
      {low.length > 0 && (
        <div style={{ marginBottom: 14 }} data-testid="acc-low">
          <Notice>
            {low.length} accesorios en o por debajo del mínimo: {low.slice(0, 3).map((a) => a.name).join(", ")}{low.length > 3 ? "…" : ""}
          </Notice>
        </div>
      )}
      <AccTable rows={rows} seeCost={perms.seeCost} />
    </>
  );
}
