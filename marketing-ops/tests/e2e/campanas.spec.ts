import { expect, test } from "@playwright/test";
import { login } from "./helpers";

const fmt = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Mendoza", year: "numeric", month: "2-digit", day: "2-digit" });
const addDays = (day: string, n: number) => {
  const d = new Date(day + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const today = fmt.format(new Date());

test("el Creador arma una campaña, le suma piezas y sale el brief para Meta", async ({ page }) => {
  const name = `Semana del budín ${Date.now()}`;
  await login(page, "creador");
  await page.getByTestId("nav-campanas").click();
  await expect(page.getByTestId("camp-card").filter({ hasText: "Service de primavera" })).toBeVisible();
  await page.getByTestId("camp-new").click();
  await page.getByTestId("camp-brand").selectOption({ label: "La Espiga" });
  await page.getByTestId("camp-name").fill(name);
  await page.getByTestId("camp-goal").selectOption("Vender");
  await page.getByTestId("camp-starts").fill(today);
  await page.getByTestId("camp-ends").fill(addDays(today, 9));
  await page.getByTestId("camp-budget").fill("30000");
  await page.getByTestId("camp-offer").fill("Budín de limón con glaseado");
  await page.getByTestId("camp-save").click();
  await page.waitForURL(/\/campanas\/[0-9a-f-]+\?nueva=1/);
  const url = page.url().replace(/\?.*$/, "");
  await expect(page.getByTestId("page-title")).toHaveText(name);
  await expect(page.getByTestId("brief-objective")).toHaveText("Interacción");
  await expect(page.getByTestId("brief-daily")).toContainText("3.000");
  await expect(page.getByTestId("brief")).toContainText("Budín de limón con glaseado");
  await expect(page.getByTestId("brief-missing")).toContainText("Todavía no tiene piezas");
  await expect(page.getByTestId("camp-history")).toContainText("Creó la campaña · Lucía");

  await page.getByTestId("camp-add-select").selectOption({ index: 1 });
  await page.getByTestId("camp-add").click();
  await expect(page.getByTestId("camp-piece")).toHaveCount(1);

  await page.getByTestId("camp-generate-ad").click();
  await expect(page.getByText(`Pieza para la campaña “${name}”`)).toBeVisible();
  await expect(page.getByTestId("gen-brand")).toBeDisabled();
  await expect(page.getByTestId("gen-offer")).toHaveValue("Budín de limón con glaseado");
  await page.getByTestId("gen-submit").click();
  await expect(page.getByTestId("variant").first()).toContainText("Texto principal:");
  await page.getByTestId("variant").first().getByTestId("variant-save").click();
  await page.waitForURL(/\/contenidos\/[0-9a-f-]+\?nueva=1/);
  await expect(page.getByTestId("content-campaign").locator("option:checked")).toHaveText(name);
  await expect(page.getByTestId("history")).toContainText(`Sumó a la campaña ${name}`);

  await page.goto(url);
  await expect(page.getByTestId("camp-piece")).toHaveCount(2);
  await expect(page.getByText("De las piezas de la campaña")).toBeVisible();
});

test("el Revisor ve la campaña y su brief pero no la edita", async ({ page }) => {
  await login(page, "revisor");
  await page.getByTestId("nav-campanas").click();
  await expect(page.getByTestId("camp-new")).toHaveCount(0);
  await page.getByTestId("camp-card").filter({ hasText: "Día de la Madre" }).click();
  await expect(page.getByTestId("brief-ad").first()).toContainText("Encargala con 48 h de anticipación");
  await expect(page.getByTestId("camp-save")).toHaveCount(0);
  await expect(page.getByTestId("camp-add")).toHaveCount(0);
  await expect(page.getByTestId("camp-name")).toBeDisabled();
  await page.goto("/campanas/nueva");
  await expect(page).toHaveURL(/\/campanas$/);
});

test("un lanzamiento con página propia lleva tráfico ahí, y una pieza propia entra a la campaña sin IA", async ({ page }) => {
  const name = `Abrimos el local ${Date.now()}`;
  await login(page, "creador");
  await page.goto("/campanas/nueva");
  await page.getByTestId("camp-brand").selectOption({ label: "La Espiga" });
  await page.getByTestId("camp-name").fill(name);
  await page.getByTestId("camp-goal").selectOption("Lanzamiento");
  await page.getByTestId("camp-starts").fill(today);
  await page.getByTestId("camp-ends").fill(addDays(today, 6));
  await page.getByTestId("camp-product").fill("Pan de masa madre");
  await page.getByTestId("camp-link").fill("https://laespiga.com.ar/local");
  await page.getByTestId("camp-save").click();
  await page.waitForURL(/\/campanas\/[0-9a-f-]+\?nueva=1/);
  const url = page.url().replace(/\?.*$/, "");
  await expect(page.getByTestId("brief-objective")).toHaveText("Tráfico");
  await expect(page.getByTestId("brief")).toContainText("https://laespiga.com.ar/local");
  await expect(page.getByTestId("brief-ad").first()).toContainText("Pan de masa madre");
  await expect(page.getByTestId("brief-ad").first()).not.toContainText(name);

  await page.getByTestId("camp-own").click();
  await expect(page.getByTestId("own-campaign").locator("option:checked")).toHaveText(name);
  await page.getByTestId("own-format-Anuncio").click();
  await expect(page.getByTestId("own-body")).toHaveValue(/^Texto principal: /);
  await page.getByTestId("own-title").fill("Anuncio del local nuevo");
  await page.getByTestId("own-body").fill("Texto principal: Abrimos en Godoy Cruz con pan de masa madre.\nTítulo: Pan recién salido\nDescripción: La Espiga\nBotón: Más información");
  await page.getByTestId("own-save").click();
  await page.waitForURL(/\/contenidos\/[0-9a-f-]+\?nueva=1/);
  await expect(page.getByTestId("content-campaign").locator("option:checked")).toHaveText(name);

  await page.goto(url);
  await expect(page.getByTestId("camp-piece")).toHaveCount(1);
  await expect(page.getByTestId("brief-ad").first()).toContainText("Abrimos en Godoy Cruz con pan de masa madre.");
});
