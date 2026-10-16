import { expect, test } from "@playwright/test";
import { login } from "./helpers";

test("el reporte para el cliente sale de Métricas, con la nota y las partes elegidas, para imprimir o copiar", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await login(page, "creador");
  await page.goto("/metricas");
  await page.getByTestId("met-report").click();
  await expect(page.getByTestId("report-title")).toHaveText("Reporte · Últimos 30 días");

  // Para un cliente, se elige su marca.
  await page.getByTestId("report-brand").filter({ hasText: "La Espiga" }).click();
  await expect(page.getByTestId("report-title")).toHaveText("Reporte de La Espiga · Últimos 30 días");
  const sheet = page.getByTestId("report-sheet");
  await expect(sheet.getByTestId("report-kpis")).toContainText("Personas alcanzadas");
  await expect(sheet.getByTestId("report-summary")).toContainText("personas alcanzadas");
  await expect(sheet).not.toContainText("Rodar Bikes");
  await expect(sheet.getByTestId("report-top")).toBeVisible();

  await page.getByTestId("report-note").fill("Hola Marta, te paso cómo nos fue.");
  await expect(sheet.getByTestId("report-note-out")).toHaveText("Hola Marta, te paso cómo nos fue.");
  await page.getByTestId("report-show-top").uncheck();
  await expect(sheet.getByTestId("report-top")).toHaveCount(0);

  await page.getByTestId("report-copy").click();
  await expect(page.getByTestId("report-copy")).toHaveText("¡Copiado!");
  const text = await page.evaluate(() => navigator.clipboard.readText());
  expect(text.split("\n")[0]).toBe("*Reporte de La Espiga · Últimos 30 días*");
  expect(text).toContain("Hola Marta, te paso cómo nos fue.");
  expect(text).toContain("*Resultados*");
  expect(text).not.toContain("*Lo mejor del período*");

  // Imprimir abre el diálogo del navegador (desde ahí se guarda el PDF).
  await page.evaluate(() => { (window as unknown as { printed: boolean }).printed = false; window.print = () => { (window as unknown as { printed: boolean }).printed = true; }; });
  await page.getByTestId("report-print").click();
  expect(await page.evaluate(() => (window as unknown as { printed: boolean }).printed)).toBe(true);
  // Al imprimir solo sale la hoja.
  await page.emulateMedia({ media: "print" });
  await expect(page.getByTestId("report-tools")).toBeHidden();
  await expect(sheet).toBeVisible();
});

test("el Revisor también arma el reporte de lo que ve", async ({ page }) => {
  await login(page, "revisor");
  await page.goto("/metricas");
  await page.getByTestId("met-report").click();
  await expect(page.getByTestId("report-sheet")).toBeVisible();
  await expect(page.getByTestId("report-kpis")).toContainText("Consultas");
});
