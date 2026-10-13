import { loadEnvConfig } from "@next/env";
import { expect, test, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { emitirCertificado } from "../arca-test-ca";
import { login } from "./helpers";

loadEnvConfig(process.cwd());
const service = () => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const ALL = ["imei", "reportes", "catalogo", "asistente", "alertas", "facturacion"];
const STORE = "00000000-0000-4000-8000-000000000001";
const ARCA = "http://localhost:3998";
// Punto de venta propio de esta corrida, para no chocar con la numeración del ARCA de mentira.
const PV = 100 + Math.floor(Math.random() * 9000);

test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  await service().rpc("set_modulos", { p_slug: "demo", p_modules: ALL });
});

test.afterAll(async () => {
  const db = service();
  await db.from("invoices").delete().eq("store_id", STORE);
  await db.from("fiscal_credentials").delete().eq("store_id", STORE);
  await db.from("fiscal_settings").delete().eq("store_id", STORE);
  await db.rpc("set_modulos", { p_slug: "demo", p_modules: ALL });
});

async function venderAccesorio(page: Page) {
  await page.goto("/ventas");
  await page.getByTestId("pos-tab-accesorios").click();
  await page.getByTestId("pos-search").fill("Pop socket");
  await page.getByTestId("pos-acc").first().click();
  await page.getByTestId("pay-rest-0").click();
}

test("el administrador configura la facturación con su certificado de ARCA", async ({ page }) => {
  await login(page, "Santiago");
  await page.goto("/config");
  const card = page.getByTestId("fiscal-card");
  await expect(card).toBeVisible();
  await page.getByTestId("fiscal-razon").fill("Apple Store Mendoza SRL");
  await page.getByTestId("fiscal-cuit").fill("20111111113");
  await page.getByTestId("fiscal-save").click();
  await expect(page.getByTestId("fiscal-msg")).toHaveText("El CUIT no es válido.");
  await page.getByTestId("fiscal-cuit").fill("20111111112");
  await page.getByTestId("fiscal-condicion").selectOption("Responsable Inscripto");
  await page.getByTestId("fiscal-pv").fill(String(PV));
  await page.getByTestId("fiscal-save").click();
  await expect(page.getByTestId("fiscal-msg")).toHaveText("Datos fiscales guardados.");

  await page.getByTestId("fiscal-csr").click();
  await expect(page.getByTestId("fiscal-csr-text")).toHaveValue(/BEGIN CERTIFICATE REQUEST/);
  const csr = await page.getByTestId("fiscal-csr-text").inputValue();

  // Un certificado de otra clave no se acepta.
  const ajeno = emitirCertificado((await import("../../src/lib/arca-cert")).generarClaveYCsr({ cuit: "20111111112", razonSocial: "X", alias: "x" }).csrPem);
  await page.getByTestId("fiscal-cert").fill(ajeno);
  await page.getByTestId("fiscal-cert-save").click();
  await expect(page.getByTestId("fiscal-msg")).toContainText("no es del último pedido");

  await page.getByTestId("fiscal-cert").fill(emitirCertificado(csr));
  await page.getByTestId("fiscal-cert-save").click();
  await expect(page.getByTestId("fiscal-msg")).toHaveText("Certificado guardado.");
  await page.reload();
  await expect(page.getByTestId("fiscal-cert-status")).toContainText("Certificado cargado");
  await page.getByTestId("fiscal-test").click();
  await expect(page.getByTestId("fiscal-msg")).toContainText("Conectado con ARCA. Última factura B autorizada en el punto de venta: 0.");

  // La clave privada no sale de la base: ningún usuario la lee.
  const { data } = await service().from("fiscal_credentials").select("key_enc, cert_pem").eq("store_id", STORE).single();
  expect(data!.key_enc).toMatch(/^v1\./);
  expect(data!.key_enc).not.toContain("PRIVATE KEY");
});

