import type { SupabaseClient } from "@supabase/supabase-js";
import type { BreakdownRow } from "@/lib/cash";

export type Resumen = {
  id: string; number: string; opened_at: string; opened_by: string; opening_ars: number; opening_usd: number;
  blind: boolean; expected_ars: number | null; expected_usd: number | null; breakdown: BreakdownRow[] | null;
};

export type ClosedShift = {
  id: string; number: string; opened_at: string; closed_at: string; opening_ars: number; opening_usd: number;
  expected_ars: number; expected_usd: number; counted_ars: number; counted_usd: number; diff_ars: number; diff_usd: number;
  note: string; breakdown: BreakdownRow[] | null; opener: { name: string } | null; closer: { name: string } | null;
};

export const SHIFT_COLS = `id, number, opened_at, closed_at, opening_ars, opening_usd, expected_ars, expected_usd, counted_ars, counted_usd,
  diff_ars, diff_usd, note, breakdown, opener:profiles!cash_shifts_opened_by_fkey(name), closer:profiles!cash_shifts_closed_by_fkey(name)`;

const NUMS = ["opening_ars", "opening_usd", "expected_ars", "expected_usd", "counted_ars", "counted_usd", "diff_ars", "diff_usd"] as const;

export function asShift(row: unknown): ClosedShift {
  const s = { ...(row as ClosedShift) };
  for (const k of NUMS) s[k] = Number(s[k]) || 0;
  return s;
}

// Turno cerrado con sus ventas, para el reporte. RLS decide quién lo ve: el Cajero, solo los suyos.
export async function loadShiftReport(supabase: SupabaseClient, id: string) {
  const [{ data: shift }, { data: sales }] = await Promise.all([
    supabase.from("cash_shifts").select(SHIFT_COLS).eq("id", id).eq("status", "Cerrada").maybeSingle(),
    supabase.from("sales").select("total_usd").eq("shift_id", id).eq("status", "Cerrada"),
  ]);
  if (!shift) return null;
  return { shift: asShift(shift), salesCount: sales?.length ?? 0, salesUSD: (sales ?? []).reduce((a, s) => a + Number(s.total_usd), 0) };
}
