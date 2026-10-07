import { loadEnvConfig } from "@next/env";
import { expect, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { login } from "./helpers";

loadEnvConfig(process.cwd());
const service = () => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const ALL = ["imei", "reportes", "catalogo", "asistente", "alertas"];
const setModules = (mods: string[]) => service().rpc("set_modulos", { p_slug: "demo", p_modules: mods });

test.beforeAll(async () => {
  await setModules(["reportes"]);
});

test.afterAll(async () => {
  await setModules(ALL);
});

test("un local con el plan base y reportes no ve ni usa los módulos que no compró", async ({ page }) => {
  await login(page, "Santiago");
  for (const id of ["catalogo", "alertas"]) {
    await expect(page.getByTestId(`nav-${id}`)).toHaveCount(0);
    await expect(page.getByTestId(`nav-locked-${id}`)).toBeVisible();
  }
  for (const id of ["canje", "accesorios", "reportes"]) await expect(page.getByTestId(`nav-${id}`)).toBeVisible();

  await page.goto("/alertas");
  await expect(page).toHaveURL(/\/dashboard$/);

  await page.goto("/stock");
  await expect(page.getByTestId("stock-table")).not.toContainText("IMEI");
  await page.goto("/ingresos");
  await expect(page.getByText("IMEI (15 dígitos) (opcional)")).toBeVisible();

  await page.getByTestId("nav-locked-catalogo").click();
  await expect(page).toHaveURL(/\/config#plan$/);
  await expect(page.getByTestId("plan-reportes")).toContainText("Incluido");
  await expect(page.getByTestId("plan-imei")).toContainText("No incluido");
  await expect(page.getByTestId("fx-source")).toHaveCount(0);

  const res = await page.goto("/catalogo/demo");
  expect(res?.status()).toBe(404);
});

test("el vendedor no ve los módulos bloqueados", async ({ page }) => {
  await login(page, "Mati");
  await expect(page.getByTestId("nav-canje")).toBeVisible();
  await expect(page.locator("[data-testid^=nav-locked-]")).toHaveCount(0);
});
