// Fechas siempre en el día local de Argentina, nunca UTC pelado.
export const TZ = "America/Argentina/Mendoza";

const dayFmt = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" });

// "YYYY-MM-DD" del día local para un instante.
export function localDay(d: Date | string = new Date()) {
  return dayFmt.format(typeof d === "string" ? new Date(d) : d);
}

function asDay(v: string) {
  return v.length <= 10 ? v : localDay(v);
}

export function daysSince(day: string, today = localDay()) {
  const a = Date.parse(asDay(day) + "T12:00:00Z");
  const b = Date.parse(today + "T12:00:00Z");
  return Math.round((b - a) / 86_400_000);
}

export function fmtDate(v: string | null | undefined) {
  if (!v) return "-";
  return new Date(asDay(v) + "T12:00:00Z").toLocaleDateString("es-AR", { timeZone: "UTC", day: "2-digit", month: "short", year: "numeric" });
}

export function fmtDateTime(v: string | null | undefined) {
  if (!v) return "-";
  const time = new Date(v).toLocaleTimeString("es-AR", { timeZone: TZ, hour: "2-digit", minute: "2-digit" });
  return `${fmtDate(v)} ${time}`;
}
