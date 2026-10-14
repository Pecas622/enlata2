import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { decrypt, encrypt, hasTokensKey } from "./crypto";
import { authorizeUrl, cleanCode, exchangeCode, IgError, longLived, profile, refresh, shouldRefresh, type IgConfig } from "./instagram";
import { checkFile, mediaPath, safeName } from "./media";

const KEY = randomBytes(32).toString("base64");
const cfg: IgConfig = { appId: "123", appSecret: "secreto", redirectUri: "https://app.test/api/redes/instagram/vuelta" };

function fakeFetch(routes: Record<string, unknown>, seen: string[] = []) {
  return (async (url: string | URL, init?: RequestInit) => {
    const u = String(url);
    seen.push(`${init?.method ?? "GET"} ${u}${init?.body ? ` ${init.body}` : ""}`);
    const key = Object.keys(routes).find((k) => u.includes(k));
    const body = key ? routes[key] : { error: { message: "no route" } };
    const status = (body as { error?: unknown }).error ? 400 : 200;
    return new Response(JSON.stringify(body), { status });
  }) as typeof fetch;
}

describe("tokens cifrados", () => {
  it("cifra y descifra; con otra clave o tocado, falla", () => {
    const box = encrypt("IGQVJ-token", KEY);
    expect(box).not.toContain("IGQVJ");
    expect(decrypt(box, KEY)).toBe("IGQVJ-token");
    expect(encrypt("IGQVJ-token", KEY)).not.toBe(box); // iv al azar
    expect(() => decrypt(box, randomBytes(32).toString("base64"))).toThrow();
    const [v, iv, tag, data] = box.split(".");
    expect(() => decrypt([v, iv, tag, data.slice(0, -2) + "AA"].join("."), KEY)).toThrow();
  });

  it("sin una clave de 32 bytes no hay cifrado", () => {
    expect(hasTokensKey(KEY)).toBe(true);
    expect(hasTokensKey("corta")).toBe(false);
    expect(hasTokensKey("")).toBe(false);
    expect(() => encrypt("x", "corta")).toThrow("TOKENS_KEY");
  });
});

describe("conexión con Instagram", () => {
  it("el link va al inicio de sesión oficial con los permisos de publicar y el código de un solo uso", () => {
    const u = new URL(authorizeUrl(cfg, "abc"));
    expect(u.origin + u.pathname).toBe("https://www.instagram.com/oauth/authorize");
    expect(Object.fromEntries(u.searchParams)).toEqual({
      client_id: "123", redirect_uri: cfg.redirectUri, response_type: "code", scope: "instagram_business_basic,instagram_business_content_publish", state: "abc",
    });
    expect(cleanCode("AQB123#_")).toBe("AQB123");
  });

  it("cambia el código por un token corto y después por uno largo de 60 días", async () => {
    const seen: string[] = [];
    const f = fakeFetch({
      "api.instagram.com/oauth/access_token": { data: [{ access_token: "corto", user_id: 999, permissions: "instagram_business_basic,instagram_business_content_publish" }] },
      "graph.instagram.com/access_token": { access_token: "largo", token_type: "bearer", expires_in: 5183944 },
    }, seen);
    const short = await exchangeCode(cfg, "AQB#_", f);
    expect(short).toEqual({ token: "corto", userId: "999", permissions: ["instagram_business_basic", "instagram_business_content_publish"] });
    expect(seen[0]).toContain("POST https://api.instagram.com/oauth/access_token");
    expect(seen[0]).toContain("grant_type=authorization_code");
    expect(seen[0]).toMatch(/&code=AQB$/);
    const long = await longLived(cfg, "corto", f, Date.UTC(2026, 9, 14));
    expect(long.token).toBe("largo");
    expect(long.expiresAt!.slice(0, 10)).toBe("2026-12-12"); // 5183944 s: casi 60 días
    expect(seen[1]).toContain("grant_type=ig_exchange_token");
  });

  it("lee la cuenta y avisa cuando el token venció", async () => {
    const f = fakeFetch({ "/me?": { user_id: "1784", username: "laespiga", account_type: "BUSINESS", followers_count: 1234, profile_picture_url: "https://x/p.jpg" } });
    expect(await profile("largo", f)).toMatchObject({ user_id: "1784", username: "laespiga", followers_count: 1234 });
    const dead = fakeFetch({ "/me?": { error: { message: "Error validating access token: Session has expired", type: "OAuthException", code: 190 } } });
    const err = await profile("viejo", dead).catch((e) => e);
    expect(err).toBeInstanceOf(IgError);
    expect(err.expired).toBe(true);
    const r = await refresh("largo", fakeFetch({ refresh_access_token: { access_token: "nuevo", expires_in: 5184000 } }));
    expect(r.token).toBe("nuevo");
  });

  it("renueva solo si vence en menos de 15 días y el token tiene más de un día", () => {
    const now = Date.UTC(2026, 9, 14);
    const days = (n: number) => new Date(now + n * 86400000).toISOString();
    expect(shouldRefresh(days(10), days(-50), now)).toBe(true);
    expect(shouldRefresh(days(40), days(-20), now)).toBe(false);
    expect(shouldRefresh(days(10), days(0), now)).toBe(false);
    expect(shouldRefresh(days(-1), days(-61), now)).toBe(false);
    expect(shouldRefresh(null, days(-61), now)).toBe(false);
  });
});

describe("archivos", () => {
  it("rutas seguras dentro de la carpeta del espacio y la marca", () => {
    expect(safeName("Foto Día de la Madre (1).JPG")).toBe("foto-dia-de-la-madre-1.jpg");
    expect(safeName("../../etc/passwd")).toBe("passwd");
    expect(safeName("..")).toBe("archivo");
    expect(mediaPath("ws", "b1", "Logo final.png", "id1")).toBe("ws/b1/id1-logo-final.png");
  });

  it("solo imágenes y videos de hasta 50 MB", () => {
    expect(checkFile({ type: "image/png", size: 1000 })).toBeNull();
    expect(checkFile({ type: "application/pdf", size: 1000 })).toContain("JPG");
    expect(checkFile({ type: "video/mp4", size: 60 * 1048576 })).toContain("50 MB");
  });
});
