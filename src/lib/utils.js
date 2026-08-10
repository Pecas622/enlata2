export function uid() {
  return Math.random().toString(36).slice(2, 10);
}

export function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

export function addDays(dateStr, days) {
  const d = new Date(dateStr + "T00:00:00");
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export function daysBetween(a, b) {
  return Math.round((new Date(b + "T00:00:00") - new Date(a + "T00:00:00")) / 86400000);
}

// USD, formatted via Intl currency (used by INMO OPS-style money values)
export function fmtUSD(n) {
  const num = Number(n) || 0;
  return num.toLocaleString("es-AR", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

// ARS, manual "$" prefix (used by Cobros / Checkout)
export function fmtARS(n) {
  const num = Number(n) || 0;
  return "$" + num.toLocaleString("es-AR", { maximumFractionDigits: 0 });
}

export function fmtDate(d) {
  if (!d) return "-";
  try {
    return new Date(d + "T00:00:00").toLocaleDateString("es-AR", { day: "2-digit", month: "short", year: "numeric" });
  } catch {
    return d;
  }
}