test("cada venta sale con su factura B y anularla emite la nota de crédito", async ({ page }) => {
  await login(page, "Lucía");
  await venderAccesorio(page);
  await expect(page.getByTestId("pos-invoice")).toContainText("Factura B");
  await page.getByTestId("pos-confirm").click();
  await expect(page).toHaveURL(/\/ventas\/[0-9a-f-]+\?nueva=1$/);
  const row = page.getByTestId("invoice-row");
  await expect(row).toContainText("Emitida");
  await expect(row).toContainText(`Factura B ${String(PV).padStart(5, "0")}-00000001`);
  await expect(page.getByTestId("receipt")).not.toContainText("sin validez fiscal");

  const [print] = await Promise.all([page.waitForEvent("popup"), page.getByTestId("invoice-print").click()]);
  await expect(print.getByTestId("factura-letra")).toHaveText("B");
  await expect(print.getByTestId("factura-numero")).toContainText(`Factura B ${String(PV).padStart(5, "0")}-00000001`);
  await expect(print.getByTestId("factura-cae")).toHaveText(/^\d{14}$/);
  await expect(print.locator("[data-testid=factura-qr] svg")).toBeVisible();
  await expect(print.getByText("HOMOLOGACIÓN: SIN VALIDEZ FISCAL")).toBeVisible();
  await print.close();

  await page.getByTestId("void-open").click();
  await page.getByTestId("void-reason").fill("Prueba de nota de crédito");
  await page.getByTestId("void-confirm").click();
  await expect(page.getByTestId("nc-row")).toContainText("Emitida");
  await expect(page.getByTestId("nc-row")).toContainText(`Nota de crédito B ${String(PV).padStart(5, "0")}-00000001`);

  const comps = await (await fetch(`${ARCA}/comprobantes`)).json() as { pv: string; tipo: string; nro: number; asociado: number | null; condicion: string }[];
  const nc = comps.find((c) => c.pv === String(PV) && c.tipo === "8");
  expect(nc).toMatchObject({ nro: 1, asociado: 1, condicion: "5" });
});

test("factura A a un responsable inscripto, con CUIT y razón social", async ({ page }) => {
  await login(page, "Santiago");
  await venderAccesorio(page);
  await page.getByTestId("pos-inv-cond").selectOption("1");
  await expect(page.getByTestId("pos-invoice")).toContainText("Factura A");
  await page.getByTestId("pos-inv-doc").fill("20-11111111-3");
  await expect(page.getByTestId("pos-confirm")).toBeDisabled();
  await page.getByTestId("pos-inv-doc").fill("20-11111111-2");
  await page.getByTestId("pos-inv-name").fill("Empresa Cliente SA");
  await page.getByTestId("pos-confirm").click();
  await expect(page.getByTestId("invoice-row")).toContainText(`Factura A ${String(PV).padStart(5, "0")}-00000001`);
  const [print] = await Promise.all([page.waitForEvent("popup"), page.getByTestId("invoice-print").click()]);
  await expect(print.getByText("Empresa Cliente SA")).toBeVisible();
  await expect(print.getByText("CUIT 20111111112", { exact: false }).last()).toBeVisible();
  await expect(print.getByText("Neto gravado")).toBeVisible();
  await print.close();
});

test("si ARCA no responde, la venta queda registrada y el reintento confirma la misma factura", async ({ page }) => {
  await login(page, "Santiago");
  await venderAccesorio(page);
  await fetch(`${ARCA}/cortar-proxima`, { method: "POST" });
  await page.getByTestId("pos-confirm").click();
  await expect(page).toHaveURL(/\/ventas\/[0-9a-f-]+\?nueva=1$/);
  await expect(page.getByTestId("invoice-row")).toContainText("Pendiente");
  await expect(page.getByTestId("invoice-error")).toContainText("No se pudo conectar con ARCA");
  await page.getByTestId("invoice-retry").click();
  await expect(page.getByTestId("invoice-row")).toContainText("Emitida");
  await expect(page.getByTestId("invoice-row")).toContainText(`Factura B ${String(PV).padStart(5, "0")}-00000002`);
  const comps = await (await fetch(`${ARCA}/comprobantes`)).json() as { pv: string; tipo: string }[];
  expect(comps.filter((c) => c.pv === String(PV) && c.tipo === "6")).toHaveLength(2);
});

test("se puede vender sin factura y facturarla después desde el detalle", async ({ page }) => {
  await login(page, "Santiago");
  await venderAccesorio(page);
  await expect(page.getByTestId("pos-emit-invoice")).toBeChecked();
  await page.getByTestId("pos-emit-invoice").uncheck();
  await expect(page.getByTestId("pos-invoice")).toHaveCount(0);
  await page.getByTestId("pos-confirm").click();
  await expect(page).toHaveURL(/\/ventas\/[0-9a-f-]+\?nueva=1$/);
  await expect(page.getByTestId("invoice-row")).toHaveCount(0);
  await expect(page.getByTestId("receipt")).toContainText("sin validez fiscal");

  await page.getByTestId("invoice-create").click();
  await expect(page.getByTestId("invoice-row")).toContainText("Emitida");
  await expect(page.getByTestId("invoice-row")).toContainText(`Factura B ${String(PV).padStart(5, "0")}-00000003`);
});
