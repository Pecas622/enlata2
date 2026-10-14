// Calendario de contenidos: grilla del mes, fechas comerciales de Argentina, semanas flojas y plan del mes sugerido.
// Todo trabaja con días "YYYY-MM-DD" del día local de Argentina (ver dates.ts) y es puro, para poder probarlo.
import { formatsFor, type Channel, type Format, type Goal } from "./channels";

export type Day = string; // "YYYY-MM-DD"
export type Month = string; // "YYYY-MM"

const MONTHS = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
export const WEEKDAYS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

const pad = (n: number) => String(n).padStart(2, "0");
const toDate = (d: Day) => new Date(d + "T12:00:00Z");
const fromDate = (d: Date): Day => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;

export function isMonth(v: string | undefined | null): v is Month {
  return !!v && /^\d{4}-(0[1-9]|1[0-2])$/.test(v);
}

export function monthOf(day: Day): Month {
  return day.slice(0, 7);
}

export function addDays(day: Day, n: number): Day {
  const d = toDate(day);
  d.setUTCDate(d.getUTCDate() + n);
  return fromDate(d);
}

export function shiftMonth(month: Month, n: number): Month {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1, 12));
  return fromDate(d).slice(0, 7);
}

export function monthLabel(month: Month) {
  const [y, m] = month.split("-").map(Number);
  return `${MONTHS[m - 1]} ${y}`;
}

export function daysInMonth(month: Month) {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

// 0 = lunes … 6 = domingo.
export function weekday(day: Day) {
  return (toDate(day).getUTCDay() + 6) % 7;
}

export function shortDate(day: Day) {
  return `${Number(day.slice(8, 10))}/${Number(day.slice(5, 7))}`;
}

export function longDate(day: Day) {
  const names = ["lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"];
  return `${names[weekday(day)]} ${Number(day.slice(8, 10))} de ${MONTHS[Number(day.slice(5, 7)) - 1]}`;
}

export function isDay(v: string | undefined | null): v is Day {
  return !!v && /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(v) && fromDate(toDate(v)) === v;
}

// Los 7 días (lunes a domingo) de la semana de un día.
export function weekOf(day: Day): Day[] {
  const monday = addDays(day, -weekday(day));
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
}

export type CalView = "mes" | "semana" | "dia";
export const asView = (v: string | undefined): CalView => (v === "semana" || v === "dia" ? v : "mes");

export type GridDay = { day: Day; inMonth: boolean };

// Semanas de lunes a domingo que cubren el mes completo.
export function monthGrid(month: Month): GridDay[][] {
  const first = `${month}-01`;
  let cur = addDays(first, -weekday(first));
  const last = `${month}-${pad(daysInMonth(month))}`;
  const weeks: GridDay[][] = [];
  while (cur <= last) {
    const week: GridDay[] = [];
    for (let i = 0; i < 7; i++) {
      week.push({ day: cur, inMonth: monthOf(cur) === month });
      cur = addDays(cur, 1);
    }
    weeks.push(week);
  }
  return weeks;
}

// ---------- Fechas comerciales ----------

export type CommercialDate = {
  day: Day;
  name: string;
  goal: Goal;
  topic: string; // "{marca}" se reemplaza por el nombre de la marca
  lead: number; // días antes conviene publicar
  keywords: string[]; // para darse cuenta de que ya hay una pieza para esa fecha
};

// n-ésimo día de la semana (0 = lunes) del mes.
function nthWeekday(year: number, month: number, wd: number, n: number): Day {
  const first = `${year}-${pad(month)}-01`;
  const offset = (wd - weekday(first) + 7) % 7;
  return addDays(first, offset + 7 * (n - 1));
}

// Domingo de Pascua (algoritmo de Meeus/Butcher, calendario gregoriano).
export function easter(year: number): Day {
  const a = year % 19, b = Math.floor(year / 100), c = year % 100;
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31), day = ((h + l - 7 * m + 114) % 31) + 1;
  return `${year}-${pad(month)}-${pad(day)}`;
}

