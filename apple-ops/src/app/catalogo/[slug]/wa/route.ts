import { NextResponse, type NextRequest } from "next/server";
import { loadPublicConfig, waNumber } from "@/lib/public-catalog";
import { createClient } from "@/lib/supabase/server";
import { waLink } from "@/lib/whatsapp";

const UUID = /^[0-9a-f-]{36}$/i;

// Cuenta el toque en WhatsApp (para "Consultas" del panel) y redirige a wa.me.
export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const supabase = await createClient();
  const cfg = await loadPublicConfig(supabase, slug);
  const number = cfg ? waNumber(cfg) : "";
  if (!cfg || number.length < 8) return NextResponse.redirect(new URL(`/catalogo/${slug}`, req.url));
  const sp = req.nextUrl.searchParams;
  const item = sp.get("i");
  await supabase.rpc("registrar_consulta", { p_slug: slug, p_item: item && UUID.test(item) ? item : null, p_label: sp.get("l") ?? "" });
  return NextResponse.redirect(waLink(number, (sp.get("t") ?? "").slice(0, 1000)));
}
