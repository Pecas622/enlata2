"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Badge } from "@/components/ui";
import { stockTone } from "@/lib/accessories";
import { ACC_CATEGORIES } from "@/lib/catalog";
import { fmtARS } from "@/lib/money";

export type AccRow = { id: string; sku: string; name: string; category: string; price_ars: number; stock: number; min_stock: number; cost_ars: number | null };

export function AccTable({ rows, seeCost }: { rows: AccRow[]; seeCost: boolean }) {
  const router = useRouter();
  const [cat, setCat] = useState("Todas");
  const [q, setQ] = useState("");
  const needle = q.trim().toLowerCase();
  const shown = useMemo(
    () => rows.filter((a) => (cat === "Todas" || a.category === cat) && (!needle || `${a.name} ${a.sku}`.toLowerCase().includes(needle))),
    [rows, cat, needle],
  );
  const counts = Object.fromEntries(["Todas", ...ACC_CATEGORIES].map((c) => [c, rows.filter((a) => c === "Todas" || a.category === c).length]));
  return (
    <div className="card">
      <div className="toolbar">
        <input className="input" style={{ maxWidth: 280 }} placeholder="Buscar accesorio o SKU" value={q} onChange={(e) => setQ(e.target.value)} data-testid="acc-search" />
      </div>
      <div className="pills">
        {["Todas", ...ACC_CATEGORIES].map((c) => (
          <button key={c} className={`pill${cat === c ? " active" : ""}`} onClick={() => setCat(c)} data-testid={`cat-${c}`}>{c}<small>{counts[c]}</small></button>
        ))}
      </div>
      {shown.length === 0 ? (
        <div className="empty">No hay accesorios con ese filtro.</div>
      ) : (
        <div className="table-wrap">
          <table className="table" data-testid="acc-table">
            <thead>
              <tr><th>SKU</th><th>Accesorio</th><th>Categoría</th><th>Stock</th><th>Mín.</th>{seeCost && <th className="r">Costo</th>}<th className="r">Precio</th></tr>
            </thead>
            <tbody>
              {shown.map((a) => (
                <tr key={a.id} className="clickable" onClick={() => router.push(`/accesorios/${a.id}`)} data-testid="acc-row">
                  <td className="sub">{a.sku}</td>
                  <td><b>{a.name}</b></td>
                  <td>{a.category}</td>
                  <td><Badge tone={stockTone(a)}>{a.stock}</Badge></td>
                  <td>{a.min_stock}</td>
                  {seeCost && <td className="r">{a.cost_ars != null ? fmtARS(a.cost_ars) : "-"}</td>}
                  <td className="r"><b>{fmtARS(a.price_ars)}</b></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
