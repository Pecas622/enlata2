import { NextResponse, type NextRequest } from "next/server";
import { canOpen, permsFor } from "@/lib/roles";
import { loadReportSales } from "@/lib/report-data";
import { periodFrom, salesCSVRows, toCSV } from "@/lib/reports";
import { getCurrentUser } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { periodOf } from "../period";

// Exporta las ventas del período. La ganancia solo va para quien ve costos.
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!canOpen(user.role, "reportes")) return new NextResponse("Sin permiso", { status: 403 });
  const supabase = await createClient();
  const sales = await loadReportSales(supabase, periodFrom(periodOf(req.nextUrl.searchParams.get("p") ?? undefined)));
  const csv = toCSV(salesCSVRows(sales, permsFor(user.role).seeCost));
  return new NextResponse("﻿" + csv, {
    headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": 'attachment; filename="ventas.csv"' },
  });
}
