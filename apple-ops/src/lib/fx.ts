// Cotización automática del dólar. Se consulta del lado del servidor a DolarAPI (precio de venta)
// y se le suma el ajuste en pesos del local. Si la consulta falla, queda la última cotización.

export const FX_SOURCES = ["manual", "oficial", "blue", "bolsa"] as const;
export type FxSource = (typeof FX_SOURCES)[number];
export const FX_SOURCE_LABEL: Record<FxSource, string> = { manual: "Manual", oficial: "Dólar oficial", blue: "Dólar blue", bolsa: "Dólar MEP" };

// Cada cuánto se vuelve a consultar mientras alguien usa la app o mira el catálogo.
export const FX_MAX_AGE_MS = 30 * 60_000;
export const FX_TIMEOUT_MS = 4000;

export const fxUrl = (source: Exclude<FxSource, "manual">) => `https://dolarapi.com/v1/dolares/${source}`;

// Cotización final en pesos enteros: venta + ajuste, nunca menor a 1.
export function fxFromQuote(venta: number, extra = 0) {
  return Math.max(1, Math.round(venta + (Number(extra) || 0)));
}

export function isStale(updatedAt: string | null, now = Date.now()) {
  return !updatedAt || now - Date.parse(updatedAt) > FX_MAX_AGE_MS;
}

// Precio de venta de una fuente, o null si la respuesta no sirve.
export async function fetchVenta(source: Exclude<FxSource, "manual">, fetcher: typeof fetch = fetch): Promise<number | null> {
  try {
    const res = await fetcher(fxUrl(source), { signal: AbortSignal.timeout(FX_TIMEOUT_MS), cache: "no-store" });
    if (!res.ok) return null;
    const j = (await res.json()) as { venta?: unknown };
    const venta = Number(j.venta);
    return Number.isFinite(venta) && venta > 0 ? venta : null;
  } catch {
    return null;
  }
}
