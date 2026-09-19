import { defineConfig, devices } from "@playwright/test";

/**
 * Specimen test config — runs the deliberately faulty application modes.
 *
 * Tests here SHOULD produce FAIL verdicts from StockCheck.
 * CI uses this to assert "the checker correctly detected this seeded defect."
 *
 * This config is intentionally separate from playwright.config.ts so that
 * CI can: pass the required suite AND pass specimens (by asserting on FAIL).
 * A detected bad transfer is never converted to a compatibility PASS.
 */
export default defineConfig({
  testDir: "./tests/specimens",
  timeout: 60_000,
  retries: 0,
  workers: 1,
  reporter: [
    ["html", { open: "never", outputFolder: "playwright-report-specimens" }],
    ["json", { outputFile: "playwright-report-specimens/results.json" }],
    ["list"],
  ],
  use: {
    baseURL: "http://localhost:5173",
    headless: true,
    trace: "on",
    screenshot: "on",
  },
  projects: [
    {
      name: "stockcheck-specimens",
      use: { ...devices["Desktop Chrome"], channel: "chrome" },
    },
  ],
  webServer: {
    command: "pnpm --filter reference dev",
    url: "http://localhost:5173",
    reuseExistingServer: !process.env["CI"],
  },
  forbidOnly: !!process.env["CI"],
});
