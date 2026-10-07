import { expect, test } from "@playwright/test";
import { login } from "./helpers";

// Sin ANTHROPIC_API_KEY responde el motor de reglas: mismas herramientas, sin inventar precios.
test("el asistente muestra stock, cotiza el canje y deriva a WhatsApp", async ({ page }) => {
  await page.goto("/catalogo/demo");
  await page.getByTestId("chat-open").click();
  const panel = page.getByTestId("chat-panel");
  await expect(panel.getByTestId("chat-bot-msg").first()).toContainText("Soy el asistente de Tu Local Apple");

  await panel.getByTestId("chat-chip").filter({ hasText: "Ver iPhone disponibles" }).click();
  await expect(panel.getByTestId("chat-card").first()).toBeVisible();
  const first = await panel.getByTestId("chat-card").first().locator(".pc-chat-card-name").innerText();
  await panel.getByTestId("chat-card").first().getByRole("button", { name: "Ver" }).click();
  await expect(page.getByTestId("cat-sheet")).toContainText(first);
  await page.getByRole("button", { name: "Cerrar", exact: true }).click();

  await page.getByTestId("chat-open").click();
  const say = async (text: string) => {
    const n = await panel.getByTestId("chat-user-msg").count();
    await panel.getByTestId("chat-input").fill(text);
    await panel.getByTestId("chat-send").click();
    await expect(panel.getByTestId("chat-user-msg")).toHaveCount(n + 1);
    await expect(panel.getByTestId("chat-typing")).toHaveCount(0);
    return panel.getByTestId("chat-bot-msg").last();
  };
  await expect(await say("quiero cotizar mi iphone 13")).toContainText("¿Qué capacidad tiene tu iPhone 13?");
  await expect(await say("128")).toContainText("¿Cómo está el equipo?");
  await expect(await say("1")).toContainText("porcentaje de batería");
  const quote = await say("no sé");
  await expect(quote).toContainText("orientativamente, entre US$ 335 y US$ 370");
  await expect(quote).toContainText("se confirma revisando el equipo en el local");

  await say("quiero hablar con un asesor");
  await expect(panel.getByTestId("chat-handoff")).toHaveAttribute("href", /^\/catalogo\/demo\/wa\?.*iPhone\+13\+128GB/);
  await expect(panel).toContainText("Precios y tasaciones son orientativos");
  const body = await page.locator("body").innerText();
  for (const banned of ["IMEI", "Costo", "costo", "Margen"]) expect(body).not.toContain(banned);
});

test("el panel lista las conversaciones y configura el asistente", async ({ page, browser }) => {
  // Una conversación nueva desde otra pestaña sin sesión.
  const visitor = await browser.newPage();
  await visitor.goto("/catalogo/demo");
  await visitor.getByTestId("chat-open").click();
  await visitor.getByTestId("chat-chip").filter({ hasText: "Ver iPhone disponibles" }).click();
  await expect(visitor.getByTestId("chat-card").first()).toBeVisible();
  await visitor.getByTestId("chat-input").fill("tienen vidrio templado para el 13?");
  await visitor.getByTestId("chat-send").click();
  await expect(visitor.getByTestId("chat-bot-msg").last()).toContainText("Vidrio");

  await login(page, "Lucía");
  await page.goto("/catalogo");
  await expect(page.getByTestId("assist-engine")).toContainText("motor automático");
  const row = page.getByTestId("cat-chat-row").filter({ hasText: "tienen vidrio templado para el 13?" });
  await expect(row).toContainText("Equipos");
  await row.locator("summary").click();
  await expect(row.locator(".chat-log")).toContainText("Cliente: tienen vidrio templado");
  await expect(row.locator(".chat-log")).toContainText("[Equipos mostrados: iPhone");

  await page.getByTestId("assist-name").fill("Sofi");
  await page.getByTestId("assist-greeting").fill("¡Hola! Soy Sofi, ¿qué estás buscando?");
  await page.getByTestId("assist-save").click();
  await expect(page.getByTestId("assist-saved")).toBeVisible();
  await visitor.goto("/catalogo/demo");
  await visitor.getByTestId("chat-open").click();
  await expect(visitor.getByTestId("chat-panel")).toContainText("Sofi");
  await expect(visitor.getByTestId("chat-bot-msg").first()).toHaveText("¡Hola! Soy Sofi, ¿qué estás buscando?");

  await page.getByTestId("assist-on").uncheck();
  await page.getByTestId("assist-name").fill("Asistente");
  await page.getByTestId("assist-greeting").fill("");
  await page.getByTestId("assist-save").click();
  await expect(page.getByTestId("assist-saved")).toBeVisible();
  await visitor.goto("/catalogo/demo");
  await expect(visitor.getByTestId("public-catalog")).toBeVisible();
  await expect(visitor.getByTestId("chat-open")).toHaveCount(0);

  await page.getByTestId("assist-on").check();
  await page.getByTestId("assist-save").click();
  await expect(page.getByTestId("assist-saved")).toBeVisible();
});
