import path from "node:path";
import { loadEnvConfig } from "@next/env";
import { createClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";
import { login, mp4Info } from "./helpers";

loadEnvConfig(process.cwd());
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const WS = "00000000-0000-4000-8000-000000000001";
const ESPIGA = "00000000-0000-4000-8000-0000000000b1";
const video = path.join(__dirname, "fixtures", "video.mp4");
const pieces: string[] = [];

test.afterAll(async () => {
  const { data: files } = await db.from("media_files").select("path").in("content_id", pieces);
  if (files?.length) await db.storage.from("media").remove(files.map((f) => f.path));
  await db.from("media_files").delete().in("content_id", pieces);
  await db.from("contents").delete().in("id", pieces);
});

// Sin ANTHROPIC_API_KEY: la edición sale de las reglas con el guion del Reel, y el video lo arma de verdad el motor
// de video en el navegador.
test("editar video: arma la edición con el guion, crea el video vertical y lo guarda en la pieza", async ({ page }) => {
  test.setTimeout(180_000);
  const title = `Video ${Date.now()}`;
  const { data, error } = await db.from("contents").insert({
    workspace_id: WS, brand_id: ESPIGA, channel: "Instagram", format: "Reel", goal: "Vender", topic: title, title, status: "Borrador",
    body: "0-3 s · Gancho: Medialunas recién salidas\n3-6 s · Mostrá el horno. Texto en pantalla: \"Con masa madre\"\n\nTexto del posteo: Pedí por WhatsApp.",
    cta: "Pedí por WhatsApp",
  }).select("id").single();
  if (error) throw error;
  pieces.push(data.id);

  await login(page, "creador");
  await page.goto(`/contenidos/${data.id}`);
  await expect(page.getByTestId("video-editor")).toHaveCount(0);
  await page.getByTestId("media-input").setInputFiles(video);
  await expect(page.getByTestId("media-panel").getByTestId("media-item")).toHaveCount(1);

  const editor = page.getByTestId("video-editor");
  await editor.getByTestId("video-analyze").click();
  const plan = editor.getByTestId("video-plan");
  await expect(plan.getByTestId("video-source")).toHaveText("Con reglas");
  await expect(plan.getByTestId("video-overlay")).toHaveCount(2);
  await expect(plan.getByTestId("video-overlay").first().locator("input")).toHaveValue("Medialunas recién salidas");
  await expect(plan.getByTestId("video-segments")).toContainText("0 s a 8 s");
  await plan.getByTestId("video-overlay").nth(1).locator("input").fill("Hecho con masa madre");

  await plan.getByTestId("video-build").click();
  const result = editor.getByTestId("video-result");
  await expect(result).toBeVisible({ timeout: 150_000 });
  await result.getByTestId("video-save").click();
  await expect(result.getByTestId("video-saved")).toBeVisible();
  await expect(page.getByTestId("media-panel").getByTestId("media-item")).toHaveCount(2);
  const { data: files } = await db.from("media_files").select("name, mime").eq("content_id", data.id).order("created_at");
  expect(files!.map((f) => f.mime)).toEqual(["video/mp4", "video/mp4"]);
  expect(files![1].name).toBe("video-editado.mp4");
  // El archivo guardado es vertical 720×1280 y dura lo que dice la edición (se lee del MP4, sin reproducirlo).
  const { data: saved } = await db.from("media_files").select("path").eq("content_id", data.id).eq("name", "video-editado.mp4").single();
  const { data: blob } = await db.storage.from("media").download(saved!.path);
  expect(mp4Info(new Uint8Array(await blob!.arrayBuffer()))).toEqual({ width: 720, height: 1280, seconds: 8 });

  await result.getByTestId("video-remove-original").click();
  await expect(page.getByTestId("media-panel").getByTestId("media-item")).toHaveCount(1);
});

test("editar video: sigue el pedido escrito y lo cambia sobre la edición que ya está", async ({ page }) => {
  test.setTimeout(90_000);
  const title = `Video pedido ${Date.now()}`;
  const { data, error } = await db.from("contents").insert({
    workspace_id: WS, brand_id: ESPIGA, channel: "Instagram", format: "Reel", goal: "Vender", topic: title, title, status: "Borrador",
    body: "Medialunas recién salidas.\n\nPedí por WhatsApp.", hook: "Medialunas recién salidas", cta: "Pedí por WhatsApp",
  }).select("id").single();
  if (error) throw error;
  pieces.push(data.id);

  await login(page, "creador");
  await page.goto(`/contenidos/${data.id}`);
  await page.getByTestId("media-input").setInputFiles(video);
  await expect(page.getByTestId("media-panel").getByTestId("media-item")).toHaveCount(1);

  const editor = page.getByTestId("video-editor");
  await editor.getByTestId("video-instruction").fill("que dure 5 segundos");
  await editor.getByTestId("video-analyze").click();
  const plan = editor.getByTestId("video-plan");
  await expect(plan.getByTestId("video-segments")).toHaveText("Tramos: 0 s a 5 s");
  await expect(plan.getByTestId("video-overlay")).toHaveCount(1);

  await editor.getByTestId("video-instruction").fill("arrancá en el segundo 2, que dure 4 segundos, sin textos");
  await expect(plan.getByTestId("video-reask")).toHaveText("Cambiar con este pedido");
  await plan.getByTestId("video-reask").click();
  await expect(plan.getByTestId("video-segments")).toHaveText("Tramos: 2 s a 6 s");
  await expect(plan.getByTestId("video-overlay")).toHaveCount(0);
  await expect(plan.getByTestId("video-summary")).toHaveText("Dejé 4 s desde el segundo 2, sin textos.");

  // Sin IA, lo que las reglas no entienden se avisa.
  await editor.getByTestId("video-instruction").fill("más dinámico, con el horno primero");
  await plan.getByTestId("video-reask").click();
  await expect(plan).toContainText("Sin IA, de tu pedido solo puedo aplicar");
});
