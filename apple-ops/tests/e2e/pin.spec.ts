import { expect, test } from "@playwright/test";
import { login } from "./helpers";

test("cambio de usuario con PIN en el mostrador", async ({ page }) => {
  await login(page, "Caro");
  await page.getByTestId("switch-user").click();
  await page.getByTestId("pick-Mati").click();
  await page.getByTestId("pin").fill("0000");
  await page.getByTestId("pin-submit").click();
  await expect(page.getByTestId("form-error")).toContainText("PIN incorrecto");

  await page.getByTestId("pin").fill("3333");
  await page.getByTestId("pin-submit").click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByTestId("current-user")).toContainText("Mati");
  await expect(page.getByTestId("nav-caja")).toHaveCount(0);
});
