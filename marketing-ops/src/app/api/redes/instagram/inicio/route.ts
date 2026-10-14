import { randomBytes } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { hasTokensKey } from "@/lib/crypto";
import { authorizeUrl, COOKIE, igConfig } from "@/lib/instagram";
import { getCurrentUser } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";



// Arranca la conexión con Instagram para una marca: guarda un código de un solo uso en una cookie y manda al
// inicio de sesión oficial de Instagram.
export async function GET(req: NextRequest) {
  const origin = req.nextUrl.origin;
  const back = (error: string) => NextResponse.redirect(`${origin}/redes?error=${encodeURIComponent(error)}`);
  const user = await getCurrentUser();
  if (user.role !== "Administrador") return back("Solo el Administrador conecta redes.");
  const cfg = igConfig(origin);
  if (!cfg || !hasTokensKey()) return back("Falta configurar la app de Meta en el servidor.");
  const brandId = req.nextUrl.searchParams.get("marca") ?? "";
  const supabase = await createClient();
  const { data: brand } = await supabase.from("brands").select("id").eq("id", brandId).maybeSingle();
  if (!brand) return back("Elegí una marca.");
  const state = randomBytes(24).toString("hex");
  const res = NextResponse.redirect(authorizeUrl(cfg, state));
  res.cookies.set(COOKIE, `${state}.${brand.id}`, { httpOnly: true, secure: origin.startsWith("https"), sameSite: "lax", maxAge: 600, path: "/api/redes" });
  return res;
}
