import { loadEnvConfig } from "@next/env";
import { createClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";
import { login } from "./helpers";

loadEnvConfig(process.cwd());
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const WS = "00000000-0000-4000-8000-000000000001";
const ESPIGA = "00000000-0000-4000-8000-0000000000b1";
const pieces: string[] = [];

test.afterAll(async () => {
  await db.from("contents").delete().in("id", pieces);
});

async function piece(status: string, body: string) {
  const title = `Editar ${Date.now()}`;
  const { data, error } = await db.from("contents").insert({
    workspace_id: WS, brand_id: ESPIGA, channel: "Instagram", format: "Post", goal: "Vender", topic: title, title, body, hashtags: "#laespiga", status,
  }).select("id").single();
  if (error) throw error;
  pieces.push(data.id);
  return data.id as string;
}

// Sin ANTHROPIC_API_KEY en los tests: edita el camino por reglas, y lo que necesita la IA lo dice.
test("editar con IA: propone, se usa en el editor y al guardar queda en el historial", async ({ page }) => {
  const id = await piece("Aprobado", "¿Ya probaste las medialunas de La Espiga? ✨\n\nSalen del horno a la mañana.\n\n👉 Pedí por WhatsApp y retirá sin hacer fila.");
  await login(page, "creador");
  await page.goto(`/contenidos/${id}`);
  const panel = page.getByTestId("ai-edit");

  await panel.getByTestId("ai-edit-vendedor").click();
  await expect(panel.getByTestId("ai-edit-error")).toContainText("Esto lo hace la IA");

  await panel.getByTestId("ai-edit-sin-emojis").click();
  const proposal = panel.getByTestId("ai-edit-proposal");
  await expect(proposal.getByTestId("ai-edit-source")).toHaveText("Con reglas");
  await expect(proposal.getByTestId("ai-edit-text")).toContainText("¿Ya probaste las medialunas de La Espiga?");
  await expect(proposal.getByTestId("ai-edit-text")).not.toContainText("✨");
  await expect(proposal).toContainText("vuelve a borrador");
  // Descartar no toca el texto.
  await proposal.getByTestId("ai-edit-discard").click();
  await expect(page.getByTestId("content-body")).toHaveValue(/✨/);

  await panel.getByTestId("ai-edit-sin-emojis").click();
  await panel.getByTestId("ai-edit-apply").click();
  await expect(page.getByTestId("ai-edit-applied")).toBeVisible();
  await expect(page.getByTestId("content-body")).not.toHaveValue(/✨|👉/);
  await page.getByTestId("content-save").click();
  await expect(page.getByTestId("content-saved")).toBeVisible();
  await expect(page.getByTestId("history")).toContainText("Editada automáticamente (vuelve a borrador)");
  await expect(page.getByTestId("history")).toContainText("Sacar emojis");
  await expect(page.locator(".status-bar")).toContainText("Borrador");
});

test("editar con IA edita lo que está escrito en el editor, aunque no esté guardado", async ({ page }) => {
  const id = await piece("Borrador", "Medialunas.");
  await login(page, "creador");
  await page.goto(`/contenidos/${id}`);
  const body = page.getByTestId("content-body");
  await body.fill("Medialunas recién salidas.\nLas hacemos con masa madre. Sin premezclas.\n\nPedí por WhatsApp.");
  await page.getByTestId("ai-edit").getByTestId("ai-edit-corto").click();
  const text = page.getByTestId("ai-edit-text");
  await expect(text).toContainText("Medialunas recién salidas.\nLas hacemos con masa madre.\n\nPedí por WhatsApp.");
  await expect(text).not.toContainText("premezclas");
  await page.getByTestId("ai-edit-free").fill("nombrá los envíos a domicilio");
  await page.getByTestId("ai-edit-ask").click();
  await expect(page.getByTestId("ai-edit-error")).toContainText("Esto lo hace la IA");
});
