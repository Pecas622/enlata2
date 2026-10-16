import type { Page } from "@playwright/test";

export const USERS = {
  admin: "santiago@demo.marketing-ops.test",
  creador: "lucia@demo.marketing-ops.test",
  revisor: "mati@demo.marketing-ops.test",
} as const;

export async function login(page: Page, who: keyof typeof USERS) {
  await page.goto("/login");
  await page.getByTestId("login-email").fill(USERS[who]);
  await page.getByTestId("login-password").fill("demo1234");
  await page.getByTestId("login-submit").click();
  await page.waitForURL("**/inicio");
}

export async function logout(page: Page) {
  await page.getByTestId("logout").click();
  await page.waitForURL("**/login");
}

// Ancho, alto (del primer track de video) y duración de un MP4, leyendo sus cajas mvhd y tkhd.
export function mp4Info(b: Uint8Array): { width: number; height: number; seconds: number } {
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const out = { width: 0, height: 0, seconds: 0 };
  const walk = (start: number, end: number) => {
    for (let p = start; p + 8 <= end; ) {
      const size = v.getUint32(p);
      const type = String.fromCharCode(b[p + 4], b[p + 5], b[p + 6], b[p + 7]);
      if (size < 8) return;
      if (["moov", "trak"].includes(type)) walk(p + 8, p + size);
      if (type === "mvhd") {
        const ver = b[p + 8];
        const scale = v.getUint32(p + (ver ? 28 : 20));
        const dur = ver ? Number(v.getBigUint64(p + 32)) : v.getUint32(p + 24);
        out.seconds = Math.round(dur / scale);
      }
      if (type === "tkhd" && !out.width) {
        const ver = b[p + 8];
        const base = p + (ver ? 96 : 84);
        out.width = v.getUint32(base) >> 16;
        out.height = v.getUint32(base + 4) >> 16;
      }
      p += size;
    }
  };
  walk(0, b.length);
  return out;
}
