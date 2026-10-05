import { expect, test } from "@playwright/test";
import { login } from "./helpers";

// PNG de 2×2 píxeles.
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGP8z8DAwMDAxMDAwMDAAAANHQEDasKb6QAAAABJRU5ErkJggg==", "base64");

test("la encargada sube la foto de un equipo y se ve en el catálogo", async ({ page }) => {
  await login(page, "Lucía");
  await page.goto("/catalogo");
  const row = page.getByTestId("cat-device-row").filter({ hasText: "iPhone 14 Pro 256GB" });
  const id = (await row.locator("[data-testid^='photo-input-']").getAttribute("data-testid"))!.replace("photo-input-", "");
  await row.getByTestId(`photo-input-${id}`).setInputFiles({ name: "foto.png", mimeType: "image/png", buffer: PNG });
  const thumb = row.getByTestId(`photo-${id}`).getByTestId("device-photo");
  await expect(thumb).toHaveAttribute("src", /\/storage\/v1\/object\/public\/fotos-equipos\/.+\.png$/);

  await page.goto("/catalogo/demo");
  const card = page.getByTestId("cat-item").filter({ hasText: "iPhone 14 Pro 256GB" });
  const img = card.getByTestId("device-photo");
  await expect(img).toBeVisible();
  await expect.poll(() => img.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth)).toBe(2);

  await page.goto("/catalogo");
  await row.getByTestId(`photo-remove-${id}`).click();
  await expect(row.getByTestId(`photo-${id}`).getByTestId("device-photo")).toHaveCount(0);
  await page.goto("/catalogo/demo");
  await expect(page.getByTestId("cat-item").filter({ hasText: "iPhone 14 Pro 256GB" }).getByTestId("device-photo")).toHaveCount(0);
});

test("una foto que no es imagen se rechaza", async ({ page }) => {
  await login(page, "Lucía");
  await page.goto("/catalogo");
  const row = page.getByTestId("cat-device-row").first();
  const input = row.locator("[data-testid^='photo-input-']");
  await input.setInputFiles({ name: "nota.txt", mimeType: "text/plain", buffer: Buffer.from("hola") });
  await expect(row.getByRole("alert")).toHaveText("La foto tiene que ser JPG, PNG o WebP.");
});
