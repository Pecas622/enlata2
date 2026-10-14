import path from "node:path";
import { expect, test } from "@playwright/test";
import { login } from "./helpers";

test("el panel de redes manda al inicio de sesión oficial de Instagram y no acepta vueltas ajenas", async ({ page }) => {
  await login(page, "admin");
  await page.getByTestId("nav-redes").click();
  const espiga = page.getByTestId("redes-brand").filter({ hasText: "La Espiga" });
  await expect(espiga.getByTestId("social-instagram")).toContainText("Sin conectar");
  await expect(espiga).toContainText("Próximamente");

  // Cortamos el pedido a Instagram: solo miramos que salga bien armado.
  let authorize = "";
  await page.route("https://www.instagram.com/**", (route) => {
    authorize = route.request().url();
    return route.fulfill({ status: 200, body: "instagram" });
  });
  await espiga.getByTestId("social-connect").click();
  await expect.poll(() => authorize).toContain("https://www.instagram.com/oauth/authorize");
  const q = new URL(authorize).searchParams;
  expect(q.get("client_id")).toBe("e2e-app");
  expect(q.get("scope")).toBe("instagram_business_basic,instagram_business_content_publish");
  expect(q.get("redirect_uri")).toMatch(/\/api\/redes\/instagram\/vuelta$/);
  expect(q.get("state")).toMatch(/^[0-9a-f]{48}$/);

  // Una vuelta con otro código de un solo uso no conecta nada.
  await page.goto("/api/redes/instagram/vuelta?code=abc&state=otro");
  await expect(page.getByTestId("redes-error")).toContainText("La conexión venció o no salió de acá");
  await expect(espiga.getByTestId("social-instagram")).toContainText("Sin conectar");
});

test("el Creador ve las redes pero no conecta", async ({ page }) => {
  await login(page, "creador");
  await page.getByTestId("nav-redes").click();
  await expect(page.getByTestId("redes-brand").first()).toBeVisible();
  await expect(page.getByTestId("social-connect")).toHaveCount(0);
});

test("logo y fotos en la marca, y archivos en la pieza", async ({ page }) => {
  const foto = path.join(__dirname, "fixtures", "foto.png");
  await login(page, "admin");
  await page.getByTestId("nav-marca").click();
  await page.getByTestId("brand-card").filter({ hasText: "Rodar Bikes" }).click();
  await page.getByTestId("media-kind").selectOption("logo");
  await page.getByTestId("media-input").setInputFiles(foto);
  await expect(page.getByTestId("brand-logo").locator("img")).toBeVisible();
  await page.getByTestId("media-kind").selectOption("foto");
  await page.getByTestId("media-input").setInputFiles(foto);
  await expect(page.getByTestId("media-item")).toHaveCount(1);
  await page.getByTestId("media-item").getByTestId("media-delete").click();
  await expect(page.getByTestId("media-item")).toHaveCount(0);

  await page.getByTestId("nav-contenidos").click();
  await page.getByTestId("content-search").fill("5 señales");
  await page.getByTestId("content-row").first().click();
  await page.getByTestId("media-input").setInputFiles(foto);
  await expect(page.getByTestId("media-panel").getByTestId("media-item")).toHaveCount(1);
  await expect(page.getByTestId("history")).toContainText("Sumó un archivo");
});
