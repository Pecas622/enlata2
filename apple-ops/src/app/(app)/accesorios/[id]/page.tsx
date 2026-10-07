import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui";
import { stockTone } from "@/lib/accessories";
import { fmtDateTime } from "@/lib/dates";
import { requireSection } from "@/lib/guard";
import { fmtARS } from "@/lib/money";
import { createClient } from "@/lib/supabase/server";
import { AccForm } from "../AccForm";
import { loadAccessories } from "../data";
import { RestockForm } from "./RestockForm";

export default async function AccesorioPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { perms } = await requireSection("accesorios");
  const supabase = await createClient();
  const [[a], { data: moves }] = await Promise.all([
    loadAccessories(supabase, perms.seeCost, id),
    supabase.from("accessory_moves").select("id, qty, note, at, profiles(name)").eq("accessory_id", id).order("at", { ascending: false }).limit(50),
  ]);
  if (!a) notFound();
  return (
    <>
      <Link href="/accesorios" className="back">← Accesorios</Link>
      <div className="card" style={{ maxWidth: 680 }}>
        <h1 className="page-title" style={{ fontSize: 22 }} data-testid="page-title">{a.name}</h1>
        <div className="row" style={{ margin: "8px 0 14px" }}>
          <Badge tone={stockTone(a)}>{a.stock === 0 ? "Sin stock" : `${a.stock} en stock`}</Badge>
          <Badge>{a.category}</Badge>
          <Badge tone="gray">{a.sku}</Badge>
        </div>
        <div className="facts">
          <div><span>Precio: </span><b data-testid="acc-price-view">{fmtARS(a.price_ars)}</b></div>
          <div><span>Stock mínimo: </span>{a.min_stock}</div>
          {perms.seeCost && a.cost_ars != null && <div><span>Costo promedio: </span><span data-testid="acc-cost-view">{fmtARS(a.cost_ars)}</span></div>}
          {perms.seeCost && a.cost_ars != null && a.price_ars > 0 && (
            <div><span>Margen: </span>{fmtARS(a.price_ars - a.cost_ars)} ({Math.round(((a.price_ars - a.cost_ars) / a.price_ars) * 100)}%)</div>
          )}
          {a.supplier && <div><span>Proveedor: </span>{a.supplier}</div>}
        </div>
        {perms.editStock && (
          <>
            <h2 className="card-title" style={{ fontSize: 13 }}>Reponer stock</h2>
            <RestockForm id={a.id} cost={a.cost_ars} />
            <h2 className="card-title" style={{ fontSize: 13, marginTop: 18 }}>Editar</h2>
            <AccForm acc={{ ...a, cost_ars: a.cost_ars ?? "" }} seeCost={perms.seeCost} />
          </>
        )}
        <h2 className="card-title" style={{ fontSize: 13, marginTop: 18 }}>Movimientos</h2>
        <div className="history" data-testid="acc-moves">
          {(moves ?? []).length === 0 && <div>Sin movimientos.</div>}
          {(moves ?? []).map((m) => (
            <div key={m.id}>
              {fmtDateTime(m.at)} · <b style={{ color: m.qty > 0 ? "var(--success)" : "var(--amber)" }}>{m.qty > 0 ? `+${m.qty}` : m.qty}</b> · {m.note}{" "}
              <span style={{ opacity: 0.7 }}>({(m.profiles as unknown as { name: string } | null)?.name ?? "-"})</span>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
