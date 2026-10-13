import { expect, test } from "@playwright/test";
import { login } from "./helpers";

// Día local de Argentina, como lo calcula la app.
const fmt = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Mendoza", year: "numeric", month: "2-digit", day: "2-digit" });
const addDays = (day: string, n: number) => {
  const d = new Date(day + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const today = fmt.format(new Date());

test("el Creador cambia una pieza aprobada de día arrastrándola y sigue aprobada", async ({ page }) => {
  const from = addDays(today, 2); // "Jueves de budines", aprobada en el seed
  const to = from.slice(0, 7) === addDays(from, 1).slice(0, 7) ? addDays(from, 1) : addDays(from, -1);
  await login(page, "creador");
  await page.getByTestId("nav-calendario").click();
  await page.goto(`/calendario?mes=${from.slice(0, 7)}`);
  const piece = page.getByTestId(`cal-day-${from}`).getByTestId("cal-piece").filter({ hasText: "Jueves de budines" });
  await expect(piece).toHaveAttribute("data-status", "Aprobado");
  await piece.dragTo(page.getByTestId(`cal-day-${to}`));
  await expect(page.getByTestId(`cal-day-${to}`).getByText("Jueves de budines")).toBeVisible();
  await expect(page.getByTestId("calendar")).toHaveAttribute("aria-busy", "false");
  await page.reload();
  const moved = page.getByTestId(`cal-day-${to}`).getByTestId("cal-piece").filter({ hasText: "Jueves de budines" });
  await expect(moved).toHaveAttribute("data-status", "Aprobado");
  await moved.click();
  await expect(page.getByTestId("history")).toContainText("Programó para el");
  await expect(page.getByTestId("status-Marcar como publicada")).toBeVisible();
});

test("plan del mes: agrega ideas y una se escribe con el generador en la misma pieza", async ({ page }) => {
  await login(page, "creador");
  await page.goto("/calendario");
  await page.getByTestId("cal-next").click();
  await page.waitForURL(/mes=/);
  const month = new URL(page.url()).searchParams.get("mes")!;
  await page.getByTestId("plan-open").click();
  await page.getByTestId("plan-brand").selectOption({ label: "La Espiga" });
  await page.getByTestId("plan-channel-WhatsApp").check();
  await page.getByTestId("plan-refresh").click();
  await expect(page.getByTestId("plan-item").first()).toBeVisible();
  const items = await page.getByTestId("plan-item").count();
  expect(items).toBeGreaterThanOrEqual(8);
  await expect(page.getByTestId("plan-list")).toContainText("WhatsApp");
  // Se puede destildar una; la vuelvo a tildar y agrego todas.
  await page.getByTestId("plan-item").first().click();
  await expect(page.getByTestId("plan-add")).toHaveText(`Agregar ${items - 1} ideas al calendario`);
  await page.getByTestId("plan-item").first().click();
  await page.getByTestId("plan-add").click();
  await page.waitForURL(/agregadas=/);
  expect(new URL(page.url()).searchParams.get("mes")).toBe(month);
  await expect(page.getByText(`Se agregaron ${items} ideas`)).toBeVisible();
  await expect(page.getByTestId("cal-gap")).toHaveCount(0);

  const idea = page.getByTestId("calendar").locator('[data-testid="cal-piece"][data-status="Idea"]').first();
  const title = (await idea.locator("b").textContent())!;
  await idea.click();
  await expect(page.getByTestId("history")).toContainText("Sugerida en el plan del mes · Lucía");
  await page.getByTestId("idea-generate").click();
  await expect(page.getByText(`Escribiendo la idea “${title}”`)).toBeVisible();
  await expect(page.getByTestId("gen-topic")).toHaveValue(title);
  await page.getByTestId("gen-submit").click();
  await expect(page.getByTestId("variant")).toHaveCount(3);
  await page.getByTestId("variant").first().getByTestId("variant-save").click();
  await page.waitForURL(/nueva=1/);
  await expect(page.getByText("Borrador").first()).toBeVisible();
  await expect(page.getByTestId("history")).toContainText("Sugerida en el plan del mes");
  await expect(page.getByTestId("content-editor")).toBeVisible();
});

test("el Revisor ve el calendario pero no mueve piezas ni arma planes", async ({ page }) => {
  await login(page, "revisor");
  await page.getByTestId("nav-calendario").click();
  await expect(page.getByTestId("calendar")).toBeVisible();
  await expect(page.getByTestId("plan-open")).toHaveCount(0);
  await expect(page.getByTestId("cal-piece").first()).toHaveAttribute("draggable", "false");
  await page.goto("/calendario/plan");
  await expect(page).toHaveURL(/\/calendario$/);
});
