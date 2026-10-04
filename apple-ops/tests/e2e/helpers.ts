import { expect, type Page } from "@playwright/test";

export const PASSWORD = "demo1234";
export const USERS = {
  Santiago: { email: "santiago@demo.apple-ops.test", role: "Administrador", pin: "1111" },
  Lucía: { email: "lucia@demo.apple-ops.test", role: "Encargado", pin: "2222" },
  Mati: { email: "mati@demo.apple-ops.test", role: "Vendedor", pin: "3333" },
  Caro: { email: "caro@demo.apple-ops.test", role: "Cajero", pin: "4444" },
} as const;
export type Name = keyof typeof USERS;

export async function login(page: Page, name: Name) {
  await page.goto("/login");
  await page.getByTestId("login-email").fill(USERS[name].email);
  await page.getByTestId("login-password").fill(PASSWORD);
  await page.getByTestId("login-submit").click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByTestId("current-user")).toContainText(name);
}
