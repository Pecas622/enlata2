"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { fmtDate } from "@/lib/dates";
import { fmtUSD } from "@/lib/money";

export type ClientRow = { id: string; name: string; phone: string; dni: string; compras: number; total_usd: number; ultima: string | null };

export function ClientTable({ rows }: { rows: ClientRow[] }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const needle = q.trim().toLowerCase();
  const shown = useMemo(() => rows.filter((c) => !needle || `${c.name} ${c.phone} ${c.dni}`.toLowerCase().includes(needle)), [rows, needle]);
  return (
    <div className="card">
      <input className="input" style={{ maxWidth: 320, marginBottom: 12 }} placeholder="Buscar por nombre, teléfono o DNI" value={q} onChange={(e) => setQ(e.target.value)} data-testid="cli-search" />
      {shown.length === 0 ? (
        <div className="empty">No hay clientes.</div>
      ) : (
        <div className="table-wrap">
          <table className="table" data-testid="cli-table">
            <thead><tr><th>Cliente</th><th>Teléfono</th><th>DNI</th><th>Compras</th><th>Última</th><th className="r">Total comprado</th></tr></thead>
            <tbody>
              {shown.map((c) => (
                <tr key={c.id} className="clickable" onClick={() => router.push(`/clientes/${c.id}`)} data-testid="cli-row">
                  <td><b>{c.name}</b></td>
                  <td>{c.phone || "-"}</td>
                  <td>{c.dni || "-"}</td>
                  <td>{c.compras}</td>
                  <td>{c.ultima ? fmtDate(c.ultima) : "-"}</td>
                  <td className="r">{fmtUSD(c.total_usd)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
