import { loadEnvConfig } from "@next/env";
import { expect, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { login } from "./helpers";

loadEnvConfig(process.cwd());
const service = () => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });

const email = `demo-e2e-${Date.now()}@prueba.test`;
const password = "demo1234";
let userId = "";
let storeId = "";

test.beforeAll(async () => {
  const { data: u } = await service().auth.admin.createUser({ email, password, email_confirm: true });
  userId = u.user!.id;
  storeId = (await service().rpc("crear_local", { p_name: "Digital Demo", p_slug: `digital-${Date.now()}`, p_admin: userId, p_admin_name: "Valen", p_pin: "1234" })).data;
});

test.afterAll(async () => {
  if (userId) await service().auth.admin.deleteUser(userId);
  if (storeId) await service().from("stores").delete().eq("id", storeId);
});

test("el administrador carga la demo para mostrarla y la borra para entregar el local", async ({ page }) => {
  await page.goto("/login");
  await page.getByTestId("login-email").fill(email);
  await page.getByTestId("login-password").fill(password);
  await page.getByTestId("login-submit").click();
  await expect(page).toHaveURL(/\/dashboard$/);

  await page.goto("/config");
  await page.getByTestId("demo-load").click();
  await expect(page.getByTestId("demo-clear")).toBeVisible();
  await page.goto("/stock");
  await expect(page.getByText("iPhone 15 Pro 256GB").first()).toBeVisible();
  await page.goto("/clientes");
  await expect(page.getByText("María Gómez").first()).toBeVisible();

  await page.goto("/config");
  await page.getByTestId("demo-clear").click();
  await expect(page.getByTestId("demo-clear-confirm")).toBeDisabled();
  await page.getByTestId("demo-confirm").fill("borrar");
  await page.getByTestId("demo-clear-confirm").click();
  await expect(page.getByTestId("demo-load")).toBeVisible();
  await page.goto("/stock");
  await expect(page.getByText("iPhone 15 Pro 256GB")).toHaveCount(0);
  await page.goto("/clientes");
  await expect(page.getByText("María Gómez")).toHaveCount(0);
});

test("el local de prueba muestra que tiene demo cargada", async ({ page }) => {
  await login(page, "Santiago");
  await page.goto("/config");
  await expect(page.getByTestId("demo-card")).toContainText("datos de demostración");
  await expect(page.getByTestId("demo-clear")).toBeVisible();
  await expect(page.getByTestId("demo-load")).toHaveCount(0);
});
