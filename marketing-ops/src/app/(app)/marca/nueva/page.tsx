import Link from "next/link";
import { redirect } from "next/navigation";
import { Notice, PageHeader } from "@/components/ui";
import { requireSection } from "@/lib/guard";
import { planUsage } from "@/lib/usage";
import { BrandForm } from "../BrandForm";

export default async function NuevaMarcaPage({ searchParams }: { searchParams: Promise<{ bienvenida?: string }> }) {
  const { perms } = await requireSection("marca");
  if (!perms.editBrand) redirect("/marca");
  const [{ bienvenida }, usage] = await Promise.all([searchParams, planUsage()]);
  const full = usage ? usage.brands >= usage.max_brands : false;
  return (
    <>
      <Link href="/marca" className="back">← Marcas</Link>
      <PageHeader title="Nueva marca" subtitle="Con estos datos el generador escribe como tu negocio. Podés completarlos de a poco." />
      {bienvenida && <Notice tone="blue">¡Bienvenido! Tu cuenta ya está creada. Arrancá por tu marca: con estos datos se arma el plan del mes y se escribe cada pieza.</Notice>}
      {full ? (
        <div className="card empty" data-testid="brand-limit">Tu plan {usage!.plan_name} permite {usage!.max_brands} {usage!.max_brands === 1 ? "marca" : "marcas"} y ya las tenés. Para sumar otra, pasate a un plan más grande.</div>
      ) : <BrandForm canEdit />}
    </>
  );
}
