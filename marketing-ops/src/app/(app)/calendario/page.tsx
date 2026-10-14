import Link from "next/link";
import { Notice, PageHeader } from "@/components/ui";
import { commercialDates, isMonth, monthGrid, monthLabel, shiftMonth, weekLoad, monthOf } from "@/lib/calendar";
import { listBrands, listContents } from "@/lib/data";
import { localDay } from "@/lib/dates";
import { requireSection } from "@/lib/guard";
import { CalendarBoard, type CalPiece } from "./CalendarBoard";

const PER_WEEK = 3;

export default async function CalendarioPage({ searchParams }: { searchParams: Promise<{ mes?: string; marca?: string; agregadas?: string }> }) {
  const { perms } = await requireSection("calendario");
  const sp = await searchParams;
  const today = localDay();
  const month = isMonth(sp.mes) ? sp.mes : monthOf(today);
  const [brands, rows] = await Promise.all([listBrands(), listContents()]);
  const brand = brands.find((b) => b.id === sp.marca);
  const mine = rows.filter((r) => !brand || r.brand_id === brand.id);
  const weeks = monthGrid(month);
  const first = weeks[0][0].day;
  const last = weeks.at(-1)!.at(-1)!.day;
  const years = [...new Set([first.slice(0, 4), last.slice(0, 4)])].map(Number);
  const dates = years.flatMap(commercialDates).filter((d) => d.day >= first && d.day <= last);
  const pieces: CalPiece[] = mine.map((r) => ({
    id: r.id, title: r.title || r.topic || "Sin título", channel: r.channel, format: r.format, status: r.status,
    publish_on: r.publish_on, time: r.post_time?.slice(0, 5) ?? "", brand: r.brands?.name ?? "", color: r.brands?.color ?? "#5E5CE6",
  }));
  const load = weekLoad(month, mine, PER_WEEK * (brand ? 1 : Math.max(1, brands.length)), today);
  const link = (patch: { mes?: string; marca?: string | null }) => {
    const q = new URLSearchParams();
    q.set("mes", patch.mes ?? month);
    const m = patch.marca === undefined ? brand?.id : patch.marca;
    if (m) q.set("marca", m);
    return `/calendario?${q}`;
  };
  const planHref = `/calendario/plan?mes=${month}${brand ? `&marca=${brand.id}` : ""}`;

  return (
    <>
      <PageHeader
        title="Calendario"
        subtitle={perms.create ? "Qué sale cada día. Arrastrá una pieza para cambiarla de día; las semanas flojas quedan marcadas." : "Qué sale cada día y en qué estado está cada pieza."}
        action={perms.create && monthOf(today) <= month ? <Link className="btn btn-primary" href={planHref} data-testid="plan-open">Armar el plan del mes</Link> : undefined}
      />
      {sp.agregadas && <div style={{ marginBottom: 12 }}><Notice tone="blue">Se agregaron {sp.agregadas} {sp.agregadas === "1" ? "pieza" : "piezas"} del plan al calendario, como borradores. Abrí cada una para revisarla y mandarla a aprobar.</Notice></div>}
      <div className="cal-toolbar">
        <div className="cal-nav">
          <Link className="btn btn-secondary cal-arrow" href={link({ mes: shiftMonth(month, -1) })} aria-label="Mes anterior" data-testid="cal-prev">‹</Link>
          <h2 className="cal-month" data-testid="cal-month">{monthLabel(month)}</h2>
          <Link className="btn btn-secondary cal-arrow" href={link({ mes: shiftMonth(month, 1) })} aria-label="Mes siguiente" data-testid="cal-next">›</Link>
          {month !== monthOf(today) && <Link className="btn btn-ghost" href={link({ mes: monthOf(today) })}>Hoy</Link>}
        </div>
        <div className="pills" style={{ margin: 0 }}>
          <Link className={`pill${!brand ? " active" : ""}`} href={link({ marca: null })}>Todas las marcas</Link>
          {brands.map((b) => (
            <Link key={b.id} className={`pill${brand?.id === b.id ? " active" : ""}`} href={link({ marca: b.id })} data-testid="cal-brand">
              <span className="dot" style={{ background: b.color, width: 8, height: 8, marginRight: 6 }} />{b.name}
            </Link>
          ))}
        </div>
      </div>
      <CalendarBoard
        month={month}
        today={today}
        weeks={weeks}
        pieces={pieces}
        dates={dates.map((d) => ({ day: d.day, name: d.name }))}
        load={load.map((w) => ({ start: w.start, count: w.count, target: w.target, short: w.short }))}
        canMove={perms.create}
        planHref={perms.create ? planHref : undefined}
      />
    </>
  );
}
