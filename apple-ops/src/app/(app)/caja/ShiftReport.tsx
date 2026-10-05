import { Notice } from "@/components/ui";
import { fmtDateTime } from "@/lib/dates";
import { fmtARS, fmtCur, fmtUSD } from "@/lib/money";
import type { ClosedShift } from "./data";

const tone = (n: number) => ({ color: n === 0 ? "var(--success)" : "var(--red)" });

// Reporte de cierre: por medio de pago, arqueo de efectivo y ventas del turno.
export function ShiftReport({ shift, salesCount, salesUSD }: { shift: ClosedShift; salesCount: number; salesUSD: number }) {
  return (
    <div className="stack" data-testid="shift-report">
      <p className="muted" style={{ margin: 0 }}>
        Abrió {shift.opener?.name ?? "-"} {fmtDateTime(shift.opened_at)} · cerró {shift.closer?.name ?? "-"} {fmtDateTime(shift.closed_at)}
      </p>
      <div className="lines" style={{ background: "transparent", border: 0, padding: 0 }}>
        <div><b>Por medio de pago</b></div>
        {(shift.breakdown ?? []).map((b) => (
          <div key={b.method}>
            <span>{b.method} ({b.inc ? "+" + fmtCur(b.inc, b.cur) : "0"}{b.out ? " / −" + fmtCur(b.out, b.cur) : ""})</span>
            <span>{fmtCur(b.net, b.cur)}</span>
          </div>
        ))}
        <div style={{ marginTop: 10 }}><b>Arqueo de efectivo</b></div>
        <div><span>Apertura</span><span>{fmtARS(shift.opening_ars)} + {fmtUSD(shift.opening_usd)}</span></div>
        <div><span>ARS esperado / contado</span><span>{fmtARS(shift.expected_ars)} / {fmtARS(shift.counted_ars)}</span></div>
        <div><span>Diferencia ARS</span><span style={tone(shift.diff_ars)} data-testid="report-diff-ars">{fmtARS(shift.diff_ars)}</span></div>
        <div><span>USD esperado / contado</span><span>{fmtUSD(shift.expected_usd)} / {fmtUSD(shift.counted_usd)}</span></div>
        <div><span>Diferencia USD</span><span style={tone(shift.diff_usd)} data-testid="report-diff-usd">{fmtUSD(shift.diff_usd)}</span></div>
        <div className="total"><span>Ventas del turno</span><b data-testid="report-sales">{salesCount} · {fmtUSD(salesUSD)}</b></div>
      </div>
      {shift.note && <Notice>{shift.note}</Notice>}
    </div>
  );
}
