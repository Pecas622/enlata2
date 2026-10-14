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

test("plan del mes: arma el mes completo y las piezas entran como borradores con su plan", async ({ page }) => {
  await login(page, "creador");
  await page.goto("/calendario");
  await page.getByTestId("cal-next").click();
  await page.waitForURL(/mes=/);
  const month = new URL(page.url()).searchParams.get("mes")!;
  await page.getByTestId("plan-open").click();
  await page.getByTestId("plan-brand").filter({ hasText: "La Espiga" }).click();
  await page.waitForURL(/marca=/);
  await expect(page.getByTestId("plan-settings")).toContainText("Instagram, WhatsApp");
  await expect(page.getByTestId("plan-none")).toBeVisible();
  await page.getByTestId("plan-build").click();
  await expect(page.getByTestId("plan-item").first()).toBeVisible();
  await expect(page.getByTestId("plan-summary")).toContainText("La Espiga");
  const items = await page.getByTestId("plan-item").count();
  expect(items).toBeGreaterThanOrEqual(8);
  await expect(page.getByTestId("plan-list")).toContainText("WhatsApp");
  await expect(page.getByTestId("plan-item").first()).toContainText("Por qué:");
  await page.getByTestId("plan-item").first().getByText("Gancho, guion, texto y recursos").click();
  await expect(page.getByTestId("plan-item").first()).toContainText("Recursos");
  // Destildo una y agrego el resto.
  await page.getByTestId("plan-check").first().uncheck();
  await expect(page.getByTestId("plan-add")).toHaveText(`Agregar ${items - 1} piezas al calendario`);
  await page.getByTestId("plan-add").click();
  await page.waitForURL(/agregadas=/);
  expect(new URL(page.url()).searchParams.get("mes")).toBe(month);
  await expect(page.getByText(`Se agregaron ${items - 1} piezas del plan`)).toBeVisible();

  const piece = page.getByTestId("calendar").locator('[data-testid="cal-piece"][data-status="Borrador"]').first();
  await expect(piece.locator("small")).toContainText(/\d{2}:\d{2} ·/);
  await piece.click();
  await expect(page.getByTestId("history")).toContainText("Planificada con plantilla · Lucía");
  await expect(page.getByTestId("content-body")).not.toHaveValue("");
  await expect(page.getByTestId("content-hook")).not.toHaveValue("");
  await expect(page.getByTestId("content-rationale")).not.toHaveValue("");
  await expect(page.getByTestId("content-time")).toHaveValue(/\d{2}:\d{2}/);

  // El plan recuerda lo que ya pasó al calendario; la que destildé se puede sumar después.
  await page.goto(`/calendario/plan?mes=${month}&marca=00000000-0000-4000-8000-0000000000b1`);
  await expect(page.getByTestId("plan-added")).toHaveCount(items - 1);
  await expect(page.getByTestId("plan-add")).toHaveText("Agregar 1 pieza al calendario");
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
