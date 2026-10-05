import Link from "next/link";
import { PageHeader } from "@/components/ui";
import { requireSection } from "@/lib/guard";
import { createClient } from "@/lib/supabase/server";
import { ClientTable, type ClientRow } from "./ClientTable";

export default async function ClientesPage() {
  await requireSection("clientes");
  const supabase = await createClient();
  const { data } = await supabase.from("clientes_resumen").select("id, name, phone, dni, compras, total_usd, ultima").order("name");
  const rows = ((data ?? []) as ClientRow[]).map((c) => ({ ...c, total_usd: Number(c.total_usd) }));
  return (
    <>
      <PageHeader
        title="Clientes"
        subtitle="Historial de compras y canjes de cada cliente"
        action={<Link href="/clientes/nuevo" className="btn btn-primary" data-testid="cli-new">+ Nuevo cliente</Link>}
      />
      <ClientTable rows={rows} />
    </>
  );
}
