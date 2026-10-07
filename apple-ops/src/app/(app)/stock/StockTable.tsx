"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Badge, statusTone } from "@/components/ui";
import { DEVICE_STATUSES, KINDS, deviceTitle } from "@/lib/catalog";
import { daysSince } from "@/lib/dates";
import type { DeviceRow } from "@/lib/devices";
import { fmtUSD } from "@/lib/money";

function downloadCSV(filename: string, rows: Record<string, string | number>[]) {
  if (!rows.length) return;
  const headers = Object.keys(rows[0]);
  const csv = [headers.join(","), ...rows.map((r) => headers.map((h) => `"${String(r[h] ?? "").replace(/"/g, '""')}"`).join(","))].join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function StockTable({ rows, seeCost, showImei = true }: { rows: DeviceRow[]; seeCost: boolean; showImei?: boolean }) {
  const router = useRouter();
  const [kind, setKind] = useState("Todos");
  const [status, setStatus] = useState("Disponible");
  const [q, setQ] = useState("");

  const byStatus = useMemo(() => rows.filter((d) => status === "Todos" || d.status === status), [rows, status]);
  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return byStatus.filter((d) => (kind === "Todos" || d.kind === kind) && (!needle || `${deviceTitle(d)} ${d.imei} ${d.condition}`.toLowerCase().includes(needle)));
  }, [byStatus, kind, q]);
  const counts = Object.fromEntries(["Todos", ...KINDS].map((k) => [k, byStatus.filter((d) => k === "Todos" || d.kind === k).length]));

  return (
    <div className="card">
      <div className="toolbar">
        <input className="input" style={{ maxWidth: 300 }} placeholder={showImei ? "Buscar modelo, IMEI, condición..." : "Buscar modelo o condición..."} value={q} onChange={(e) => setQ(e.target.value)} data-testid="stock-search" />
        <select className="input" style={{ maxWidth: 170 }} value={status} onChange={(e) => setStatus(e.target.value)} data-testid="stock-status">
          {["Todos", ...DEVICE_STATUSES].map((s) => <option key={s}>{s}</option>)}
        </select>
        {seeCost && (
          <button
            className="btn btn-secondary"
            style={{ marginLeft: "auto" }}
            onClick={() => downloadCSV("stock-equipos.csv", shown.map((d) => ({ Equipo: deviceTitle(d), Condicion: d.condition, ...(showImei ? { IMEI: d.imei } : {}), Costo: d.cost_usd ?? "", Precio: d.price_usd, Estado: d.status, Ingreso: d.entry_date })))}
          >
            Exportar CSV
          </button>
        )}
      </div>
      <div className="pills">
        {["Todos", ...KINDS].map((k) => (
          <button key={k} className={`pill${kind === k ? " active" : ""}`} onClick={() => setKind(k)} data-testid={`kind-${k}`}>
            {k}<small>{counts[k]}</small>
          </button>
        ))}
      </div>
      {shown.length === 0 ? (
        <div className="empty">No hay equipos con ese filtro.</div>
      ) : (
        <div className="table-wrap">
          <table className="table" data-testid="stock-table">
            <thead>
              <tr>
                <th>Equipo</th>{showImei && <th>IMEI / serie</th>}<th>Batería</th><th>Origen</th><th>Días</th>
                {seeCost && <th className="r">Costo</th>}
                <th className="r">Precio</th><th>Estado</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((d) => {
                const days = daysSince(d.entry_date);
                return (
                  <tr key={d.id} className="clickable" onClick={() => router.push(`/stock/${d.id}`)} data-testid="stock-row">
                    <td><b>{deviceTitle(d)}</b><div className="sub">{d.condition}</div></td>
                    {showImei && <td className="sub">{d.imei || "-"}</td>}
                    <td>{d.condition === "Nuevo sellado" || !d.battery ? "-" : `${d.battery}%`}</td>
                    <td><Badge tone={d.origin === "Canje" ? "green" : "gray"}>{d.origin}</Badge></td>
                    <td style={{ color: d.status === "Disponible" && days > 45 ? "var(--amber)" : undefined }}>{d.status === "Disponible" ? days : "-"}</td>
                    {seeCost && <td className="r">{d.cost_usd != null ? fmtUSD(d.cost_usd) : "-"}</td>}
                    <td className="r"><b>{fmtUSD(d.price_usd)}</b></td>
                    <td><Badge tone={statusTone(d.status)}>{d.status}</Badge></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
