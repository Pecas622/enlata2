// Venta online: alta de un local nuevo con el plan base y compra de un módulo, contra un Mercado Pago
// de mentira (mp-mock.mjs). El local entra recién cuando el pago está confirmado.
import { loadEnvConfig } from "@next/env";
import { expect, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

loadEnvConfig(process.cwd());
const service = () => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const MOCK = "http://localhost:3999";
const slug = `local-e2e-${Date.now().toString(36)}`;
const email = `${slug}@alta.apple-ops.test`;

test.afterAll(async () => {
  const db = service();
  const { data: cs } = await db.from("catalog_settings").select("store_id").eq("slug", slug).maybeSingle();
  const { data: users } = await db.auth.admin.listUsers();
  const user = users?.users.find((u) => u.email === email);
  if (cs) await db.from("stores").delete().eq("id", cs.store_id);
  if (user) await db.auth.admin.deleteUser(user.id);
});

test("un local nuevo se da de alta, paga el plan base y después suma un módulo", async ({ page, request }) => {
  await page.goto("/alta");
  await expect(page.getByTestId("alta-precios")).toContainText("Plan base");
  await page.getByTestId("alta-store").fill("Local E2E");
  await expect(page.getByTestId("alta-slug")).toHaveValue("local-e2e");
  await page.getByTestId("alta-slug").fill(slug);
  await page.getByTestId("alta-name").fill("Dueña E2E");
  await page.getByTestId("alta-email").fill(email);
  await page.getByTestId("alta-password").fill("clave-segura-1");
  await page.getByTestId("alta-pin").fill("5555");
  await page.getByTestId("alta-submit").click();

  // Mercado Pago: sin pagar, el local no entra a la app.
  await expect(page).toHaveURL(new RegExp(`^${MOCK}/checkout/`));
  await expect(page.getByTestId("mp-monto")).toHaveText("$ 29900");
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/plan$/);
  await expect(page.getByTestId("plan-pendiente")).toContainText("Falta activar Local E2E");

  await page.getByTestId("plan-pagar-base").click();
  await expect(page).toHaveURL(new RegExp(`^${MOCK}/checkout/`));
  await page.getByTestId("mp-pagar").click();
  await expect(page).toHaveURL(/\/dashboard$/);

  // Nace solo con la base: suma Reportes desde Tu plan.
  await expect(page.getByTestId("nav-reportes")).toHaveCount(0);
  await page.goto("/config#plan");
  await expect(page.getByTestId("plan-asistente")).toContainText("No incluido");
  await page.getByTestId("plan-sumar-reportes").click();
  await expect(page).toHaveURL(new RegExp(`^${MOCK}/checkout/`));
  await page.getByTestId("mp-pagar").click();
  await expect(page).toHaveURL(/\/config\?pago=ok#plan$/);
  await expect(page.getByTestId("plan-reportes")).toContainText("Incluido");
  await expect(page.getByTestId("nav-reportes")).toBeVisible();

  // Catálogo: lo activa la notificación de Mercado Pago (webhook), sin volver por /plan.
  await page.getByTestId("plan-sumar-catalogo").click();
  await expect(page).toHaveURL(new RegExp(`^${MOCK}/checkout/`));
  const id = page.url().split("/checkout/")[1];
  await request.post(`${MOCK}/checkout/${id}`, { maxRedirects: 0 });
  const res = await request.post(`/api/mercadopago?type=subscription_preapproval&data.id=${id}`, { data: { type: "subscription_preapproval", data: { id } } });
  expect(res.ok()).toBe(true);
  await page.goto("/config#plan");
  await expect(page.getByTestId("plan-catalogo")).toContainText("Incluido");
  await expect(page.getByTestId("plan-sumar-asistente")).toBeVisible();

  const { data: log } = await service().from("audit_log").select("user_name, detail").eq("user_name", "Mercado Pago").ilike("detail", "catálogo%");
  expect(log?.length).toBeGreaterThan(0);
});

test("el alta no deja usar un link ocupado", async ({ page }) => {
  await page.goto("/alta");
  await page.getByTestId("alta-store").fill("Otro");
  await page.getByTestId("alta-slug").fill("demo");
  await page.getByTestId("alta-name").fill("Alguien");
  await page.getByTestId("alta-email").fill("otro@alta.apple-ops.test");
  await page.getByTestId("alta-password").fill("clave-segura-1");
  await page.getByTestId("alta-pin").fill("1234");
  await page.getByTestId("alta-submit").click();
  await expect(page.getByTestId("form-error")).toHaveText("El link /catalogo/demo ya lo usa otro local. Probá con otro.");
});
