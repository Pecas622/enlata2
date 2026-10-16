import Link from "next/link";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/ui";
import { splitList } from "@/lib/campaigns";
import { listBrands } from "@/lib/data";
import { localDay } from "@/lib/dates";
import { requireSection } from "@/lib/guard";
import { CampaignForm } from "../CampaignForm";

export default async function NuevaCampanaPage({ searchParams }: { searchParams: Promise<{ marca?: string }> }) {
  const { perms } = await requireSection("campanas");
  if (!perms.create) redirect("/campanas");
  const { marca } = await searchParams;
  const brands = await listBrands();
  if (!brands.length) redirect("/marca");
  return (
    <>
      <Link href="/campanas" className="back">← Campañas</Link>
      <PageHeader title="Nueva campaña" subtitle="Con estos datos se arma el brief para Meta Ads. Después le sumás las piezas." />
      <CampaignForm brands={brands.map((b) => ({ id: b.id, name: b.name }))} products={[...new Set(brands.flatMap((b) => splitList(b.products)))]} initialBrand={marca} canEdit today={localDay()} />
    </>
  );
}
