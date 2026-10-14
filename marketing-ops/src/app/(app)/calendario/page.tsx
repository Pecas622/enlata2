import Link from "next/link";
import { Notice, PageHeader } from "@/components/ui";
import { addDays, asView, commercialDates, isDay, isMonth, longDate, monthGrid, monthLabel, monthOf, shiftMonth, shortDate, weekLoad, weekOf } from "@/lib/calendar";
import { CHANNELS, type Channel } from "@/lib/channels";
import { listBrands, listContents } from "@/lib/data";
import { localDay } from "@/lib/dates";
import { requireSection } from "@/lib/guard";
import { STATUSES, type Status } from "@/lib/workflow";
import { CalendarBoard, type CalPiece } from "./CalendarBoard";
import { CalFilters } from "./CalFilters";

const PER_WEEK = 3;

type SP = { mes?: string; marca?: string; agregadas?: string; vista?: string; dia?: string; red?: string; estado?: string };

export default async function CalendarioPage({ searchParams }: { searchParams: Promise<SP> }) {
  const { perms } = await requireSection("calendario");
  const sp = await searchParams;
  const today = localDay();
  const view = asView(sp.vista);
  // En semana y día manda el día; en mes, el mes. Al cambiar de vista se conserva dónde estabas.
  const day = isDay(sp.dia) ? sp.dia : isMonth(sp.mes) && sp.mes !== monthOf(today) ? `${sp.mes}-01` : today;
  const month = view === "mes" ? (isMonth(sp.mes) ? sp.mes : monthOf(day)) : monthOf(day);
  const red = (CHANNELS as readonly string[]).includes(sp.red ?? "") ? (sp.red as Channel) : null;
  const estado = (STATUSES as readonly string[]).includes(sp.estado ?? "") ? (sp.estado as Status) : null;
  const [brands, rows] = await Promise.all([listBrands(), listContents()]);
  const brand = brands.find((b) => b.id === sp.marca);
  const mine = rows.filter((r) => (!brand || r.brand_id === brand.id) && (!red || r.channel === red) && (!estado || r.status === estado));
  const weeks = monthGrid(month);
  const days = view === "semana" ? weekOf(day) : view === "dia" ? [day] : weeks.flat().map((d) => d.day);
  const first = days[0];
  const last = days.at(-1)!;
  const years = [...new Set([first.slice(0, 4), last.slice(0, 4)])].map(Number);
  const dates = years.flatMap(commercialDates).filter((d) => d.day >= first && d.day <= last);
  const pieces: CalPiece[] = mine.map((r) => ({
    id: r.id, title: r.title || r.topic || "Sin título", channel: r.channel, format: r.format, status: r.status,
    publish_on: r.publish_on, time: r.post_time?.slice(0, 5) ?? "", brand: r.brands?.name ?? "", color: r.brands?.color ?? "#5E5CE6", hook: r.hook,
  }));
  // Las semanas flojas solo se miden sin filtros: con un filtro puesto, "falta" no quiere decir nada.
  const load = red || estado ? [] : weekLoad(month, mine, PER_WEEK * (brand ? 1 : Math.max(1, brands.length)), today);
  const link = (patch: Partial<Record<"mes" | "marca" | "vista" | "dia" | "red" | "estado", string | null>>) => {
    const cur = { vista: view === "mes" ? null : view, mes: view === "mes" ? month : null, dia: view === "mes" ? null : day, marca: brand?.id ?? null, red, estado };
    const next = { ...cur, ...patch };
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(next)) if (v) q.set(k, v);
    return `/calendario?${q}`;
  };
  const step = (n: number) =>
    view === "mes" ? link({ mes: shiftMonth(month, n) }) : link({ dia: addDays(day, view === "semana" ? 7 * n : n), mes: null });
  const title = view === "mes" ? monthLabel(month) : view === "semana" ? `Semana del ${shortDate(first)} al ${shortDate(last)}` : longDate(day);
  const atToday = view === "mes" ? month === monthOf(today) : view === "semana" ? weekOf(today)[0] === first : day === today;
  const planHref = `/calendario/plan?mes=${month < monthOf(today) ? monthOf(today) : month}${brand ? `&marca=${brand.id}` : ""}`;

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
          <Link className="btn btn-secondary cal-arrow" href={step(-1)} aria-label="Anterior" data-testid="cal-prev">‹</Link>
          <h2 className="cal-month" data-testid="cal-month">{title}</h2>
          <Link className="btn btn-secondary cal-arrow" href={step(1)} aria-label="Siguiente" data-testid="cal-next">›</Link>
          {!atToday && <Link className="btn btn-ghost" href={view === "mes" ? link({ mes: monthOf(today) }) : link({ dia: today })}>Hoy</Link>}
        </div>
        <div className="seg" role="tablist" aria-label="Vista">
          {(["mes", "semana", "dia"] as const).map((v) => (
            <Link key={v} role="tab" aria-selected={view === v} className={view === v ? "on" : ""} data-testid={`cal-view-${v}`}
              href={v === "mes" ? link({ vista: null, dia: null, mes: monthOf(day) }) : link({ vista: v, mes: null, dia: view === "mes" ? (month === monthOf(today) ? today : `${month}-01`) : day })}>
              {v === "mes" ? "Mes" : v === "semana" ? "Semana" : "Día"}
            </Link>
          ))}
        </div>
      </div>
      <div className="cal-toolbar">
        <div className="pills" style={{ margin: 0 }}>
          <Link className={`pill${!brand ? " active" : ""}`} href={link({ marca: null })}>Todas las marcas</Link>
          {brands.map((b) => (
            <Link key={b.id} className={`pill${brand?.id === b.id ? " active" : ""}`} href={link({ marca: b.id })} data-testid="cal-brand">
              <span className="dot" style={{ background: b.color, width: 8, height: 8, marginRight: 6 }} />{b.name}
            </Link>
          ))}
        </div>
        <CalFilters red={red} estado={estado} hrefs={{
          red: Object.fromEntries([["", link({ red: null })], ...CHANNELS.map((c) => [c, link({ red: c })])]),
          estado: Object.fromEntries([["", link({ estado: null })], ...STATUSES.map((s) => [s, link({ estado: s })])]),
        }} />
      </div>
      <CalendarBoard
        view={view}
        month={month}
        today={today}
        weeks={weeks}
        days={days}
        pieces={pieces}
        dates={dates.map((d) => ({ day: d.day, name: d.name }))}
        load={load.map((w) => ({ start: w.start, count: w.count, target: w.target, short: w.short }))}
        canMove={perms.create}
        planHref={perms.create ? planHref : undefined}
        dayHref={Object.fromEntries(days.map((d) => [d, link({ vista: "dia", dia: d, mes: null })]))}
        back={link({})}
        filtered={Boolean(red || estado)}
      />
    </>
  );
}
