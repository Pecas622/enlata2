import { PageHeader } from "@/components/ui";
import { requireSection } from "@/lib/guard";
import { loadStoreConfig } from "@/lib/store";
import { createClient } from "@/lib/supabase/server";
import { ConfigForm } from "./ConfigForm";
import { DemoCard } from "./DemoCard";

export default async function ConfigPage() {
  const { user } = await requireSection("config");
  const supabase = await createClient();
  const cfg = await loadStoreConfig(supabase);
  const isAdmin = user.role === "Administrador";
  let demo: { demoSince: string | null; hasData: boolean } | null = null;
  if (isAdmin) {
    const count = async (table: string) => (await supabase.from(table).select("id", { count: "exact", head: true })).count ?? 0;
    const [store, ...counts] = await Promise.all([
      supabase.from("stores").select("demo_since").eq("id", user.storeId).maybeSingle(),
      count("devices"), count("accessories"), count("clients"), count("cash_shifts"),
    ]);
    demo = { demoSince: (store.data?.demo_since as string | null) ?? null, hasData: counts.some((n) => n > 0) };
  }
  return (
    <>
      <PageHeader title="Configuración" subtitle="Datos del local, cotización y tabla de tasación" />
      <ConfigForm
        initial={{
          name: cfg.name, cuit: cfg.cuit, address: cfg.address, phone: cfg.phone, fx: cfg.fx, target_margin: cfg.targetMargin,
          max_discount_seller: cfg.maxDiscountSeller, warranty_new_days: cfg.warrantyNewDays, warranty_used_days: cfg.warrantyUsedDays,
          cond_mult: cfg.condMult, defect_costs: cfg.defectCosts,
          base_values: [...cfg.baseValues].sort((a, b) => a.model.localeCompare(b.model, "es", { numeric: true }) || a.capacity - b.capacity),
        }}
      />
      {demo && <div style={{ marginTop: 16 }}><DemoCard demoSince={demo.demoSince} hasData={demo.hasData} /></div>}
    </>
  );
}
