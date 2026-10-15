import { defineConfig, devices } from "@playwright/test";
import { E2E_TOKENS_KEY, IG_PORT } from "./tests/e2e/env";

const PORT = Number(process.env.PORT ?? 3100);

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
    launchOptions: process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {},
  },
  projects: [{ name: "desktop", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      // Sin ANTHROPIC_API_KEY: el generador usa las plantillas y el test no depende de la IA.
      // Una app de Instagram de mentira: el botón de conectar arma bien el pedido (el test corta antes de salir) y
      // publicar habla con el Instagram de mentira de abajo, nunca con el real.
      command: `npm run start -- -p ${PORT}`,
      url: `http://localhost:${PORT}/login`,
      env: {
        ANTHROPIC_API_KEY: "", INSTAGRAM_APP_ID: "e2e-app", INSTAGRAM_APP_SECRET: "e2e-secret", TOKENS_KEY: E2E_TOKENS_KEY,
        INSTAGRAM_GRAPH_URL: `http://localhost:${IG_PORT}`, CRON_SECRET: "e2e-cron",
      },
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
    { command: `node tests/e2e/instagram-falso.mjs`, url: `http://localhost:${IG_PORT}/__pedidos`, env: { IG_FAKE_PORT: String(IG_PORT) }, reuseExistingServer: !process.env.CI },
  ],
});
