import type { Page } from "@playwright/test";

export const USERS = {
  admin: "santiago@demo.marketing-ops.test",
  creador: "lucia@demo.marketing-ops.test",
  revisor: "mati@demo.marketing-ops.test",
} as const;

export async function login(page: Page, who: keyof typeof USERS) {
  await page.goto("/login");
  await page.getByTestId("login-email").fill(USERS[who]);
  await page.getByTestId("login-password").fill("demo1234");
  await page.getByTestId("login-submit").click();
  await page.waitForURL("**/inicio");
}

export async function logout(page: Page) {
  await page.getByTestId("logout").click();
  await page.waitForURL("**/login");
}
