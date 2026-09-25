import { defineConfig } from "@playwright/test";
import type { WallOptions } from "./tests/wall";

/**
 * Visual parity (BUILD_BRIEF §1.3).
 *
 * The `reference` project renders the approved prototype and writes the
 * baselines; the `app` project renders the production page and is compared
 * against them. Both share one snapshot path, so run `reference` with
 * `--update-snapshots=all` first (`pnpm test:e2e` does both).
 */
export default defineConfig<WallOptions>({
  testDir: "./tests",
  timeout: 90_000,
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  reporter: "list",
  snapshotPathTemplate: "{testDir}/__baselines__/{testFilePath}/{arg}{ext}",
  expect: {
    toHaveScreenshot: {
      maxDiffPixelRatio: 0.001,
      /* Playwright defaults to 0.2, which accepts #0d0d0d rendered as #3a3a3a. */
      threshold: 0,
      animations: "disabled",
      caret: "hide",
      scale: "css",
    },
  },
  use: {
    baseURL: "http://127.0.0.1:3000",
    reducedMotion: "reduce",
    timezoneId: "UTC",
    locale: "en-GB",
    /* Use a preinstalled Chromium instead of Playwright's download. */
    launchOptions: process.env.CHROMIUM_PATH
      ? { executablePath: process.env.CHROMIUM_PATH }
      : {},
  },
  projects: [
    { name: "reference", use: { wallPath: "/reference.html" } },
    { name: "app", use: { wallPath: "/" } },
  ],
  webServer: {
    command: "pnpm dev",
    url: "http://127.0.0.1:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
