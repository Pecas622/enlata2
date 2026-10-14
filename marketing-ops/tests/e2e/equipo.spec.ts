import { expect, test } from "@playwright/test";
import { login, logout } from "./helpers";

test("el inicio responde las tres preguntas", async ({ page }) => {
  await login(page, "admin");
  await expect(page.getByTestId("home-health")).toContainText("¿Cómo está funcionando");
  await expect(page.getByTestId("home-summary")).not.toBeEmpty();
  await expect(page.getByTestId("home-today")).toContainText("¿Qué tengo que publicar hoy?");
  await expect(page.getByTestId("home-tips")).toContainText("¿Qué debería hacer");
  await page.getByTestId("home-brand").filter({ hasText: "La Espiga" }).click();
  await expect(page).toHaveURL(/marca=/);
  await expect(page.getByTestId("home-health")).toContainText("La Espiga");
});

test("un negocio nuevo crea su cuenta, carga su marca y ve el tope de su plan", async ({ page }) => {
  const email = `negocio${Date.now()}@registro.test`;
  await page.goto("/login");
  await page.getByTestId("link-registro").click();
  await page.getByTestId("signup-business").fill("Heladería Polo Sur");
  await page.getByTestId("signup-email").fill(email);
  await page.getByTestId("signup-name").fill("Ana");
  await page.getByTestId("signup-password").fill("clave-segura-1");
  await page.getByTestId("signup-submit").click();
  await page.waitForURL("**/marca/nueva?bienvenida=1");
  await expect(page.getByText("Bienvenido")).toBeVisible();
  await expect(page.getByText("Heladería Polo Sur")).toBeVisible();

  await page.getByTestId("nav-inicio").click();
  await expect(page.getByTestId("home-tip")).toContainText("Cargá tu marca");

  await page.getByTestId("nav-equipo").click();
  await expect(page.getByTestId("plan-usage")).toContainText("Tu plan: Prueba");
  await expect(page.getByTestId("plan-usage")).toContainText("0 de 1");
  await expect(page.getByTestId("members")).toContainText("Ana");
  await logout(page);
});

test("el Administrador invita con un link y la persona entra con su rol", async ({ page, browser }) => {
  await login(page, "admin");
  await page.getByTestId("nav-equipo").click();
  const email = `invitada${Date.now()}@registro.test`;
  await page.getByTestId("invite-email").fill(email);
  await page.getByTestId("invite-name").fill("Flor");
  await page.getByTestId("invite-submit").click();
  const link = (await page.getByTestId("invite-link").first().textContent())!.trim();
  expect(link).toContain("/registro?invitacion=");

  const other = await browser.newPage();
  await other.goto(link);
  await expect(other.getByTestId("invite-info")).toContainText("Estudio Demo");
  await other.getByTestId("signup-password").fill("clave-segura-1");
  await other.getByTestId("signup-submit").click();
  await other.waitForURL("**/inicio");
  await expect(other.getByTestId("nav-equipo")).toHaveCount(0);
  await other.close();

  await page.reload();
  await expect(page.getByTestId("members")).toContainText("Flor");
});
