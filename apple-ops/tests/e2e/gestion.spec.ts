import { expect, test } from "@playwright/test";
import { login } from "./helpers";

test("el dashboard del vendedor no muestra ganancia ni capital", async ({ page }) => {
  await login(page, "Mati");
  await expect(page.getByTestId("page-title")).toHaveText("Dashboard");
  await expect(page.getByTestId("stat-caja")).toHaveText("Abierta");
  await expect(page.getByTestId("stat-profit")).toHaveCount(0);
  await expect(page.locator("body")).not.toContainText("Capital");
  await expect(page.getByTestId("recent-table").locator("tbody tr")).toHaveCount(6);
  await expect(page.getByTestId("bars").locator("i")).toHaveCount(7);
});

test("la encargada ve ganancia en el dashboard y en reportes, y exporta CSV", async ({ page }) => {
  await login(page, "Lucía");
  await expect(page.getByTestId("stat-profit")).toBeVisible();
  await expect(page.locator("body")).toContainText("Capital:");
  await expect(page.getByTestId("todo")).toContainText("días en stock");

  await page.getByTestId("nav-reportes").click();
  await page.getByTestId("period-todo").click();
  await expect(page.getByTestId("rep-profit")).toBeVisible();
  await expect(page.getByTestId("by-seller")).toContainText("Mati");
  await expect(page.getByTestId("by-seller")).toContainText("Comisión");
  await expect(page.getByTestId("by-category")).toContainText("iPhone");

  const res = await page.request.get("/reportes/ventas.csv?p=todo");
  expect(res.status()).toBe(200);
  const csv = await res.text();
  expect(csv).toContain("Numero,Fecha,Cliente,Vendedor,TotalUSD,CanjeUSD,GananciaUSD");
  expect(csv).toContain('"V-0001"');
});

test("el vendedor no descarga reportes", async ({ page }) => {
  await login(page, "Mati");
  expect((await page.request.get("/reportes/ventas.csv")).status()).toBe(403);
});

test("el administrador da de alta un usuario que entra con su email", async ({ page }) => {
  const tag = String(Date.now()).slice(-6);
  const email = `e2e${tag}@demo.apple-ops.test`;
  await login(page, "Santiago");
  await page.getByTestId("nav-usuarios").click();
  await expect(page.getByTestId("perm-matrix")).toContainText("Abrir y cerrar caja");
  await page.getByTestId("user-new").click();
  await page.getByTestId("user-name").fill(`Vendedor ${tag}`);
  await page.getByTestId("user-email").fill(email);
  await page.getByTestId("user-password").fill("clave-e2e-123");
  await page.getByTestId("user-pin").fill("7777");
  await page.getByTestId("user-commission").fill("3");
  await page.getByTestId("user-save").click();
  await expect(page.locator("body")).toContainText(`Vendedor ${tag} ya puede entrar con su email`);
  await expect(page.getByTestId("users-table")).toContainText(email);
  await expect(page.getByTestId("activity")).toContainText(`Vendedor ${tag} (Vendedor)`);

  await page.getByTestId("edit-Santiago").click();
  await page.getByTestId("user-role").selectOption("Encargado");
  await page.getByTestId("user-save").click();
  await expect(page.getByTestId("form-error")).toHaveText("Tiene que quedar al menos un administrador activo.");

  await page.getByTestId("logout").click();
  await page.getByTestId("login-email").fill(email);
  await page.getByTestId("login-password").fill("clave-e2e-123");
  await page.getByTestId("login-submit").click();
  await expect(page.getByTestId("current-user")).toContainText(`Vendedor ${tag}`);
});

test("el administrador cambia la cotización y queda registrado", async ({ page }) => {
  await login(page, "Santiago");
  await page.goto("/config");
  await page.getByTestId("cfg-fx").fill("1300");
  await page.getByTestId("cfg-save").click();
  await expect(page.getByTestId("cfg-saved")).toBeVisible();
  await page.goto("/usuarios");
  await expect(page.getByTestId("activity")).toContainText("cotización $ 1200 → $ 1300");

  await page.goto("/config");
  await expect(page.getByTestId("cfg-fx")).toHaveValue("1300");
  await page.getByTestId("cfg-fx").fill("1200");
  await page.getByTestId("cfg-save").click();
  await expect(page.getByTestId("cfg-saved")).toBeVisible();
});
