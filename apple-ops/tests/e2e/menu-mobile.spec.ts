import { expect, test } from "@playwright/test";
import { login } from "./helpers";

test("en el celular el menú se abre con el botón", async ({ page }) => {
  await login(page, "Santiago");
  await expect(page.getByTestId("nav-stock")).toBeHidden();
  await page.getByTestId("menu-toggle").click();
  await page.getByTestId("nav-stock").click();
  await expect(page.getByTestId("page-title")).toHaveText("Stock de equipos");
});
