"use client";

import { useRouter } from "next/navigation";

// Filtros por red y por estado: cada opción ya trae su link armado en el servidor.
export function CalFilters({ red, estado, hrefs }: { red: string | null; estado: string | null; hrefs: { red: Record<string, string>; estado: Record<string, string> } }) {
  const router = useRouter();
  return (
    <div className="row" style={{ gap: 8 }}>
      <select className="input input-sm" aria-label="Red" value={red ?? ""} onChange={(e) => router.push(hrefs.red[e.target.value])} data-testid="cal-filter-red">
        <option value="">Todas las redes</option>
        {Object.keys(hrefs.red).filter(Boolean).map((c) => <option key={c} value={c}>{c}</option>)}
      </select>
      <select className="input input-sm" aria-label="Estado" value={estado ?? ""} onChange={(e) => router.push(hrefs.estado[e.target.value])} data-testid="cal-filter-status">
        <option value="">Todos los estados</option>
        {Object.keys(hrefs.estado).filter(Boolean).map((s) => <option key={s} value={s}>{s}</option>)}
      </select>
    </div>
  );
}
