import { defineConfig, devices } from "@playwright/test";

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
  webServer: {
    // Sin ANTHROPIC_API_KEY: el generador usa las plantillas y el test no depende de la IA.
    command: `npm run start -- -p ${PORT}`,
    url: `http://localhost:${PORT}/login`,
    env: { ANTHROPIC_API_KEY: "" },
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
