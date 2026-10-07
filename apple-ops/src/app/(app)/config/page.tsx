import { PageHeader } from "@/components/ui";
import { requireSection } from "@/lib/guard";
import { loadStoreConfig } from "@/lib/store";
import { createClient } from "@/lib/supabase/server";
import { ConfigForm } from "./ConfigForm";

export default async function ConfigPage() {
  await requireSection("config");
  const supabase = await createClient();
  const cfg = await loadStoreConfig(supabase);
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
    </>
  );
}
