// La pantalla de inicio responde tres preguntas: cómo va la marca, qué se publica hoy y qué conviene hacer para
// mejorar. Todo sale de reglas sobre los datos cargados (piezas, resultados, frecuencia de la marca): no llama a la IA.
import { addDays, type Day } from "./calendar";
import { analyze, delta, inPeriod, lastDays, previousPeriod, sum, type PieceResult, type Results } from "./metrics";

export type HomePiece = { id: string; brand_id: string; status: string; publish_on: string | null; post_time: string | null; title: string; topic: string };
export type HomeBrand = { id: string; name: string; posts_per_week: number | null };

// 1. ¿Cómo está funcionando mi marca? Últimos 30 días contra los 30 anteriores.
export type Health = {
  totals: Results;
  prevTotals: Results;
  published: number;
  withResults: number;
  change: { reach: number | null; interactions: number | null; inquiries: number | null };
  summary: string;
  next: string[];
};

export function brandHealth(rows: PieceResult[], today: Day): Health {
  const period = lastDays(today, 30);
  const prevP = previousPeriod(period);
  const cur = rows.filter((p) => inPeriod(p.day, period));
  const prev = rows.filter((p) => inPeriod(p.day, prevP));
  const totals = sum(cur.map((p) => p.results));
  const prevTotals = sum(prev.map((p) => p.results));
  const hasPrev = prev.some((p) => p.results);
  const a = analyze(cur, prev);
  return {
    totals, prevTotals,
    published: cur.length,
    withResults: cur.filter((p) => p.results).length,
    change: {
      reach: hasPrev ? delta(totals.reach, prevTotals.reach) : null,
      interactions: hasPrev ? delta(totals.interactions, prevTotals.interactions) : null,
      inquiries: hasPrev ? delta(totals.inquiries, prevTotals.inquiries) : null,
    },
    summary: a.summary,
    next: a.next,
  };
}

// 2. ¿Qué contenido tengo que publicar hoy? Lo de hoy, por horario, y lo aprobado que quedó atrasado.
export type TodayItem = HomePiece & { late: boolean; hint: string };

export function hintFor(status: string): string {
  if (status === "Aprobado") return "Lista para publicar";
  if (status === "En revisión") return "Falta que la aprueben";
  if (status === "Idea") return "Falta escribirla";
  if (status === "Borrador") return "Falta mandarla a revisión";
  return "";
}

export function todayList(pieces: HomePiece[], today: Day): TodayItem[] {
  const todays = pieces
    .filter((p) => p.publish_on === today && p.status !== "Publicado")
    .sort((a, b) => (a.post_time ?? "99").localeCompare(b.post_time ?? "99"))
    .map((p) => ({ ...p, late: false, hint: hintFor(p.status) }));
  const late = pieces
    .filter((p) => p.status === "Aprobado" && p.publish_on && p.publish_on < today)
    .sort((a, b) => a.publish_on!.localeCompare(b.publish_on!))
    .map((p) => ({ ...p, late: true, hint: "Quedó con la fecha pasada: publicala o cambiale el día" }));
  return [...todays, ...late];
}

// 3. ¿Qué debería hacer para conseguir mejores resultados? Pasos concretos, del más urgente al menos.
export type Tip = { text: string; href: string; who: "create" | "review" | "all" };

export function homeTips(input: { pieces: HomePiece[]; brands: HomeBrand[]; published: PieceResult[]; health: Health; today: Day }): Tip[] {
  const { pieces, brands, published, health, today } = input;
  const tips: Tip[] = [];
  if (!brands.length) return [{ text: "Cargá tu marca: qué vendés, a quién le hablás y en qué redes estás. Con eso se arma todo lo demás.", href: "/marca/nueva", who: "create" }];

  const review = pieces.filter((p) => p.status === "En revisión").length;
  if (review) tips.push({ text: `Hay ${review} ${review === 1 ? "pieza esperando" : "piezas esperando"} aprobación. Revisalas para no atrasar el calendario.`, href: "/contenidos?estado=En revisión", who: "review" });

  const late = pieces.filter((p) => p.status === "Aprobado" && p.publish_on && p.publish_on < today).length;
  if (late) tips.push({ text: `${late} ${late === 1 ? "pieza aprobada quedó" : "piezas aprobadas quedaron"} con la fecha pasada: publicalas o movelas en el calendario.`, href: "/calendario", who: "create" });

  // Frecuencia: lo que hay en los próximos 7 días contra lo que pide cada marca.
  const week = Array.from({ length: 7 }, (_, i) => addDays(today, i));
  const short = brands
    .map((b) => {
      const want = Math.min(7, Math.max(1, b.posts_per_week ?? 3));
      const have = pieces.filter((p) => p.brand_id === b.id && p.publish_on && week.includes(p.publish_on)).length;
      return { b, want, have };
    })
    .filter((x) => x.have < x.want);
  for (const x of short.slice(0, 2)) {
    tips.push({ text: `${x.b.name} tiene ${x.have} de ${x.want} publicaciones para los próximos 7 días. Armá el plan del mes para completar.`, href: `/calendario/plan?marca=${x.b.id}`, who: "create" });
  }

  const noResults = published.filter((p) => !p.results && p.day <= addDays(today, -2) && p.day >= addDays(today, -45)).length;
  if (noResults) tips.push({ text: `Cargá los resultados de ${noResults} ${noResults === 1 ? "pieza publicada" : "piezas publicadas"}: sin eso no se sabe qué funcionó.`, href: "/metricas", who: "create" });

  for (const n of health.next) {
    if (tips.length >= 5) break;
    if (/^Cargá los resultados/.test(n) && noResults) continue;
    tips.push({ text: n, href: "/metricas", who: "all" });
  }
  return tips.slice(0, 5);
}
