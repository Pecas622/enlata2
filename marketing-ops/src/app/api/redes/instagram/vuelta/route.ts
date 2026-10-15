import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { encrypt } from "@/lib/crypto";
import { COOKIE, exchangeCode, IgError, igConfig, longLived, profile } from "@/lib/instagram";
import { getCurrentUser } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";

const same = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

// Vuelta del inicio de sesión de Instagram: valida el código de un solo uso, cambia el código por un token largo,
// lee la cuenta y la guarda conectada a la marca, con el token cifrado.
export async function GET(req: NextRequest) {
  const origin = req.nextUrl.origin;
  const p = req.nextUrl.searchParams;
  const saved = req.cookies.get(COOKIE)?.value ?? "";
  const [state, brandId] = saved.split(".");
  const done = (q: string) => {
    const res = NextResponse.redirect(`${origin}/redes?${q}`);
    res.cookies.delete({ name: COOKIE, path: "/api/redes" });
    return res;
  };
  const fail = (msg: string) => done(`error=${encodeURIComponent(msg)}`);

  const user = await getCurrentUser();
  if (user.role !== "Administrador") return fail("Solo el Administrador conecta redes.");
  if (p.get("error")) return fail(p.get("error_reason") === "user_denied" ? "Cancelaste la conexión en Instagram." : "Instagram no autorizó la conexión.");
  if (!state || !brandId || !same(state, p.get("state") ?? "")) return fail("La conexión venció o no salió de acá. Probá de nuevo.");
  const cfg = igConfig(origin);
  const code = p.get("code");
  if (!cfg || !code) return fail("Falta configurar la app de Meta en el servidor.");

  try {
    const short = await exchangeCode(cfg, code);
    const long = await longLived(cfg, short.token);
    const me = await profile(long.token);
    const supabase = await createClient();
    const { error } = await supabase.rpc("connect_social", {
      p_brand_id: brandId,
      p: {
        platform: "Instagram", external_id: me.user_id || short.userId, username: me.username, name: me.name, picture_url: me.profile_picture_url,
        account_type: me.account_type, followers: me.followers_count ?? "", token_enc: encrypt(long.token), token_expires_at: long.expiresAt ?? "",
      },
    });
    if (error) return fail(error.message);
    return done(`conectada=Instagram&marca=${brandId}`);
  } catch (e) {
    console.error("Conexión con Instagram:", e instanceof Error ? e.message : e);
    return fail(e instanceof IgError ? `Instagram respondió: ${e.message}` : "No se pudo hablar con Instagram. Probá de nuevo en un rato.");
  }
}
