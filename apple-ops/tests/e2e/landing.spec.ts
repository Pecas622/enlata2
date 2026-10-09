// Landing de venta en "/": pública para quien no inició sesión, con los precios vigentes de plan_prices.
import { expect, test } from "@playwright/test";
import { login } from "./helpers";

test("sin sesión, la página principal es la landing con precios y lleva al alta", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("landing")).toBeVisible();
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Controlá tu local");
  await expect(page.getByTestId("landing-desde")).toContainText("Desde $ 45.900 por mes");
  await expect(page.getByTestId("landing-plan-base")).toContainText("$ 45.900");
  await expect(page.getByTestId("landing-mod-asistente")).toContainText("+$ 20.000");
  await expect(page.getByTestId("landing-mod-reportes")).toContainText("+$ 6.900");
  await expect(page.getByTestId("landing-plan-base")).toContainText("stock con IMEI");
  await expect(page.getByTestId("landing-mod-imei")).toHaveCount(0);
  await expect(page.locator("body")).toContainText("no está afiliado ni respaldado por Apple Inc.");
  await page.getByTestId("landing-cta-hero").click();
  await expect(page).toHaveURL(/\/alta$/);
});

test("con sesión, la página principal va directo al dashboard", async ({ page }) => {
  await login(page, "Mati");
  await page.goto("/");
  await expect(page).toHaveURL(/\/dashboard$/);
});
