import { expect, test } from "@playwright/test";
import { login, logout } from "./helpers";

test("el Creador lee la investigación guardada y pasa una idea al calendario", async ({ page }) => {
  await login(page, "creador");
  await page.getByTestId("nav-investigar").click();
  await page.getByTestId("inv-brand").filter({ hasText: "La Espiga" }).click();
  await expect(page.getByTestId("inv-run")).toBeDisabled(); // sin clave de IA no se busca en internet
  await expect(page.getByTestId("inv-form")).toContainText("hace falta la clave de Anthropic");
  await expect(page.getByTestId("inv-summary")).toContainText("Día de la Madre");
  await expect(page.getByTestId("inv-competitor").first()).toContainText("El Molino");
  await expect(page.getByTestId("inv-trend").first().getByRole("link")).toHaveAttribute("href", /example\.com/);

  const idea = page.getByTestId("inv-idea").filter({ hasText: "Elegí el sabor del budín" });
  await idea.getByTestId("inv-idea-add").click();
  await expect(idea.getByTestId("inv-idea-added")).toBeVisible();
  await idea.getByRole("link", { name: "Escribir" }).click();
  await expect(page).toHaveURL(/\/generar\?idea=/);

  // "Escribir ahora" lleva al generador con la idea cargada.
  await page.goto("/investigar?marca=00000000-0000-4000-8000-0000000000b1");
  await page.getByTestId("inv-idea").filter({ hasText: "Cuánto dura el pan" }).getByRole("link", { name: "Escribir ahora" }).click();
  await expect(page.getByTestId("gen-topic")).toHaveValue("Cuánto dura el pan de masa madre y cómo guardarlo");
});

test("una marca sin investigaciones muestra ideas para arrancar; el Revisor no entra", async ({ page }) => {
  await login(page, "creador");
  await page.goto("/investigar");
  await page.getByTestId("inv-brand").filter({ hasText: "Rodar Bikes" }).click();
  await expect(page.getByTestId("inv-rules")).toContainText("no salen de buscar en internet");
  await expect(page.getByTestId("inv-rule-idea").first()).toBeVisible();

  await logout(page);
  await login(page, "revisor");
  await expect(page.getByTestId("nav-investigar")).toHaveCount(0);
  await page.goto("/investigar");
  await expect(page).toHaveURL(/\/inicio/);
});