export function commercialDates(year: number): CommercialDate[] {
  const fixed = (m: number, d: number) => `${year}-${pad(m)}-${pad(d)}`;
  const list: CommercialDate[] = [
    { day: fixed(1, 1), name: "Año Nuevo", goal: "Comunidad", topic: "Saludo de Año Nuevo de {marca}", lead: 0, keywords: ["año nuevo"] },
    { day: addDays(easter(year), -48), name: "Carnaval", goal: "Comunidad", topic: "Fin de semana largo de Carnaval: horarios de {marca}", lead: 3, keywords: ["carnaval"] },
    { day: fixed(2, 14), name: "San Valentín", goal: "Promoción", topic: "Regalos para San Valentín en {marca}", lead: 5, keywords: ["san valentin", "enamorados"] },
    { day: fixed(3, 8), name: "Día de la Mujer", goal: "Comunidad", topic: "Las mujeres detrás de {marca}", lead: 0, keywords: ["dia de la mujer", "8m"] },
    { day: easter(year), name: "Pascuas", goal: "Promoción", topic: "Pascuas en {marca}: qué preparamos", lead: 5, keywords: ["pascua"] },
    { day: fixed(5, 1), name: "Día del Trabajador", goal: "Comunidad", topic: "Horarios del feriado del 1° de mayo en {marca}", lead: 2, keywords: ["trabajador", "1 de mayo"] },
    { day: fixed(5, 25), name: "25 de Mayo", goal: "Comunidad", topic: "Feriado del 25 de Mayo en {marca}", lead: 2, keywords: ["25 de mayo"] },
    { day: nthWeekday(year, 6, 6, 3), name: "Día del Padre", goal: "Promoción", topic: "Regalos para el Día del Padre en {marca}", lead: 7, keywords: ["dia del padre"] },
    { day: fixed(7, 9), name: "Día de la Independencia", goal: "Comunidad", topic: "Feriado del 9 de Julio en {marca}", lead: 2, keywords: ["9 de julio", "independencia"] },
    { day: fixed(7, 20), name: "Día del Amigo", goal: "Comunidad", topic: "Día del Amigo: etiquetá a quien compartirías {marca}", lead: 3, keywords: ["dia del amigo"] },
    { day: nthWeekday(year, 8, 6, 3), name: "Día de las Infancias", goal: "Promoción", topic: "Día de las Infancias en {marca}", lead: 7, keywords: ["infancias", "dia del niño", "dia del nino"] },
    { day: fixed(9, 21), name: "Primavera y Día del Estudiante", goal: "Comunidad", topic: "Llega la primavera a {marca}", lead: 3, keywords: ["primavera", "estudiante"] },
    { day: nthWeekday(year, 10, 6, 3), name: "Día de la Madre", goal: "Promoción", topic: "Regalos para el Día de la Madre en {marca}", lead: 7, keywords: ["dia de la madre"] },
    { day: nthWeekday(year, 11, 4, 4), name: "Black Friday", goal: "Promoción", topic: "Black Friday en {marca}", lead: 4, keywords: ["black friday"] },
    { day: fixed(12, 24), name: "Nochebuena", goal: "Promoción", topic: "Pedidos para las fiestas en {marca}", lead: 10, keywords: ["nochebuena", "fiestas", "navidad"] },
    { day: fixed(12, 25), name: "Navidad", goal: "Comunidad", topic: "Saludo de Navidad de {marca}", lead: 0, keywords: ["navidad"] },
    { day: fixed(12, 31), name: "Fin de año", goal: "Comunidad", topic: "Gracias por este año: el balance de {marca}", lead: 1, keywords: ["fin de año", "fin de ano", "brindis"] },
  ];
  return list.sort((a, b) => a.day.localeCompare(b.day));
}

export function datesInMonth(month: Month): CommercialDate[] {
  return commercialDates(Number(month.slice(0, 4))).filter((d) => monthOf(d.day) === month);
}

// ---------- Semanas flojas ----------

export type Scheduled = { publish_on: string | null; topic?: string; title?: string; channel?: Channel };

// Para cada semana del mes (desde hoy), cuántas piezas tiene y si queda corta respecto de la meta.
export function weekLoad(month: Month, pieces: Scheduled[], perWeek: number, today: Day) {
  return monthGrid(month).map((week) => {
    const days = week.filter((d) => d.inMonth).map((d) => d.day);
    const count = pieces.filter((p) => p.publish_on && days.includes(p.publish_on)).length;
    const remaining = days.filter((d) => d >= today).length;
    // La meta se prorratea si la semana está cortada por el mes o ya pasó en parte.
    const target = Math.ceil((perWeek * remaining) / 7);
    return { start: week[0].day, days, count, target, short: remaining > 0 && count < target };
  });
}

// ---------- Plan del mes ----------

export type PlanBrand = { name: string; products: string };
export type PlanOptions = { perWeek: number; channels: Channel[]; today: Day };
export type PlanItem = { publish_on: Day; channel: Channel; format: Format; goal: Goal; topic: string; reason: string };

const plain = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

// Días preferidos para publicar según cuántas piezas por semana (0 = lunes).
const PREFERRED: Record<number, number[]> = {
  1: [3],
  2: [1, 4],
  3: [1, 3, 5],
  4: [0, 2, 4, 5],
  5: [0, 1, 2, 3, 4],
  6: [0, 1, 2, 3, 4, 5],
  7: [0, 1, 2, 3, 4, 5, 6],
};

