import { expect, test } from "@playwright/test";
import { login, logout } from "./helpers";

test("sin sesión manda al login", async ({ page }) => {
  await page.goto("/contenidos");
  await expect(page).toHaveURL(/\/login/);
});

test("el Revisor no ve el generador ni puede editar la marca", async ({ page }) => {
  await login(page, "revisor");
  await expect(page.getByTestId("nav-generar")).toHaveCount(0);
  await page.goto("/generar");
  await expect(page).toHaveURL(/\/inicio/);
  await page.goto("/marca");
  await page.getByTestId("brand-card").first().click();
  await expect(page.getByTestId("brand-save")).toHaveCount(0);
  await expect(page.getByTestId("brand-name")).toBeDisabled();
});

test("generar, guardar, mandar a revisión, aprobar y publicar", async ({ page }) => {
  const topic = `medialunas de manteca ${Date.now()}`;
  await login(page, "creador");
  await page.getByTestId("nav-generar").click();
  await page.getByTestId("gen-brand").selectOption({ label: "La Espiga" });
  await page.getByTestId("gen-goal").selectOption("Promoción");
  await page.getByTestId("gen-format-Reel").click();
  await page.getByTestId("gen-topic").fill(topic);
  await page.getByTestId("gen-offer").fill("2x1 los martes");
  await page.getByTestId("gen-submit").click();
  const variants = page.getByTestId("variant");
  await expect(variants).toHaveCount(3);
  await expect(variants.first()).toContainText("0-3 s · Gancho");
  await expect(variants.first()).toContainText("2x1 los martes");
  await expect(page.getByTestId("gen-results").getByText("Con plantillas")).toBeVisible();

  await variants.nth(1).getByTestId("variant-save").click();
  await page.waitForURL(/\/contenidos\/[0-9a-f-]+/);
  await expect(page.getByText("Guardada como borrador")).toBeVisible();
  await expect(page.getByTestId("history")).toContainText("Creada con plantilla · Lucía");
  const url = page.url().replace(/\?.*$/, "");
  const title = (await page.getByTestId("page-title").textContent())!;

  await page.getByTestId("content-body").fill("0-3 s · Gancho: jueves de medialunas.\nTexto del posteo: 2x1 los martes en medialunas. Pedí por WhatsApp.");
  await page.getByTestId("content-save").click();
  await expect(page.getByTestId("content-saved")).toBeVisible();
  await page.getByTestId("status-Mandar a revisión").click();
  await expect(page.getByText("En revisión").first()).toBeVisible();
  await expect(page.getByTestId("status-Aprobar")).toHaveCount(0);
  await logout(page);

  await login(page, "revisor");
  await expect(page.getByTestId("list-review")).toContainText(title);
  await page.goto(url);
  await expect(page.getByTestId("content-editor")).toHaveCount(0);
  await page.getByTestId("status-Pedir cambios").click();
  await page.getByTestId("status-note").fill("Nombrá la promo en la primera línea");
  await page.getByTestId("status-note-send").click();
  await expect(page.getByTestId("history")).toContainText("Pidió cambios · Mati");
  await logout(page);

  await login(page, "creador");
  await page.goto(url);
  await expect(page.getByText("Cambios pedidos por Mati")).toBeVisible();
  await page.getByTestId("status-Mandar a revisión").click();
  await expect(page.getByTestId("status-Mandar a revisión")).toHaveCount(0);
  await logout(page);

  await login(page, "revisor");
  await page.goto(url);
  await page.getByTestId("status-Aprobar").click();
  await expect(page.getByTestId("history")).toContainText("Aprobó · Mati");
  await logout(page);

  await login(page, "creador");
  await page.goto(url);
  await page.getByTestId("status-Marcar como publicada").click();
  await expect(page.getByTestId("history")).toContainText("Marcó como publicada · Lucía");
  await expect(page.getByTestId("content-editor")).toHaveCount(0);
});

test("el Administrador crea una marca y genera con ella", async ({ page }) => {
  const name = `Estudio Prueba ${Date.now()}`;
  await login(page, "admin");
  await page.goto("/marca/nueva");
  await page.getByTestId("brand-name").fill(name);
  await page.getByTestId("brand-industry").fill("Estudio contable");
  await page.getByTestId("brand-value_prop").fill("Te respondemos en el día y sin letra chica.");
  await page.getByTestId("tone-Profesional").check();
  await page.getByTestId("brand-save").click();
  await page.waitForURL(/\/marca\/[0-9a-f-]+/);
  await page.getByRole("link", { name: "Generar contenido" }).last().click();
  await page.getByTestId("gen-channel-LinkedIn").click();
  await page.getByTestId("gen-topic").fill("monotributo");
  await page.getByTestId("gen-submit").click();
  await expect(page.getByTestId("variant")).toHaveCount(3);
  await expect(page.getByTestId("variant").first()).toContainText("Te respondemos en el día");
});
