import { expect, test } from "@playwright/test";
import { login } from "./helpers";

test("la encargada ve los equipos parados y el administrador cambia desde cuándo avisar", async ({ page }) => {
  await login(page, "Lucía");
  await page.getByTestId("nav-alertas").click();
  await expect(page.getByTestId("page-title")).toHaveText("Alertas");
  const stale = page.getByTestId("alert-stale");
  await expect(stale).toContainText("iPhone 11 64GB");
  await expect(stale).toContainText("iPhone 12 128GB");
  await expect(page.getByTestId("alert-acc")).toContainText("Vidrio privacidad iPhone 15 Pro");
  await page.goto("/dashboard");
  await expect(page.getByTestId("todo-alertas")).toBeVisible();

  await login(page, "Santiago");
  await page.goto("/config");
  await page.getByTestId("stale-days").fill("60");
  await page.getByTestId("fx-save").click();
  await expect(page.getByTestId("fx-msg")).toHaveText("Guardado.");
  await page.goto("/alertas");
  await expect(page.getByTestId("alert-stale")).toContainText("iPhone 11 64GB");
  await expect(page.getByTestId("alert-stale")).not.toContainText("iPhone 12 128GB");

  await page.goto("/config");
  await page.getByTestId("stale-days").fill("30");
  await page.getByTestId("fx-save").click();
  await expect(page.getByTestId("fx-msg")).toHaveText("Guardado.");
});

test("el vendedor no ve alertas de margen", async ({ page }) => {
  await login(page, "Mati");
  await expect(page.getByTestId("nav-alertas")).toHaveCount(0);
  await page.goto("/alertas");
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByTestId("todo-alertas")).toHaveCount(0);
});
