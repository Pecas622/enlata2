import { expect, test, type Page } from "@playwright/test";
import { login } from "./helpers";

const imei = () => "97" + String(Date.now()).slice(-10) + String(Math.floor(Math.random() * 1000)).padStart(3, "0");

async function cobrarSaldo(page: Page) {
  await page.getByTestId("pay-rest-0").click();
  await expect(page.getByTestId("pos-confirm")).toBeEnabled();
}

test("el vendedor vende un equipo y un accesorio y ve el comprobante", async ({ page }) => {
  await login(page, "Mati");
  await page.getByTestId("nav-ventas").click();
  await page.getByTestId("pos-search").fill("iPhone 11");
  await page.getByTestId("pos-device").first().click();
  await page.getByTestId("pos-tab-accesorios").click();
  await page.getByTestId("pos-search").fill("Pop socket");
  await page.getByTestId("pos-acc").first().click();
  await page.getByTestId("pos-acc").first().click();
  await expect(page.getByTestId("cart-qty")).toHaveText("2");
  await expect(page.getByTestId("cart-price")).toHaveCount(0);

  await page.getByTestId("pos-discount").fill("10");
  await expect(page.getByText("Tu rol permite hasta 5% de descuento.")).toBeVisible();
  await page.getByTestId("pos-discount").fill("");

  await page.getByTestId("pos-client-name").fill("Cliente E2E");
  await cobrarSaldo(page);
  await page.getByTestId("pos-confirm").click();

  await expect(page).toHaveURL(/\/ventas\/[0-9a-f-]+\?nueva=1$/);
  await expect(page.getByTestId("receipt")).toContainText("Cliente E2E");
  await expect(page.getByTestId("receipt")).toContainText("2 × Pop socket");
  await expect(page.getByTestId("receipt")).toContainText("sin validez fiscal");
  await expect(page.getByTestId("void-open")).toHaveCount(0);
});

test("plan canje: el vendedor no pasa la tasación y cobra la diferencia", async ({ page }) => {
  await login(page, "Mati");
  await page.goto("/canje?tab=nuevo");
  await page.getByTestId("pos-search").fill("iPhone 14 Pro");
  await page.getByTestId("pos-device").first().click();
  await expect(page.getByTestId("tradein-block")).toBeVisible();
  await page.getByTestId("ev-model").selectOption("iPhone 13");
  await page.getByTestId("ev-cap").selectOption("128");
  await page.getByTestId("ev-cond").selectOption("Usado B");
  await page.getByTestId("ev-battery").fill("86");
  await page.getByTestId("ev-imei").fill(imei());
  await expect(page.getByTestId("appraisal")).toContainText("320");
  await expect(page.getByTestId("ti-value")).toHaveValue("320");

  await page.getByTestId("ti-value").fill("400");
  await expect(page.getByTestId("tradein-block")).toContainText("Tu rol no permite tomar el equipo por encima");
  await page.getByTestId("ti-value").fill("");

  await cobrarSaldo(page);
  await page.getByTestId("pos-confirm").click();
  await expect(page.getByTestId("receipt")).toContainText("Plan canje: iPhone 13 128GB");
  await expect(page.getByTestId("receipt")).toContainText("Diferencia pagada");
  await expect(page.getByTestId("receipt")).toContainText("entró al stock como disponible");
});

test("el cajero vende sin plan canje", async ({ page }) => {
  await login(page, "Caro");
  await page.goto("/ventas");
  await expect(page.getByTestId("pos-device").first()).toBeVisible();
  await expect(page.getByTestId("pos-use-tradein")).toHaveCount(0);
  await page.goto("/canje");
  await expect(page).toHaveURL(/\/dashboard$/);
});

test("la encargada anula una venta con motivo", async ({ page }) => {
  await login(page, "Lucía");
  await page.goto("/ventas");
  await page.getByTestId("pos-tab-libre").click();
  await page.getByTestId("pos-free-desc").fill("Configuración de equipo");
  await page.getByTestId("pos-free-price").fill("5000");
  await page.getByTestId("pos-free-add").click();
  await page.getByTestId("pay-method-0").selectOption("Efectivo ARS");
  await cobrarSaldo(page);
  await page.getByTestId("pos-confirm").click();
  await expect(page.getByTestId("receipt")).toContainText("Configuración de equipo");

  await page.getByTestId("void-open").click();
  await expect(page.getByTestId("void-confirm")).toBeDisabled();
  await page.getByTestId("void-reason").fill("Cargada por error");
  await page.getByTestId("void-confirm").click();
  await expect(page.getByTestId("receipt")).toContainText("Anulada");
  await expect(page.getByTestId("receipt")).toContainText("Cargada por error");
  await expect(page.getByTestId("void-open")).toHaveCount(0);
});

test("historial de ventas y comprobante imprimible", async ({ page }) => {
  await login(page, "Lucía");
  await page.goto("/ventas?tab=historial");
  await expect(page.getByTestId("sales-table")).toContainText("V-0001");
  await page.getByTestId("sales-search").fill("Juan Pérez");
  await page.getByTestId("sales-search").press("Enter");
  await expect(page.getByTestId("sales-table").locator("tbody tr")).toHaveCount(2);
  await page.getByRole("link", { name: "V-0005" }).click();
  await expect(page.getByTestId("receipt")).toContainText("Plan canje: iPhone 13 128GB");

  await page.goto(page.url() + "/comprobante");
  await expect(page.getByTestId("comprobante-number")).toHaveText("Comprobante V-0005");
  await expect(page.locator("body")).toContainText("IMEI 35");
  await expect(page.locator("body")).toContainText("sin validez fiscal");
});

test("cotizador de canje: diferencia contra un equipo del stock", async ({ page }) => {
  await login(page, "Mati");
  await page.goto("/canje");
  await expect(page.getByTestId("stat-canjes")).not.toHaveText("");
  await page.getByTestId("ev-model").selectOption("iPhone 13");
  await page.getByTestId("ev-cap").selectOption("128");
  await page.getByTestId("ev-cond").selectOption("Usado B");
  await page.getByTestId("ev-battery").fill("86");
  await page.getByTestId("ev-imei").fill(imei());
  await page.getByTestId("quote-target").selectOption({ index: 1 });
  await expect(page.getByTestId("quote-diff")).toContainText("US$");
  await expect(page.getByTestId("quote-wa")).toHaveAttribute("href", /wa\.me/);
});
