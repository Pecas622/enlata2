import { expect, test } from "@playwright/test";
import { login } from "./helpers";

const imei = () => "98" + String(Date.now()).slice(-10) + String(Math.floor(Math.random() * 1000)).padStart(3, "0");

test("el vendedor ve el stock sin columna de costo", async ({ page }) => {
  await login(page, "Mati");
  await page.getByTestId("nav-stock").click();
  await expect(page.getByTestId("stock-table")).toBeVisible();
  await expect(page.getByTestId("stock-table").locator("th")).not.toContainText(["Costo"]);
  await expect(page.getByTestId("go-ingreso")).toHaveCount(0);
  await page.getByTestId("stock-row").first().click();
  await expect(page.getByTestId("dev-price")).toHaveCount(0);
  await expect(page.locator("body")).not.toContainText("Costo:");
});

test("filtros de stock por tipo y búsqueda", async ({ page }) => {
  await login(page, "Lucía");
  await page.goto("/stock");
  await page.getByTestId("kind-Mac").click();
  await expect(page.getByTestId("stock-row")).toHaveCount(1);
  await expect(page.getByTestId("stock-row")).toContainText("MacBook Air M1");
  await page.getByTestId("kind-Todos").click();
  await page.getByTestId("stock-search").fill("titanio");
  await expect(page.getByTestId("stock-row")).toHaveCount(1);
});

test("ingreso de un usado comprado a un particular", async ({ page }) => {
  const n = imei();
  await login(page, "Lucía");
  await page.goto("/ingresos");
  await page.getByTestId("ing-person").fill("Ana Pérez");
  await page.getByTestId("ing-dni").fill("30111222");
  await page.getByTestId("ev-model").selectOption("iPhone 13");
  await page.getByTestId("ev-cap").selectOption("128");
  await page.getByTestId("ev-cond").selectOption("Usado B");
  await page.getByTestId("ev-battery").fill("86");
  await page.getByTestId("ev-imei").fill(n);
  // Misma tasación que el prototipo: 370 − 37 − 11 → US$ 320
  await expect(page.getByTestId("appraisal")).toContainText("320");
  await expect(page.getByTestId("ing-cost")).toHaveValue("320");
  await expect(page.getByTestId("ing-price")).toHaveValue("360");
  await page.getByTestId("ing-submit").click();
  await expect(page.getByTestId("ing-done")).toContainText("ingresó al stock");

  await page.goto("/stock");
  await page.getByTestId("stock-search").fill(n);
  await expect(page.getByTestId("stock-row")).toHaveCount(1);
  await page.getByTestId("stock-row").click();
  await expect(page.getByTestId("dev-history")).toContainText("Ingreso (Compra a particular)");
});

test("no deja ingresar un IMEI que ya está en stock", async ({ page }) => {
  await login(page, "Lucía");
  await page.goto("/ingresos");
  await page.getByTestId("ing-origin").selectOption("Proveedor");
  await page.getByTestId("ev-model").selectOption("iPhone 15");
  await page.getByTestId("ev-imei").fill("359000007919317"); // equipo d1 del seed
  await expect(page.getByText("Este IMEI ya figura en stock")).toBeVisible();
  await expect(page.getByTestId("ing-submit")).toBeDisabled();
});

test("el encargado cambia el precio y queda en el historial", async ({ page }) => {
  await login(page, "Lucía");
  await page.goto("/stock");
  await page.getByTestId("stock-search").fill("359000102951121"); // iPhone 13 256GB del seed
  await page.getByTestId("stock-row").click();
  await page.getByTestId("dev-price").fill("480");
  await page.getByTestId("dev-save").click();
  await expect(page.getByTestId("dev-saved")).toBeVisible();
  await expect(page.getByTestId("dev-price-view")).toContainText("480");
  await expect(page.getByTestId("dev-history")).toContainText("precio US$ 500 → US$ 480");
});

test("el boleto de compra se puede imprimir", async ({ page }) => {
  await login(page, "Santiago");
  await page.goto("/ingresos");
  const boleto = page.getByTestId("ingresos-table").getByText("Boleto").first();
  const [popup] = await Promise.all([page.waitForEvent("popup"), boleto.click()]);
  await expect(popup.getByTestId("boleto-number")).toContainText("Boleto de compra I-");
  await expect(popup.locator("body")).toContainText("sin validez fiscal");
});
