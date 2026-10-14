// Conexión oficial con Instagram: "Instagram API with Instagram Login" (Business Login for Instagram) de Meta.
// Sirve para cuentas profesionales (Empresa o Creador). Documentación:
// https://developers.facebook.com/documentation/instagram-platform/instagram-api-with-instagram-login/business-login
// Flujo: el navegador va a instagram.com/oauth/authorize; vuelve con un código; el servidor lo cambia por un token
// corto y después por uno largo (60 días), que se renueva antes de vencer. Nada de esto se simula: sin la app de
// Meta configurada, el panel lo dice y no deja conectar.

export const GRAPH_VERSION = process.env.INSTAGRAM_GRAPH_VERSION || "v25.0";
export const COOKIE = "ig_oauth"; // código de un solo uso y marca, mientras dura la conexión
export const SCOPES = ["instagram_business_basic", "instagram_business_content_publish"] as const;

export type IgConfig = { appId: string; appSecret: string; redirectUri: string };

export function igConfig(origin: string): IgConfig | null {
  const appId = process.env.INSTAGRAM_APP_ID;
  const appSecret = process.env.INSTAGRAM_APP_SECRET;
  if (!appId || !appSecret) return null;
  const base = (process.env.APP_URL || origin).replace(/\/$/, "");
  return { appId, appSecret, redirectUri: `${base}/api/redes/instagram/vuelta` };
}

export function authorizeUrl(cfg: IgConfig, state: string): string {
  const q = new URLSearchParams({ client_id: cfg.appId, redirect_uri: cfg.redirectUri, response_type: "code", scope: SCOPES.join(","), state });
  return `https://www.instagram.com/oauth/authorize?${q}`;
}

export class IgError extends Error {
  constructor(message: string, public expired = false) {
    super(message);
  }
}

type Fetch = typeof fetch;

async function json(res: Response): Promise<Record<string, unknown>> {
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok || body.error || body.error_type) {
    const err = (body.error ?? {}) as { message?: string; code?: number; type?: string };
    const msg = err.message || (body.error_message as string) || `Instagram respondió ${res.status}`;
    // 190: token vencido o revocado.
    throw new IgError(msg, err.code === 190 || (err.type === "OAuthException" && /expired|session/i.test(msg)));
  }
  return body;
}

// El código llega con "#_" al final en algunos navegadores: se saca.
export const cleanCode = (code: string) => code.replace(/#_$/, "");

export async function exchangeCode(cfg: IgConfig, code: string, f: Fetch = fetch): Promise<{ token: string; userId: string; permissions: string[] }> {
  const body = new URLSearchParams({ client_id: cfg.appId, client_secret: cfg.appSecret, grant_type: "authorization_code", redirect_uri: cfg.redirectUri, code: cleanCode(code) });
  const data = await json(await f("https://api.instagram.com/oauth/access_token", { method: "POST", body, signal: AbortSignal.timeout(15000) }));
  const row = (Array.isArray(data.data) ? data.data[0] : data) as { access_token?: string; user_id?: string | number; permissions?: string | string[] };
  if (!row.access_token) throw new IgError("Instagram no devolvió el token.");
  const permissions = Array.isArray(row.permissions) ? row.permissions : String(row.permissions ?? "").split(",").filter(Boolean);
  return { token: row.access_token, userId: String(row.user_id ?? ""), permissions };
}

export type LongToken = { token: string; expiresAt: string | null };

const expiry = (sec: unknown, now: number) => (typeof sec === "number" && sec > 0 ? new Date(now + sec * 1000).toISOString() : null);

export async function longLived(cfg: IgConfig, short: string, f: Fetch = fetch, now = Date.now()): Promise<LongToken> {
  const q = new URLSearchParams({ grant_type: "ig_exchange_token", client_secret: cfg.appSecret, access_token: short });
  const data = await json(await f(`https://graph.instagram.com/access_token?${q}`, { signal: AbortSignal.timeout(15000) }));
  if (typeof data.access_token !== "string") throw new IgError("Instagram no devolvió el token largo.");
  return { token: data.access_token, expiresAt: expiry(data.expires_in, now) };
}

// Renueva un token largo: tiene que tener más de 24 horas y no estar vencido. Suma otros 60 días.
export async function refresh(token: string, f: Fetch = fetch, now = Date.now()): Promise<LongToken> {
  const q = new URLSearchParams({ grant_type: "ig_refresh_token", access_token: token });
  const data = await json(await f(`https://graph.instagram.com/refresh_access_token?${q}`, { signal: AbortSignal.timeout(15000) }));
  if (typeof data.access_token !== "string") throw new IgError("Instagram no renovó el token.");
  return { token: data.access_token, expiresAt: expiry(data.expires_in, now) };
}

export type IgProfile = { user_id: string; username: string; name: string; account_type: string; profile_picture_url: string; followers_count: number | null; media_count: number | null };

export async function profile(token: string, f: Fetch = fetch): Promise<IgProfile> {
  const q = new URLSearchParams({ fields: "user_id,username,name,account_type,profile_picture_url,followers_count,media_count", access_token: token });
  const d = await json(await f(`https://graph.instagram.com/${GRAPH_VERSION}/me?${q}`, { signal: AbortSignal.timeout(15000) }));
  return {
    user_id: String(d.user_id ?? d.id ?? ""), username: String(d.username ?? ""), name: String(d.name ?? ""), account_type: String(d.account_type ?? ""),
    profile_picture_url: String(d.profile_picture_url ?? ""),
    followers_count: typeof d.followers_count === "number" ? d.followers_count : null,
    media_count: typeof d.media_count === "number" ? d.media_count : null,
  };
}

// ¿Conviene renovar? Si vence en menos de 15 días y ya pasó un día desde que se sacó.
export function shouldRefresh(expiresAt: string | null, issuedAt: string, now = Date.now()): boolean {
  if (!expiresAt) return false;
  const left = new Date(expiresAt).getTime() - now;
  return left > 0 && left < 15 * 86400000 && now - new Date(issuedAt).getTime() > 86400000;
}

export const accountTypeLabel = (t: string) => (t === "BUSINESS" || t === "Business" ? "Empresa" : t === "MEDIA_CREATOR" || t === "Media_Creator" || t === "CREATOR" ? "Creador" : t);
