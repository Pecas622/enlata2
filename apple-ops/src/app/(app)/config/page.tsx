import { PageHeader } from "@/components/ui";
import { requireSection } from "@/lib/guard";
import { loadStoreConfig } from "@/lib/store";
import { createClient } from "@/lib/supabase/server";
import { ConfigForm } from "./ConfigForm";
import { DemoCard } from "./DemoCard";
import { FxCard } from "./FxCard";
import { PlanCard } from "./PlanCard";
import { hasModule } from "@/lib/modules";
import { loadPrices } from "@/lib/billing-server";
import { mpConfigured } from "@/lib/mercadopago";
import type { FxSource } from "@/lib/fx";
import { FX_SOURCE_LABEL } from "@/lib/fx";

export default async function ConfigPage({ searchParams }: { searchParams: Promise<{ pago?: string }> }) {
  const { pago } = await searchParams;
  const { user } = await requireSection("config");
  const supabase = await createClient();
  const cfg = await loadStoreConfig(supabase);
  const isAdmin = user.role === "Administrador";
  const { data: fxRow } = await supabase.from("stores").select("fx_source, fx_extra, fx_updated_at, stale_days").eq("id", user.storeId).single();
  const fxSource = (fxRow?.fx_source ?? "manual") as FxSource;
  let demo: { demoSince: string | null; hasData: boolean } | null = null;
  if (isAdmin) {
    const count = async (table: string) => (await supabase.from(table).select("id", { count: "exact", head: true })).count ?? 0;
    const [store, ...counts] = await Promise.all([
      supabase.from("stores").select("demo_since").eq("id", user.storeId).maybeSingle(),
      count("devices"), count("accessories"), count("clients"), count("cash_shifts"),
    ]);
    demo = { demoSince: (store.data?.demo_since as string | null) ?? null, hasData: counts.some((n) => n > 0) };
  }
  // Con el cobro online configurado, el administrador suma módulos pagando con Mercado Pago.
  const canBuy = isAdmin && mpConfigured();
  const prices = canBuy ? await loadPrices() : null;
  const { data: subs } = isAdmin ? await supabase.from("subscriptions").select("item").eq("status", "pendiente") : { data: [] };
  return (
    <>
      <PageHeader title="Configuración" subtitle="Datos del local, cotización y tabla de tasación" />
      {hasModule(user.modules, "alertas") && <div style={{ marginBottom: 16 }}>
        <FxCard source={fxSource} extra={Number(fxRow?.fx_extra ?? 0)} staleDays={fxRow?.stale_days ?? 30} fx={cfg.fx} updatedAt={fxRow?.fx_updated_at ?? null} />
      </div>}
      <ConfigForm
        fxAuto={fxSource === "manual" ? undefined : FX_SOURCE_LABEL[fxSource]}
        initial={{
          name: cfg.name, cuit: cfg.cuit, address: cfg.address, phone: cfg.phone, fx: cfg.fx, target_margin: cfg.targetMargin,
          max_discount_seller: cfg.maxDiscountSeller, warranty_new_days: cfg.warrantyNewDays, warranty_used_days: cfg.warrantyUsedDays,
          cond_mult: cfg.condMult, defect_costs: cfg.defectCosts,
          base_values: [...cfg.baseValues].sort((a, b) => a.model.localeCompare(b.model, "es", { numeric: true }) || a.capacity - b.capacity),
        }}
      />
      <div style={{ marginTop: 16 }}><PlanCard modules={user.modules} prices={prices} canBuy={canBuy} pending={(subs ?? []).map((s) => s.item as string)} paid={pago === "ok"} /></div>
      {demo && <div style={{ marginTop: 16 }}><DemoCard demoSince={demo.demoSince} hasData={demo.hasData} /></div>}
    </>
  );
}
