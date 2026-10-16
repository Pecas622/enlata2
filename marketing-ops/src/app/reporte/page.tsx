import { listBrands, listCampaigns, listContents, listResults, publishedPieces } from "@/lib/data";
import { fmtDate, localDay } from "@/lib/dates";
import { requireSection } from "@/lib/guard";
import { MEDIA_BUCKET } from "@/lib/media";
import { analyze, inPeriod, previousPeriod, resolvePeriod } from "@/lib/metrics";
import { buildReport, campaignResults } from "@/lib/report";
import { createClient } from "@/lib/supabase/server";
import { ReportView } from "./ReportView";

export const metadata = { title: "Reporte para el cliente" };

// Reporte de Métricas para mandarle al cliente: sin el menú de la app, para imprimir, guardar en PDF o copiar.
// Lee lo mismo que Métricas, con el RLS de quien lo abre (un Revisor solo ve sus marcas).
export default async function ReportePage({ searchParams }: { searchParams: Promise<{ mes?: string; marca?: string }> }) {
  const { user } = await requireSection("metricas");
  const sp = await searchParams;
  const today = localDay();
  const period = resolvePeriod(sp.mes, today);
  const prevPeriod = previousPeriod(period);
  const [contents, results, brands, campaigns] = await Promise.all([listContents(), listResults(), listBrands(), listCampaigns()]);
  const brand = brands.find((b) => b.id === sp.marca) ?? (brands.length === 1 ? brands[0] : undefined);
  const all = publishedPieces(contents, results).filter((p) => !brand || p.brand_id === brand.id);
  const rows = all.filter((p) => inPeriod(p.day, period)).sort((a, b) => b.day.localeCompare(a.day));
  const prev = all.filter((p) => inPeriod(p.day, prevPeriod));

  let logoUrl: string | null = null;
  if (brand) {
    const supabase = await createClient();
    const { data: logo } = await supabase.from("media_files").select("path").eq("brand_id", brand.id).eq("kind", "logo").order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (logo) logoUrl = (await supabase.storage.from(MEDIA_BUCKET).createSignedUrl(logo.path, 3600)).data?.signedUrl ?? null;
  }

  const report = buildReport({
    brand: brand?.name ?? null, preparedBy: user.workspaceName, period, rows, prev,
    campaigns: campaignResults(campaigns, all, period, brand?.id), analysis: analyze(rows, prev),
  });
  return (
    <ReportView
      key={`${period.from}-${brand?.id ?? ""}`}
      report={report} dates={`${fmtDate(period.from)} al ${fmtDate(period.to)}`} madeOn={fmtDate(today)}
      color={brand?.color ?? null} logoUrl={logoUrl} mes={period.month} brandId={brand?.id ?? null}
      brands={brands.length > 1 ? brands.map((b) => ({ id: b.id, name: b.name })) : []}
      aiEnabled={Boolean(process.env.ANTHROPIC_API_KEY)}
    />
  );
}
