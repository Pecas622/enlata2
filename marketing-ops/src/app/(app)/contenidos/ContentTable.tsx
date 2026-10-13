"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Badge } from "@/components/ui";
import { formatLabel } from "@/lib/channels";
import type { ContentRow } from "@/lib/data";
import { fmtDate } from "@/lib/dates";
import { STATUSES, statusTone, type Status } from "@/lib/workflow";

export function ContentTable({ rows, brands, initialStatus }: { rows: ContentRow[]; brands: { id: string; name: string }[]; initialStatus?: string }) {
  const router = useRouter();
  const [status, setStatus] = useState<Status | "Todas">(STATUSES.includes(initialStatus as Status) ? (initialStatus as Status) : "Todas");
  const [brand, setBrand] = useState("");
  const [q, setQ] = useState("");
  const byBrand = rows.filter((r) => !brand || r.brand_id === brand);
  const shown = byBrand.filter((r) => (status === "Todas" || r.status === status) && (!q || (r.title + " " + r.topic + " " + r.body).toLowerCase().includes(q.toLowerCase())));
  return (
    <>
      <div className="toolbar">
        <input className="input" style={{ maxWidth: 280 }} placeholder="Buscar por tema o texto" value={q} onChange={(e) => setQ(e.target.value)} data-testid="content-search" />
        <select className="input" style={{ maxWidth: 220 }} value={brand} onChange={(e) => setBrand(e.target.value)} data-testid="content-brand">
          <option value="">Todas las marcas</option>
          {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
      </div>
      <div className="pills">
        {(["Todas", ...STATUSES] as const).map((s) => (
          <button key={s} className={`pill${status === s ? " active" : ""}`} onClick={() => setStatus(s)} data-testid={`status-${s}`}>
            {s}<small>{s === "Todas" ? byBrand.length : byBrand.filter((r) => r.status === s).length}</small>
          </button>
        ))}
      </div>
      <div className="card table-wrap" style={{ padding: 0 }}>
        {shown.length === 0 ? (
          <div className="empty">No hay piezas con este filtro.</div>
        ) : (
          <table className="table">
            <thead>
              <tr><th>Pieza</th><th>Marca</th><th>Canal</th><th>Estado</th><th>Publicar</th><th>Actualizada</th></tr>
            </thead>
            <tbody>
              {shown.map((r) => (
                <tr key={r.id} className="clickable" onClick={() => router.push(`/contenidos/${r.id}`)} data-testid="content-row">
                  <td>
                    <b>{r.title || r.topic || "Sin título"}</b>
                    <div className="sub">{r.goal}{r.source === "ia" ? " · con IA" : r.source === "plantilla" ? " · con plantilla" : ""}{r.author ? ` · ${r.author.name}` : ""}</div>
                  </td>
                  <td><span className="dot" style={{ background: r.brands?.color, marginRight: 6 }} />{r.brands?.name}</td>
                  <td>{r.channel}<div className="sub">{formatLabel(r.format, r.channel)}</div></td>
                  <td><Badge tone={statusTone(r.status)}>{r.status}</Badge></td>
                  <td>{r.publish_on ? fmtDate(r.publish_on) : <span className="sub">Sin fecha</span>}</td>
                  <td className="sub">{fmtDate(r.updated_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
