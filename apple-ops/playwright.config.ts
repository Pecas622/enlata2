import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.PORT ?? 3000);
// Mercado Pago de mentira (tests/e2e/mp-mock.mjs): la app le pega a este en vez de a la API real.
const MP_MOCK_PORT = 3999;
// ARCA de mentira (tests/e2e/arca-mock.mjs) para la facturación electrónica.
const ARCA_MOCK_PORT = 3998;

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
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] }, testIgnore: /menu-mobile/ },
    { name: "mobile", use: { ...devices["Pixel 7"] }, testMatch: /menu-mobile/ },
  ],
  webServer: [
    {
      command: `node tests/e2e/mp-mock.mjs`,
      url: `http://localhost:${MP_MOCK_PORT}/health`,
      env: { MP_MOCK_PORT: String(MP_MOCK_PORT) },
      reuseExistingServer: !process.env.CI,
    },
    {
      command: `node tests/e2e/arca-mock.mjs`,
      url: `http://localhost:${ARCA_MOCK_PORT}/health`,
      env: { ARCA_MOCK_PORT: String(ARCA_MOCK_PORT) },
      reuseExistingServer: !process.env.CI,
    },
    {
      command: `npm run start -- -p ${PORT}`,
      url: `http://localhost:${PORT}/login`,
      env: {
        MP_API_URL: `http://localhost:${MP_MOCK_PORT}`, MP_ACCESS_TOKEN: "TEST-e2e",
        ARCA_WSAA_URL: `http://localhost:${ARCA_MOCK_PORT}/wsaa`, ARCA_WSFE_URL: `http://localhost:${ARCA_MOCK_PORT}/wsfe`, ARCA_KEY_SECRET: "clave-de-prueba-para-e2e",
      },
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
  ],
});
