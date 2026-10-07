import { notFound } from "next/navigation";
import { PrintButton } from "@/components/PrintButton";
import { fmtDateTime } from "@/lib/dates";
import { requireSection } from "@/lib/guard";
import { fmtARS, fmtCur, fmtUSD } from "@/lib/money";
import { loadStoreConfig } from "@/lib/store";
import { createClient } from "@/lib/supabase/server";
import { loadShiftReport } from "@/app/(app)/caja/data";

export default async function ReportePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireSection("caja");
  const supabase = await createClient();
  const [cfg, report] = await Promise.all([loadStoreConfig(supabase), loadShiftReport(supabase, id)]);
  if (!report) notFound();
  const { shift: s, salesCount, salesUSD } = report;
  return (
    <>
      <h1>{cfg.name}</h1>
      <div className="b" data-testid="report-number">Cierre de caja {s.number}</div>
      <div className="s">Apertura: {fmtDateTime(s.opened_at)} ({s.opener?.name ?? "-"})<br />Cierre: {fmtDateTime(s.closed_at)} ({s.closer?.name ?? "-"})</div>
      <hr />
      <table><tbody>{(s.breakdown ?? []).map((b) => <tr key={b.method}><td>{b.method}</td><td className="r">{fmtCur(b.net, b.cur)}</td></tr>)}</tbody></table>
      <hr />
      <table>
        <tbody>
          <tr><td>Efectivo ARS esperado</td><td className="r">{fmtARS(s.expected_ars)}</td></tr>
          <tr><td>Efectivo ARS contado</td><td className="r">{fmtARS(s.counted_ars)}</td></tr>
          <tr><td className="b">Diferencia ARS</td><td className="r b">{fmtARS(s.diff_ars)}</td></tr>
          <tr><td>Efectivo USD esperado</td><td className="r">{fmtUSD(s.expected_usd)}</td></tr>
          <tr><td>Efectivo USD contado</td><td className="r">{fmtUSD(s.counted_usd)}</td></tr>
          <tr><td className="b">Diferencia USD</td><td className="r b">{fmtUSD(s.diff_usd)}</td></tr>
          <tr><td>Ventas del turno</td><td className="r">{salesCount} · {fmtUSD(salesUSD)}</td></tr>
        </tbody>
      </table>
      {s.note && <><hr /><div className="s">Nota: {s.note}</div></>}
      <div className="s" style={{ marginTop: 28 }}>Firma: ______________</div>
      <PrintButton />
    </>
  );
}
