import { expect, test } from "@playwright/test";
import { login } from "./helpers";

const tag = () => String(Date.now()).slice(-6);

test("el vendedor ve accesorios sin costo y sin botones de carga", async ({ page }) => {
  await login(page, "Mati");
  await page.getByTestId("nav-accesorios").click();
  await expect(page.getByTestId("acc-table")).toBeVisible();
  await expect(page.getByTestId("acc-table").locator("th")).not.toContainText(["Costo"]);
  await expect(page.getByTestId("acc-new")).toHaveCount(0);
  await expect(page.getByTestId("acc-low")).toContainText("por debajo del mínimo");
  await page.getByTestId("cat-Cables").click();
  await expect(page.getByTestId("acc-row")).toHaveCount(2);
  await page.getByTestId("acc-row").first().click();
  await expect(page.getByTestId("acc-moves")).toBeVisible();
  await expect(page.getByTestId("restock-qty")).toHaveCount(0);
  await expect(page.locator("body")).not.toContainText("Costo promedio");
});

test("la encargada da de alta un accesorio, lo repone y edita el precio", async ({ page }) => {
  const name = `Funda E2E ${tag()}`;
  await login(page, "Lucía");
  await page.goto("/accesorios");
  await page.getByTestId("acc-new").click();
  await page.getByTestId("acc-name").fill(name);
  await page.getByTestId("acc-cost").fill("4000");
  await page.getByTestId("acc-price").fill("12000");
  await page.getByTestId("acc-stock").fill("5");
  await page.getByTestId("acc-save").click();

  await expect(page.getByTestId("page-title")).toHaveText(name);
  await expect(page.getByTestId("acc-moves")).toContainText("+5 · Stock inicial");
  await page.getByTestId("restock-qty").fill("5");
  await page.locator('input[name="unit_cost"]').fill("6000");
  await page.getByTestId("restock-save").click();
  await expect(page.getByTestId("restock-done")).toBeVisible();
  await expect(page.getByTestId("acc-cost-view")).toContainText("5.000");
  await expect(page.getByTestId("acc-moves")).toContainText("Reposición a $ 6000 c/u");

  await page.getByTestId("acc-price").fill("13000");
  await page.getByTestId("acc-save").click();
  await expect(page.getByTestId("acc-saved")).toBeVisible();
  await expect(page.getByTestId("acc-price-view")).toContainText("13.000");
});

test("carga masiva de accesorios", async ({ page }) => {
  const t = tag();
  await login(page, "Santiago");
  await page.goto("/accesorios/carga");
  await page.getByTestId("bulk-text").fill(`Funda masiva ${t}; Fundas; 3800; 12500; 10\nSin precio ${t}; Vidrios; 100; ; 2\nCable masivo ${t}; Cables; 2000; 7000; 4`);
  await expect(page.getByTestId("bulk-count")).toHaveText("2 líneas válidas de 3.");
  await page.getByTestId("bulk-save").click();
  await expect(page.getByTestId("bulk-done")).toContainText("Se cargaron 2 accesorios.");
  await page.getByTestId("acc-search").fill(t);
  await expect(page.getByTestId("acc-row")).toHaveCount(2);
});

test("el cajero carga un cliente y ve su ficha", async ({ page }) => {
  const name = `Cliente E2E ${tag()}`;
  await login(page, "Caro");
  await page.goto("/clientes");
  await page.getByTestId("cli-new").click();
  await page.getByTestId("cli-name").fill(name);
  await page.getByTestId("cli-phone").fill("+54 9 261 555 9999");
  await page.getByTestId("cli-save").click();
  await expect(page.getByTestId("page-title")).toHaveText(name);
  await expect(page.getByTestId("cli-compras")).toHaveText("0");

  await page.getByTestId("cli-notes").fill("Prefiere transferencia");
  await page.getByTestId("cli-save").click();
  await expect(page.getByTestId("cli-saved")).toBeVisible();
  await expect(page.locator("body")).toContainText("Prefiere transferencia");
});

test("la ficha del cliente muestra sus compras y canjes", async ({ page }) => {
  await login(page, "Mati");
  await page.goto("/clientes");
  await page.getByTestId("cli-search").fill("Juan Pérez");
  await page.getByTestId("cli-row").click();
  await expect(page.getByTestId("cli-sales")).toContainText("V-0005");
  await expect(page.getByTestId("cli-sales")).toContainText("iPhone 13 128GB");
  await page.getByTestId("cli-dni").fill("30111222");
  await page.getByTestId("cli-save").click();
  await expect(page.getByTestId("form-error")).toHaveText("Ya hay un cliente con DNI 30111222.");
});