// Mezcla de objetivos para que no sea todo venta: más o menos 1 de cada 3 vende.
const MIX: Goal[] = ["Vender", "Educar", "Comunidad", "Conseguir consultas", "Vender", "Comunidad"];

// Formatos que se van alternando en cada red.
const FORMAT_ROTATION: readonly Format[] = ["Post", "Reel", "Carrusel", "Historia", "Mensaje"];

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const COMMUNITY = ["Cómo trabajamos en {marca}", "Un día en {marca}", "El equipo de {marca}"];

function topicFor(goal: Goal, product: string, brand: string, i: number) {
  const p = product.toLowerCase();
  switch (goal) {
    case "Vender": return `${cap(product)} en ${brand}`;
    case "Educar": return `Lo que tenés que saber sobre ${p}`;
    case "Comunidad": return COMMUNITY[Math.floor(i / 3) % COMMUNITY.length].replace("{marca}", brand);
    case "Conseguir consultas": return `Preguntas frecuentes sobre ${p}`;
    case "Promoción": return `Promo de ${p}`;
    case "Lanzamiento": return `Novedad: ${p}`;
  }
}

// Ideas para completar el mes: primero las fechas comerciales que vienen (unos días antes), después
// los días preferidos de cada semana hasta llegar a la meta. No toca días que ya tienen piezas ni días pasados,
// y saltea una fecha comercial si ya hay una pieza que habla de ella.
export function suggestPlan(brand: PlanBrand, month: Month, existing: Scheduled[], opts: PlanOptions): PlanItem[] {
  const perWeek = Math.min(7, Math.max(1, Math.round(opts.perWeek)));
  const channels = opts.channels.length ? opts.channels : (["Instagram"] as Channel[]);
  const taken = new Set(existing.map((p) => p.publish_on).filter(Boolean) as Day[]);
  const items: PlanItem[] = [];
  const products = brand.products.split(/[,;\n]+/).map((p) => p.trim()).filter(Boolean);
  const productAt = (i: number) => (products.length ? products[i % products.length] : brand.name);
  const perChannel = new Map<Channel, number>();
  // Cada red va rotando sus propios formatos.
  const pickFormat = (channel: Channel): Format => {
    const i = perChannel.get(channel) ?? 0;
    perChannel.set(channel, i + 1);
    const allowed: Format[] = formatsFor(channel).filter((f) => f !== "Anuncio");
    const preferred = FORMAT_ROTATION.filter((f) => allowed.includes(f));
    return preferred[i % preferred.length] ?? allowed[0];
  };
  const firstDay = `${month}-01`;
  const lastDay = `${month}-${pad(daysInMonth(month))}`;
  const start = opts.today > firstDay ? opts.today : firstDay;
  if (start > lastDay) return [];

  // 1. Fechas comerciales.
  const texts = existing.map((p) => plain(`${p.topic ?? ""} ${p.title ?? ""}`));
  for (const cd of datesInMonth(month)) {
    if (cd.day < opts.today) continue;
    if (texts.some((t) => cd.keywords.some((k) => t.includes(plain(k))))) continue;
    let day = addDays(cd.day, -cd.lead);
    if (day < start) day = start;
    while (taken.has(day) && day < cd.day) day = addDays(day, 1);
    if (taken.has(day)) continue;
    const channel = channels[items.length % channels.length];
    items.push({
      publish_on: day, channel, format: pickFormat(channel), goal: cd.goal,
      topic: cd.topic.replace("{marca}", brand.name),
      reason: cd.lead > 0 ? `${cd.name} (${shortDate(cd.day)}): conviene avisar unos días antes` : cd.name,
    });
    taken.add(day);
  }

  // 2. Completar cada semana hasta la meta, en los días preferidos y si no, en cualquier día libre.
  let n = 0;
  for (const w of weekLoad(month, [...existing, ...items], perWeek, opts.today)) {
    let missing = w.target - w.count;
    if (missing <= 0) continue;
    const free = w.days.filter((d) => d >= start && !taken.has(d));
    const ordered = [...free.filter((d) => PREFERRED[perWeek].includes(weekday(d))), ...free.filter((d) => !PREFERRED[perWeek].includes(weekday(d)))];
    for (const day of ordered) {
      if (missing <= 0) break;
      const goal = MIX[n % MIX.length];
      const channel = channels[items.length % channels.length];
      items.push({ publish_on: day, channel, format: pickFormat(channel), goal, topic: topicFor(goal, productAt(n), brand.name, n), reason: "Para no dejar la semana sin publicaciones" });
      taken.add(day);
      missing--;
      n++;
    }
  }
  return items.sort((a, b) => a.publish_on.localeCompare(b.publish_on));
}
