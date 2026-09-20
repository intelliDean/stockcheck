import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 60_000,
  retries: 0,
  workers: 1, // must be sequential — Surfpool is shared state
  reporter: [
    ["html", { open: "never", outputFolder: "playwright-report" }],
    ["json", { outputFile: "playwright-report/results.json" }],
    ["list"],
  ],
  use: {
    baseURL: "http://127.0.0.1:5173",
    headless: true,
    trace: "on", // always capture traces for evidence
    screenshot: "on",
  },
  projects: [
    {
      name: "stockcheck-e2e",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  // Start reference app before tests, stop after
  webServer: {
    command: "pnpm --filter reference dev",
    url: "http://127.0.0.1:5173",
    reuseExistingServer: !process.env["CI"],
    timeout: 60_000,
  },
  // Required suite must fail if assertions fail
  // Specimen tests are isolated (see playwright.specimens.config.ts)
  forbidOnly: !!process.env["CI"],
});
