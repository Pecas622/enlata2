import Link from "next/link";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/ui";
import { isMonth, monthLabel, monthOf, suggestPlan, datesInMonth, shortDate } from "@/lib/calendar";
import { CHANNELS, type Channel } from "@/lib/channels";
import { listBrands, listContents } from "@/lib/data";
import { localDay } from "@/lib/dates";
import { requireSection } from "@/lib/guard";
import { PlanList } from "./PlanList";

export default async function PlanPage({ searchParams }: { searchParams: Promise<{ mes?: string; marca?: string; meta?: string; canal?: string | string[] }> }) {
  const { perms } = await requireSection("calendario");
  if (!perms.create) redirect("/calendario");
  const sp = await searchParams;
  const today = localDay();
  const month = isMonth(sp.mes) && sp.mes >= monthOf(today) ? sp.mes : monthOf(today);
  const brands = await listBrands();
  if (!brands.length) redirect("/marca");
  const brand = brands.find((b) => b.id === sp.marca) ?? brands[0];
  const perWeek = Math.min(7, Math.max(1, Number(sp.meta) || 3));
  const picked = [sp.canal ?? "Instagram"].flat().filter((c): c is Channel => (CHANNELS as readonly string[]).includes(c));
  const channels: Channel[] = picked.length ? picked : ["Instagram"];
  const existing = (await listContents()).filter((c) => c.brand_id === brand.id);
  const plan = suggestPlan(brand, month, existing, { perWeek, channels, today });
  const already = existing.filter((c) => c.publish_on?.startsWith(month)).length;
  const dates = datesInMonth(month);

  return (
    <>
      <Link href={`/calendario?mes=${month}&marca=${brand.id}`} className="back">← Calendario</Link>
      <PageHeader title="Plan del mes" subtitle={`Ideas para ${monthLabel(month)} con las fechas comerciales y lo que vende ${brand.name}. Elegí las que sirven y quedan en el calendario como ideas.`} />
      <form className="card row" style={{ alignItems: "flex-end", marginBottom: 16 }} method="get" data-testid="plan-form">
        <input type="hidden" name="mes" value={month} />
        <label className="field">
          Marca
          <select className="input" name="marca" defaultValue={brand.id} data-testid="plan-brand">
            {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </label>
        <label className="field">
          Publicaciones por semana
          <select className="input" name="meta" defaultValue={String(perWeek)} data-testid="plan-meta">
            {[1, 2, 3, 4, 5, 6, 7].map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </label>
        <div className="field" style={{ flex: "2 1 300px" }}>
          Redes
          <ChannelPicker selected={channels} />
        </div>
        <button className="btn btn-secondary" type="submit" data-testid="plan-refresh">Actualizar ideas</button>
      </form>
      <p className="muted" style={{ marginTop: 0 }}>
        {already ? `${brand.name} ya tiene ${already} ${already === 1 ? "pieza" : "piezas"} este mes: esos días no se tocan. ` : ""}
        {dates.length ? `Fechas del mes: ${dates.map((d) => `${d.name} (${shortDate(d.day)})`).join(", ")}.` : "Este mes no hay fechas comerciales fuertes."}
      </p>
      <PlanList
        key={`${brand.id}|${month}|${perWeek}|${channels.join(",")}`}
        params={{ brandId: brand.id, month, perWeek, channels }}
        items={plan.map((p) => ({ ...p, key: `${p.publish_on}|${p.topic}` }))}
      />
    </>
  );
}

// Checkboxes en un formulario GET: cada red marcada viaja como "canal".
function ChannelPicker({ selected }: { selected: Channel[] }) {
  return (
    <div className="chips" data-testid="plan-channels">
      {CHANNELS.map((c) => (
        <label key={c} className="chip pick check-chip">
          <input type="checkbox" name="canal" value={c} defaultChecked={selected.includes(c)} data-testid={`plan-channel-${c}`} />
          {c}
        </label>
      ))}
    </div>
  );
}
