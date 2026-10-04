import Link from "next/link";
import { PageHeader } from "@/components/ui";
import { DEVICE_COLUMNS, withCost } from "@/lib/devices";
import { requireSection } from "@/lib/guard";
import { canOpen } from "@/lib/roles";
import { createClient } from "@/lib/supabase/server";
import { StockTable } from "./StockTable";

export default async function StockPage() {
  const { user, perms } = await requireSection("stock");
  const supabase = await createClient();
  const select = perms.seeCost ? `${DEVICE_COLUMNS}, device_costs(cost_usd)` : DEVICE_COLUMNS;
  const { data } = await supabase.from("devices").select(select).order("entry_date", { ascending: false });
  const rows = withCost((data ?? []) as never);
  return (
    <>
      <PageHeader
        title="Stock de equipos"
        subtitle="Cada equipo con su IMEI, condición e historial"
        action={canOpen(user.role, "ingresos") && <Link className="btn btn-primary" href="/ingresos" data-testid="go-ingreso">+ Ingresar equipo</Link>}
      />
      <StockTable rows={rows} seeCost={perms.seeCost} />
    </>
  );
}
