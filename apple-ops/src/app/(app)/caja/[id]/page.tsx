import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge, Notice } from "@/components/ui";
import { shiftHasDiff } from "@/lib/cash";
import { requireSection } from "@/lib/guard";
import { createClient } from "@/lib/supabase/server";
import { loadShiftReport } from "../data";
import { ShiftReport } from "../ShiftReport";

export default async function ShiftPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ cerrada?: string }> }) {
  const [{ id }, { cerrada }] = await Promise.all([params, searchParams]);
  await requireSection("caja");
  const supabase = await createClient();
  const report = await loadShiftReport(supabase, id);
  if (!report) notFound();
  const { shift } = report;
  return (
    <>
      <Link href="/caja" className="back">← Caja</Link>
      {cerrada && <div style={{ maxWidth: 560, marginBottom: 12 }}><Notice tone="blue">Caja cerrada.</Notice></div>}
      <div className="card" style={{ maxWidth: 560 }}>
        <div className="row" style={{ justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <h1 className="page-title" style={{ fontSize: 22, margin: 0 }} data-testid="page-title">Cierre {shift.number}</h1>
          {shiftHasDiff(shift) ? <Badge tone="red">Con diferencia</Badge> : <Badge tone="green">Cuadra</Badge>}
        </div>
        <ShiftReport {...report} />
        <div className="row" style={{ marginTop: 14 }}>
          <Link href={`/caja/${shift.id}/reporte`} target="_blank" className="btn btn-primary" data-testid="report-print">Imprimir</Link>
          {cerrada && <Link href="/caja" className="btn btn-secondary" data-testid="back-caja">Abrir otro turno</Link>}
        </div>
      </div>
    </>
  );
}
