import Link from "next/link";
import { redirect } from "next/navigation";
import { Notice, PageHeader } from "@/components/ui";
import { datesInMonth, isMonth, monthLabel, monthOf, shiftMonth, shortDate } from "@/lib/calendar";
import { latestPlan, listBrands, listContents } from "@/lib/data";
import { localDay } from "@/lib/dates";
import { requireSection } from "@/lib/guard";
import { brandChannels, clampPerWeek, planSlots } from "@/lib/planner";
import { BuildPlan } from "./BuildPlan";
import { PlanBoard } from "./PlanBoard";

// Con IA, el plan se piensa y se escribe en dos pasos: la acción puede tardar más que el resto.
export const maxDuration = 180;

const when = (iso: string) =>
  new Intl.DateTimeFormat("es-AR", { timeZone: "America/Argentina/Mendoza", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));

export default async function PlanPage({ searchParams }: { searchParams: Promise<{ mes?: string; marca?: string }> }) {
  const { perms, user } = await requireSection("calendario");
  if (!perms.create) redirect("/calendario");
  const sp = await searchParams;
  const today = localDay();
  const month = isMonth(sp.mes) && sp.mes >= monthOf(today) ? sp.mes : monthOf(today);
  const brands = await listBrands();
  if (!brands.length) redirect("/marca");
  const brand = brands.find((b) => b.id === sp.marca) ?? brands[0];
  const [existing, plan] = await Promise.all([listContents().then((all) => all.filter((c) => c.brand_id === brand.id)), latestPlan(brand.id, month)]);
  const free = planSlots(brand, month, existing, today).length;
  const already = existing.filter((c) => c.publish_on?.startsWith(month)).length;
  const dates = datesInMonth(month).filter((d) => d.day >= today);
  const aiEnabled = Boolean(process.env.ANTHROPIC_API_KEY);
  const href = (m: string, b = brand.id) => `/calendario/plan?mes=${m}&marca=${b}`;

  return (
    <>
      <Link href={`/calendario?mes=${month}&marca=${brand.id}`} className="back">← Calendario</Link>
      <PageHeader
        title="Plan del mes"
        subtitle={`Qué publicar cada día de ${monthLabel(month)}: horario, red, formato, gancho, guion, texto y por qué. Revisás, elegís y queda en el calendario para editar y aprobar.`}
      />
      <div className="pills">
        {brands.map((b) => (
          <Link key={b.id} className={`pill${b.id === brand.id ? " active" : ""}`} href={href(month, b.id)} data-testid="plan-brand">
            <span className="dot" style={{ background: b.color, width: 8, height: 8, marginRight: 6 }} />{b.name}
          </Link>
        ))}
      </div>
      <div className="pills" style={{ marginTop: -4 }}>
        {[0, 1, 2].map((n) => {
          const m = shiftMonth(monthOf(today), n);
          return <Link key={m} className={`pill${m === month ? " active" : ""}`} href={href(m)} data-testid="plan-month">{monthLabel(m)}</Link>;
        })}
      </div>

      <div className="card stack" style={{ marginBottom: 16 }}>
        <div className="facts wide" style={{ margin: 0 }} data-testid="plan-settings">
          <span>Redes</span><b>{brandChannels(brand).join(", ")}</b>
          <span>Frecuencia</span><b>{clampPerWeek(brand.posts_per_week)} por semana</b>
          <span>Objetivos</span><b>{brand.goals || "Sin cargar"}</b>
          <span>Este mes</span>
          <b>
            {already ? `Ya tiene ${already} ${already === 1 ? "pieza" : "piezas"}; esos días no se tocan. ` : ""}
            {free ? `Quedan ${free} ${free === 1 ? "fecha" : "fechas"} para planificar.` : "No quedan fechas libres con esta frecuencia."}
            {dates.length ? ` Fechas comerciales: ${dates.map((d) => `${d.name} (${shortDate(d.day)})`).join(", ")}.` : ""}
          </b>
        </div>
        {user.role === "Administrador" && <span className="hint">Redes, frecuencia y objetivos se cambian en <Link href={`/marca/${brand.id}`}>la marca</Link>.</span>}
        <BuildPlan key={`${brand.id}|${month}`} brandId={brand.id} month={month} aiEnabled={aiEnabled} disabled={!free} again={Boolean(plan)} />
      </div>

      {plan ? (
        <>
          <div className="row" style={{ alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
            <h2 className="card-title" style={{ margin: 0 }}>Plan armado el {when(plan.created_at)}{plan.author ? ` por ${plan.author.name}` : ""}</h2>
          </div>
          {plan.source === "plantilla" && (
            <div style={{ marginBottom: 12 }}>
              <Notice tone="blue">Armado con reglas y plantillas, sin IA: los temas salen de las fechas comerciales y de lo que vende la marca.{aiEnabled ? "" : " Con la clave de Anthropic en el servidor lo arma Claude con la investigación y los resultados."}</Notice>
            </div>
          )}
          {plan.summary && <p className="muted" style={{ marginTop: 0 }} data-testid="plan-summary">{plan.summary}</p>}
          <PlanBoard key={plan.id} planId={plan.id} items={plan.items} today={today} back={{ month, brandId: brand.id }} />
        </>
      ) : (
        <div className="card empty" data-testid="plan-none">Todavía no armaste el plan de {monthLabel(month)} para {brand.name}.</div>
      )}
    </>
  );
}
