import { expect, test } from "@playwright/test";
import { login, USERS, type Name } from "./helpers";

const MENUS: Record<Name, string[]> = {
  Santiago: ["dashboard", "ventas", "canje", "stock", "ingresos", "accesorios", "catalogo", "clientes", "caja", "reportes", "usuarios", "config"],
  Lucía: ["dashboard", "ventas", "canje", "stock", "ingresos", "accesorios", "catalogo", "clientes", "caja", "reportes"],
  Mati: ["dashboard", "ventas", "canje", "stock", "accesorios", "clientes"],
  Caro: ["dashboard", "ventas", "accesorios", "clientes", "caja"],
};

test("sin sesión, cualquier sección manda al login", async ({ page }) => {
  await page.goto("/stock");
  await expect(page).toHaveURL(/\/login$/);
});

test("contraseña incorrecta muestra un error", async ({ page }) => {
  await page.goto("/login");
  await page.getByTestId("login-email").fill(USERS.Mati.email);
  await page.getByTestId("login-password").fill("incorrecta");
  await page.getByTestId("login-submit").click();
  await expect(page.getByTestId("form-error")).toHaveText("Email o contraseña incorrectos.");
});

for (const name of Object.keys(MENUS) as Name[]) {
  test(`${name} (${USERS[name].role}) ve solo su menú`, async ({ page }) => {
    await login(page, name);
    const ids = await page.locator('[data-testid^="nav-"]').evaluateAll((els) => els.map((e) => e.getAttribute("data-testid")!.slice(4)));
    expect(ids).toEqual(MENUS[name]);
  });
}

test("el vendedor que escribe la URL de caja vuelve al dashboard", async ({ page }) => {
  await login(page, "Mati");
  await page.goto("/caja");
  await expect(page).toHaveURL(/\/dashboard$/);
});

test("salir cierra la sesión", async ({ page }) => {
  await login(page, "Lucía");
  await page.getByTestId("logout").click();
  await expect(page).toHaveURL(/\/login$/);
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/login$/);
});
