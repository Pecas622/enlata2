import path from "node:path";
import { loadEnvConfig } from "@next/env";
import { createClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";
import { encrypt } from "../../src/lib/crypto";
import { E2E_TOKENS_KEY, IG_PORT } from "./env";
import { login } from "./helpers";

loadEnvConfig(process.cwd());
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const WS = "00000000-0000-4000-8000-000000000001";
const RODAR = "00000000-0000-4000-8000-0000000000b2";
const foto = path.join(__dirname, "fixtures", "foto.jpg");
const pieces: string[] = [];

// Rodar Bikes con su Instagram conectado (el token se cifra con la misma clave que usa la app en los tests).
test.beforeAll(async () => {
  await db.from("social_accounts").delete().eq("brand_id", RODAR);
  const { error } = await db.from("social_accounts").insert({
    workspace_id: WS, brand_id: RODAR, platform: "Instagram", external_id: "e2e-1784", username: "rodarbikes",
    token_enc: encrypt("token-e2e", E2E_TOKENS_KEY), token_expires_at: new Date(Date.now() + 50 * 86400000).toISOString(),
  });
  if (error) throw error;
});

test.afterAll(async () => {
  const { data: files } = await db.from("media_files").select("path").in("content_id", pieces);
  if (files?.length) await db.storage.from("media").remove(files.map((f) => f.path));
  await db.from("media_files").delete().in("content_id", pieces);
  await db.from("contents").delete().in("id", pieces);
  await db.from("social_accounts").delete().eq("brand_id", RODAR);
});

async function approvedPiece(title: string) {
  const { data, error } = await db.from("contents").insert({
    workspace_id: WS, brand_id: RODAR, channel: "Instagram", format: "Post", goal: "Vender", topic: title, title,
    body: "Service completo en 48 horas. Sacá turno por WhatsApp.", hashtags: "#rodarbikes", status: "Aprobado",
  }).select("id").single();
  if (error) throw error;
  pieces.push(data.id);
  return data.id as string;
}

const pedidos = async () => (await (await fetch(`http://localhost:${IG_PORT}/__pedidos`)).json()) as { method: string; path: string; body: Record<string, string> }[];

test("publicar ahora: sube la foto, sale en Instagram y la pieza queda publicada", async ({ page }) => {
  const id = await approvedPiece(`Publicar ya ${Date.now()}`);
  await login(page, "creador");
  await page.goto(`/contenidos/${id}`);
  const panel = page.getByTestId("publish-panel");
  await expect(panel.getByTestId("publish-blocker")).toContainText("Subí las fotos");
  await page.getByTestId("media-input").setInputFiles(foto);
  await expect(page.getByTestId("media-panel").getByTestId("media-item")).toHaveCount(1);
  await panel.getByTestId("publish-now").click();
  await expect(panel.getByTestId("publish-status")).toHaveText("Publicada");
  await expect(panel.getByTestId("publish-link")).toHaveAttribute("href", "https://www.instagram.com/p/E2E123/");
  await expect(page.locator(".status-bar")).toContainText("Publicado");
  await expect(page.getByTestId("history")).toContainText("Publicó en Instagram");

  const sent = await pedidos();
  const create = sent.find((p) => p.method === "POST" && p.path.endsWith("/e2e-1784/media"));
  expect(create?.body.access_token).toBe("token-e2e");
  expect(create?.body.caption).toBe("Service completo en 48 horas. Sacá turno por WhatsApp.\n\n#rodarbikes");
  expect(create?.body.image_url).toContain("/storage/v1/object/sign/media/");
  expect(sent.some((p) => p.path.endsWith("/e2e-1784/media_publish"))).toBe(true);
});

test("programar: queda programada y el cron la publica cuando toca", async ({ page, request }) => {
  const id = await approvedPiece(`Programar ${Date.now()}`);
  await login(page, "creador");
  await page.goto(`/contenidos/${id}`);
  await page.getByTestId("media-input").setInputFiles(foto);
  await expect(page.getByTestId("media-panel").getByTestId("media-item")).toHaveCount(1);
  const panel = page.getByTestId("publish-panel");
  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  await panel.getByTestId("publish-day").fill(tomorrow);
  await panel.getByTestId("publish-time").fill("10:30");
  await panel.getByTestId("publish-schedule").click();
  await expect(panel.getByTestId("publish-status")).toHaveText("Programada");
  await expect(panel.getByTestId("publish-when")).toContainText("10:30");
  await expect(page.locator(".status-bar")).toContainText("Aprobado");

  expect((await request.get("/api/cron/publicar")).status()).toBe(401);
  // Hacemos que ya toque y corre el cron.
  await db.from("publications").update({ scheduled_at: new Date(Date.now() - 60000).toISOString() }).eq("content_id", id);
  const run = await request.get("/api/cron/publicar", { headers: { authorization: "Bearer e2e-cron" } });
  expect(await run.json()).toMatchObject({ published: 1, errors: 0 });
  await page.reload();
  await expect(panel.getByTestId("publish-status")).toHaveText("Publicada");
  await expect(page.locator(".status-bar")).toContainText("Publicado");
});
