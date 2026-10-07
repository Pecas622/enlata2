import { expect, test } from "@playwright/test";
import { login } from "./helpers";

test("el catálogo público se ve sin sesión y no muestra datos internos", async ({ page }) => {
  await page.goto("/catalogo/demo");
  await expect(page.getByTestId("public-catalog")).toBeVisible();
  const total = await page.getByTestId("cat-item").count();
  expect(total).toBeGreaterThan(3);
  const body = await page.locator("body").innerText();
  for (const banned of ["IMEI", "Costo", "costo", "Margen", "Juan Pérez"]) expect(body).not.toContain(banned);

  await page.getByTestId("cat-chip-iPhone").click();
  expect(await page.getByTestId("cat-item").count()).toBeLessThan(total);
  await page.getByTestId("cat-cond-Nuevos").click();
  await expect(page.getByTestId("cat-item").first()).toContainText("Nuevo sellado");
  await page.getByTestId("cat-item").first().click();
  await expect(page.getByTestId("cat-sheet")).toContainText("iCloud");
  await expect(page.getByTestId("cat-ask")).toHaveAttribute("href", /^\/catalogo\/demo\/wa\?/);
  await page.getByRole("button", { name: "Cerrar" }).click();
  await page.getByTestId("cat-chip-Accesorios").click();
  await expect(page.getByTestId("cat-acc").first()).toBeVisible();
});

test("Cotizá tu iPhone: valor orientativo y derivación a un asesor", async ({ page }) => {
  await page.goto("/catalogo/demo");
  await page.getByTestId("cat-quote").click();
  await expect(page).toHaveURL(/\/catalogo\/demo\/cotizar$/);
  await page.getByTestId("q-gen-13").click();
  await page.getByTestId("q-ver-Base").click();
  await page.getByTestId("q-cap-128").click();
  await page.getByTestId("q-bat-80").click();
  await expect(page.getByTestId("quote-value")).toHaveText(/Vale hasta US\$\s?360/);
  await expect(page.getByTestId("quote-result")).toContainText("orientativo");
  await expect(page.getByTestId("quote-wa")).toHaveAttribute("href", /vale\+hasta\+US%24\+360/);

  await page.getByTestId("q-gen-16").click();
  await page.getByTestId("q-ver-Pro").click();
  await page.getByTestId("q-cap-512").click();
  await page.getByTestId("q-bat-79").click();
  await expect(page.getByTestId("quote-handoff")).toHaveText("Este modelo lo cotiza un asesor");
  await expect(page.getByTestId("quote-wa")).toContainText("Hablar con un asesor");
});

test("la consulta por WhatsApp se cuenta y redirige a wa.me", async ({ page, request }) => {
  const res = await request.get("/catalogo/demo/wa?t=Hola&l=Consulta%20e2e", { maxRedirects: 0 });
  expect(res.status()).toBe(307);
  expect(res.headers()["location"]).toMatch(/^https:\/\/wa\.me\/5492615550000\?text=Hola$/);
  await login(page, "Lucía");
  await page.getByTestId("nav-catalogo").click();
  await expect(page.getByTestId("cat-clicks-table")).toContainText("Consulta e2e");
});

test("la encargada oculta un equipo y pausa el catálogo", async ({ page, context }) => {
  await login(page, "Lucía");
  await page.goto("/catalogo");
  await expect(page.getByTestId("cat-url")).toContainText("/catalogo/demo");
  const visible = await page.getByTestId("cat-visible").innerText();
  const first = page.getByTestId("cat-device-row").first();
  const name = (await first.locator("b").innerText()).trim();
  await first.locator('[data-testid^="vis-"]').click();
  await expect(first.locator('[data-testid^="vis-"]')).toHaveAttribute("aria-checked", "false");
  await page.reload();
  await expect(page.getByTestId("cat-visible")).not.toHaveText(visible);

  const pub = await context.newPage();
  await pub.goto("/catalogo/demo");
  const names = await pub.getByTestId("cat-item").locator(".pc-name").allInnerTexts();
  expect(names.filter((n) => n === name).length).toBeLessThan((await page.getByTestId("cat-device-row").locator("b").allInnerTexts()).filter((n) => n.trim() === name).length);

  await page.getByTestId("cat-device-row").first().locator('[data-testid^="vis-"]').click();
  await expect(page.getByTestId("cat-device-row").first().locator('[data-testid^="vis-"]')).toHaveAttribute("aria-checked", "true");

  await page.getByTestId("cat-published").uncheck();
  await page.getByTestId("cat-save").click();
  await expect(page.getByTestId("cat-saved")).toBeVisible();
  await pub.goto("/catalogo/demo");
  await expect(pub.getByTestId("catalog-paused")).toContainText("Volvemos pronto");
  await page.getByTestId("cat-published").check();
  await page.getByTestId("cat-save").click();
  await expect(page.getByTestId("cat-saved")).toBeVisible();
  await pub.goto("/catalogo/demo");
  await expect(pub.getByTestId("public-catalog")).toBeVisible();
});

test("el vendedor no entra al panel del catálogo", async ({ page }) => {
  await login(page, "Mati");
  await page.goto("/catalogo");
  await expect(page).toHaveURL(/\/dashboard$/);
});
