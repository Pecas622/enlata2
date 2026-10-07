import { loadEnvConfig } from "@next/env";
import { expect, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { login } from "./helpers";

loadEnvConfig(process.cwd());
const service = () => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const ALL = ["canje", "accesorios", "reportes", "catalogo", "asistente", "alertas"];
const setModules = (mods: string[]) => service().rpc("set_modulos", { p_slug: "demo", p_modules: mods });

test.beforeAll(async () => {
  await setModules(["reportes"]);
});

test.afterAll(async () => {
  await setModules(ALL);
});

test("un local con el plan base y reportes no ve ni usa los módulos que no compró", async ({ page }) => {
  await login(page, "Santiago");
  for (const id of ["canje", "accesorios", "catalogo", "alertas"]) {
    await expect(page.getByTestId(`nav-${id}`)).toHaveCount(0);
    await expect(page.getByTestId(`nav-locked-${id}`)).toBeVisible();
  }
  await expect(page.getByTestId("nav-reportes")).toBeVisible();

  await page.goto("/canje");
  await expect(page).toHaveURL(/\/dashboard$/);

  await page.goto("/ventas");
  await expect(page.getByTestId("pos-tab-equipos")).toBeVisible();
  await expect(page.getByTestId("pos-tab-accesorios")).toHaveCount(0);
  await expect(page.getByTestId("pos-use-tradein")).toHaveCount(0);

  await page.getByTestId("nav-locked-canje").click();
  await expect(page).toHaveURL(/\/config#plan$/);
  await expect(page.getByTestId("plan-reportes")).toContainText("Incluido");
  await expect(page.getByTestId("plan-canje")).toContainText("No incluido");
  await expect(page.getByTestId("fx-source")).toHaveCount(0);

  const res = await page.goto("/catalogo/demo");
  expect(res?.status()).toBe(404);
});

test("el vendedor no ve los módulos bloqueados", async ({ page }) => {
  await login(page, "Mati");
  await expect(page.getByTestId("nav-canje")).toHaveCount(0);
  await expect(page.locator("[data-testid^=nav-locked-]")).toHaveCount(0);
});
