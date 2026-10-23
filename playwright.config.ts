import { defineConfig, devices } from "@playwright/test";

const PORT = 3100;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: [["list"]],
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: {
    // Reset first: the database must not be unlinked while a server holds it open.
    command: `node scripts/reset-e2e-db.mjs && npx next dev -H 0.0.0.0 -p ${PORT}`,
    url: `http://127.0.0.1:${PORT}/api/health`,
    reuseExistingServer: false,
    timeout: 180_000,
    env: {
      MORPH_DB_PATH: "./data/e2e.db",
      MORPH_DEMO_PASSWORD: "morph-demo",
      MORPH_ALLOW_SIGNUP: "true",
    },
  },
  projects: [
    {
      name: "chromium",
      testIgnore: /responsive\.spec\.ts/,
      use: { ...devices["Desktop Chrome"] },
    },
    {
      // Chromium mobile emulation. WebKit is not installed in CI images that
      // lack Safari's shared libraries, so the layout test runs on Chromium.
      name: "mobile",
      testMatch: /responsive\.spec\.ts/,
      use: { ...devices["Pixel 7"] },
    },
  ],
});
