import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/browser",
  timeout: 45_000,
  workers: 1,
  outputDir: "artifacts/browser-tests",
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:4190",
    headless: !!process.env.CI,
    viewport: { width: 1440, height: 1000 },
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "node --import tsx tests/fixtures/browser-server.ts",
    url: "http://127.0.0.1:4190/api/projects",
    reuseExistingServer: false,
    timeout: 30_000,
  },
});
