import { NextResponse, type NextRequest } from "next/server";
import { validSignature } from "@/lib/mp-signature";
import { syncPreapproval } from "@/lib/billing-server";
import { mpConfigured } from "@/lib/mercadopago";

// Notificaciones de Mercado Pago. Solo se usa el id: el estado se vuelve a pedir a la API, así que
// una notificación falsa no puede activar nada. Si MP_WEBHOOK_SECRET está, además se exige la firma.
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as { type?: string; data?: { id?: string } };
  const sp = req.nextUrl.searchParams;
  const type = body.type ?? sp.get("type") ?? sp.get("topic") ?? "";
  const id = String(body.data?.id ?? sp.get("data.id") ?? sp.get("id") ?? "");
  if (!id || !type.includes("preapproval") || !mpConfigured()) return NextResponse.json({ ok: true });

  const secret = process.env.MP_WEBHOOK_SECRET;
  if (secret && !validSignature(secret, req.headers.get("x-signature"), req.headers.get("x-request-id"), sp.get("data.id") ?? id)) {
    return NextResponse.json({ error: "Firma inválida." }, { status: 401 });
  }
  try {
    await syncPreapproval(id);
  } catch (e) {
    console.warn("mercadopago: no se pudo aplicar la suscripción", id, e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "No se pudo procesar." }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
