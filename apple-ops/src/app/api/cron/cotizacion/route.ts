import { NextResponse, type NextRequest } from "next/server";
import { refreshFx } from "@/lib/fx-server";

// Vercel Cron la llama todos los días aunque nadie entre a la app. Con CRON_SECRET configurado,
// Vercel manda ese secreto y cualquier otro pedido se rechaza.
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }
  return NextResponse.json(await refreshFx({ force: true }));
}
