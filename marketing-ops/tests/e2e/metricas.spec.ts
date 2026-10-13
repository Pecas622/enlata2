import { expect, test } from "@playwright/test";
import { login } from "./helpers";

test("el Creador ve qué funcionó y carga los resultados de una pieza publicada", async ({ page }) => {
  await login(page, "creador");
  await page.getByTestId("nav-metricas").click();
  await expect(page.getByTestId("met-period")).toHaveText("Últimos 30 días");
  await expect(page.getByTestId("insight-good").first()).toContainText("Lo que más enganchó");
  await expect(page.getByTestId("analysis")).toContainText("Los Reels enganchan más");
  await expect(page.getByTestId("insight-next")).toContainText("Repetí Reels");
  await expect(page.getByTestId("analysis-ai")).toHaveCount(0); // sin clave de IA, solo reglas
  await expect(page.getByTestId("analysis-plan")).toBeVisible();
  await expect(page.getByTestId("met-campaigns")).toContainText("Vuelta a la montaña");

  // Filtrar por marca deja solo sus piezas.
  await page.getByTestId("met-brand").filter({ hasText: "Rodar Bikes" }).click();
  await expect(page.getByTestId("met-row").first()).toContainText("Rodar Bikes");
  await expect(page.getByTestId("met-table")).not.toContainText("La Espiga");

  await page.getByTestId("met-brand").filter({ hasText: "La Espiga" }).click();
  await page.getByTestId("met-row").filter({ hasText: "Nuevo horario de los domingos" }).getByRole("link").first().click();
  await expect(page.getByTestId("results-form")).toBeVisible();
  await page.getByTestId("res-reach").fill("2.300");
  await page.getByTestId("res-interactions").fill("140");
  await page.getByTestId("res-inquiries").fill("5");
  await page.getByTestId("res-spend").fill("0");
  await page.getByTestId("res-save").click();
  await expect(page.getByTestId("res-ok")).toHaveText("Resultados guardados.");
  await expect(page.getByTestId("res-rates")).toContainText("6,1 %");
  await expect(page.getByTestId("history")).toContainText("resultados · Lucía");

  await page.goto("/metricas");
  await expect(page.getByTestId("met-row").filter({ hasText: "Nuevo horario de los domingos" })).toContainText("2.300");
});

test("el Revisor ve las métricas y los resultados, pero no los carga", async ({ page }) => {
  await login(page, "revisor");
  await page.getByTestId("nav-metricas").click();
  await expect(page.getByTestId("analysis-summary")).toContainText("personas alcanzadas");
  await expect(page.getByTestId("analysis-plan")).toHaveCount(0);
  await page.getByTestId("met-row").filter({ hasText: "Así se hace la masa madre" }).getByRole("link").first().click();
  await expect(page.getByTestId("results")).toContainText("5.200");
  await expect(page.getByTestId("results-form")).toHaveCount(0);
});
