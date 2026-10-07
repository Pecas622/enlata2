import { expect, test } from "@playwright/test";
import { login } from "./helpers";

// Cada test deja una caja abierta: el resto de la suite (ventas) la necesita.

test("la encargada ve el esperado, registra un egreso y cierra con motivo", async ({ page }) => {
  await login(page, "Lucía");
  await page.getByTestId("nav-caja").click();
  await expect(page.getByTestId("shift-number")).toHaveText("Abierta");
  const before = await page.getByTestId("expected-ars").innerText();

  await page.getByTestId("move-open").click();
  await page.getByTestId("mv-concept").selectOption("Gastos del local");
  await page.getByTestId("mv-amount").fill("2500");
  await page.getByTestId("mv-save").click();
  await expect(page.getByTestId("move-done")).toBeVisible();
  await expect(page.getByTestId("expected-ars")).not.toHaveText(before);
  await expect(page.getByTestId("moves-table")).toContainText("Gastos del local");

  const expectedUsd = (await page.getByTestId("expected-usd").innerText()).replace(/\D/g, "");
  await page.getByTestId("close-open").click();
  await expect(page.getByTestId("close-form")).toContainText("Esperado:");
  await page.getByTestId("count-ars").fill("1000");
  await page.getByTestId("count-usd").fill(expectedUsd);
  await expect(page.getByTestId("close-diff")).toContainText("Diferencia:");
  await expect(page.getByTestId("close-confirm")).toBeDisabled();
  await page.getByTestId("close-note").fill("Prueba de cierre");
  await page.getByTestId("close-confirm").click();

  await expect(page.getByTestId("shift-report")).toBeVisible();
  await expect(page.getByTestId("report-diff-usd")).toHaveText(/US\$\s?0/);
  await expect(page.locator("body")).toContainText("Prueba de cierre");
  await page.getByTestId("back-caja").click();
  await expect(page.getByTestId("open-ars")).toHaveValue("1000");
  await page.getByTestId("open-confirm").click();
  await expect(page.getByTestId("shift-number")).toHaveText("Abierta");
  await expect(page.getByTestId("shifts-table")).toContainText("Con diferencia");
});

test("el cajero cuenta a ciegas y ve su reporte", async ({ page }) => {
  await login(page, "Caro");
  await page.goto("/caja");
  await expect(page.locator("body")).toContainText("Arqueo ciego: tu rol no ve el efectivo esperado hasta cerrar el turno.");
  await expect(page.getByTestId("expected-ars")).toHaveCount(0);

  await page.getByTestId("close-open").click();
  await expect(page.getByTestId("close-form")).not.toContainText("Esperado");
  await page.getByTestId("count-ars").fill("900");
  await page.getByTestId("count-usd").fill("0");
  await expect(page.getByTestId("close-diff")).toHaveCount(0);
  await expect(page.getByTestId("close-note")).toBeVisible();
  await page.getByTestId("close-confirm").click();

  await expect(page.getByTestId("shift-report")).toContainText("cerró Caro");
  const printed = page.waitForEvent("popup");
  await page.getByTestId("report-print").click();
  const report = await printed;
  await expect(report.getByTestId("report-number")).toContainText("Cierre de caja T-");
  await expect(report.locator("body")).toContainText("Firma:");
  await report.close();

  await page.getByTestId("back-caja").click();
  await page.getByTestId("open-confirm").click();
  await expect(page.getByTestId("shift-number")).toHaveText("Abierta");
});
