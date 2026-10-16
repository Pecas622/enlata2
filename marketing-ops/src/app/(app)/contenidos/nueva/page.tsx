import Link from "next/link";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/ui";
import { listBrands, listCampaigns } from "@/lib/data";
import { requireSection } from "@/lib/guard";
import { OwnPieceForm } from "./OwnPieceForm";

export default async function NuevaPiezaPage({ searchParams }: { searchParams: Promise<{ campana?: string }> }) {
  const { perms } = await requireSection("contenidos");
  if (!perms.create) redirect("/contenidos");
  const { campana } = await searchParams;
  const [brands, campaigns] = await Promise.all([listBrands(), listCampaigns()]);
  if (!brands.length) redirect("/marca");
  return (
    <>
      <Link href="/contenidos" className="back">← Contenidos</Link>
      <PageHeader title="Cargar pieza propia" subtitle="Para lo que ya tenés escrito o diseñado afuera de la app. Entra como borrador y pasa por aprobación como las demás." />
      <OwnPieceForm
        brands={brands.map((b) => ({ id: b.id, name: b.name }))}
        campaigns={campaigns.map((c) => ({ id: c.id, name: c.name, brandId: c.brand_id, goal: c.goal }))}
        initialCampaign={campana}
      />
    </>
  );
}
