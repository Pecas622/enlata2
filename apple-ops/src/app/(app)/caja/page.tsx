import Link from "next/link";
import { Badge, Notice, PageHeader } from "@/components/ui";
import { nonCashTotal, shiftHasDiff } from "@/lib/cash";
import { fmtDate, fmtTime, localDay } from "@/lib/dates";
import { requireSection } from "@/lib/guard";
import { fmtARS, fmtCur, fmtUSD } from "@/lib/money";
import { createClient } from "@/lib/supabase/server";
import type { Currency } from "@/lib/catalog";
import { CloseForm } from "./CloseForm";
import { MoveForm } from "./MoveForm";
import { OpenForm } from "./OpenForm";
import { asShift, SHIFT_COLS, type Resumen } from "./data";

type Move = { id: string; at: string; type: "Ingreso" | "Egreso"; concept: string; method: string; currency: Currency; amount: number; by: { name: string } | null };

export default async function CajaPage() {
  await requireSection("caja");
  const supabase = await createClient();
  const [{ data: resumen, error }, { data: closed }] = await Promise.all([
    supabase.rpc("resumen_caja"),
    supabase.from("cash_shifts").select(SHIFT_COLS).eq("status", "Cerrada").order("closed_at", { ascending: false }).limit(12),
  ]);
  if (error) throw new Error(error.message);
  const shift = resumen as Resumen | null;
  const history = (closed ?? []).map(asShift);
  const { data: moveRows } = shift
    ? await supabase.from("cash_moves").select("id, at, type, concept, method, currency, amount, by:profiles!cash_moves_by_profile_fkey(name)").eq("shift_id", shift.id).order("at", { ascending: false })
    : { data: [] };
  const moves = (moveRows ?? []) as unknown as Move[];
  const last = history[0];

  return (
    <>
      <PageHeader
        title="Caja"
        subtitle="Apertura, movimientos y cierre con arqueo por turno"
      />
      {!shift ? (
        <OpenForm lastArs={last ? last.counted_ars : null} lastUsd={last ? last.counted_usd : null} />
      ) : (
        <>
          {localDay(shift.opened_at) < localDay() && (
            <div style={{ marginBottom: 14 }}><Notice tone="red">Esta caja se abrió el {fmtDate(shift.opened_at)}. Cerrala para empezar un turno nuevo.</Notice></div>
          )}
          <div className="row" style={{ alignItems: "flex-start", marginBottom: 16 }}>
            <MoveForm />
            <CloseForm number={shift.number} blind={shift.blind} expectedArs={shift.expected_ars} expectedUsd={shift.expected_usd} />
          </div>
          <div className="stats">
            <div className="stat good"><span>Turno {shift.number}</span><b data-testid="shift-number">Abierta</b><span>{shift.opened_by} · desde {fmtTime(shift.opened_at)}</span></div>
            {!shift.blind && <div className="stat"><span>Efectivo ARS en caja</span><b data-testid="expected-ars">{fmtARS(Number(shift.expected_ars))}</b></div>}
            {!shift.blind && <div className="stat"><span>Efectivo USD en caja</span><b data-testid="expected-usd">{fmtUSD(Number(shift.expected_usd))}</b></div>}
            <div className="stat"><span>Cobrado por transferencia / tarjeta / MP</span><b>{fmtARS(nonCashTotal(shift.breakdown))}</b></div>
          </div>
          {shift.blind && <div style={{ marginBottom: 14 }}><Notice>Arqueo ciego: tu rol no ve el efectivo esperado hasta cerrar el turno.</Notice></div>}
          <div className="card">
            <h2 className="card-title">Movimientos del turno</h2>
            {moves.length === 0 ? (
              <div className="empty">Todavía no hay movimientos.</div>
            ) : (
              <div className="table-wrap">
                <table className="table" data-testid="moves-table">
                  <thead><tr><th>Hora</th><th>Concepto</th><th>Medio</th><th>Tipo</th><th className="r">Monto</th><th>Por</th></tr></thead>
                  <tbody>
                    {moves.map((m) => (
                      <tr key={m.id}>
                        <td>{fmtTime(m.at)}</td>
                        <td>{m.concept}</td>
                        <td>{m.method}</td>
                        <td><Badge tone={m.type === "Ingreso" ? "green" : "red"}>{m.type}</Badge></td>
                        <td className="r" style={{ color: m.type === "Ingreso" ? "var(--success)" : "var(--red)", whiteSpace: "nowrap" }}>
                          {m.type === "Ingreso" ? "+" : "−"}{fmtCur(Number(m.amount), m.currency)}
                        </td>
                        <td>{m.by?.name ?? "-"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
      <div className="card" style={{ marginTop: 16 }}>
        <h2 className="card-title">Historial de cierres</h2>
        {history.length === 0 ? (
          <div className="empty">Todavía no hay cierres.</div>
        ) : (
          <div className="table-wrap">
            <table className="table" data-testid="shifts-table">
              <thead><tr><th>Turno</th><th>Fecha</th><th>Abrió</th><th>Cerró</th><th className="r">Dif. ARS</th><th className="r">Dif. USD</th><th>Estado</th></tr></thead>
              <tbody>
                {history.map((s) => (
                  <tr key={s.id} data-testid="shift-row">
                    <td><Link href={`/caja/${s.id}`} style={{ color: "var(--accent)", fontWeight: 600 }}>{s.number}</Link></td>
                    <td>{fmtDate(s.closed_at)}</td>
                    <td>{s.opener?.name ?? "-"}</td>
                    <td>{s.closer?.name ?? "-"}</td>
                    <td className="r" style={{ color: s.diff_ars ? "var(--red)" : "var(--success)" }}>{fmtARS(s.diff_ars)}</td>
                    <td className="r" style={{ color: s.diff_usd ? "var(--red)" : "var(--success)" }}>{fmtUSD(s.diff_usd)}</td>
                    <td>{shiftHasDiff(s) ? <Badge tone="red">Con diferencia</Badge> : <Badge tone="green">Cuadra</Badge>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
