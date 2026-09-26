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
      /* Zero tolerance: not one pixel may differ from the reference.
         (Stricter than the brief's maxDiffPixelRatio 0.001.) Playwright's
         default per-pixel threshold of 0.2 would even accept #0d0d0d
         rendered as #3a3a3a. */
      maxDiffPixels: 0,
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
    launchOptions: {
      /* Chrome re-rasters only the changed part of a layer on repaint. The
         anti-aliasing at that part's edge then depends on the page's paint
         history, which moved a search-box corner by one colour step between
         otherwise identical pages. Full-tile raster makes the pixels depend
         on the content alone. */
      args: ["--disable-partial-raster"],
      /* Use a preinstalled Chromium instead of Playwright's download. */
      ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
    },
  },
  projects: [
    { name: "reference", use: { wallPath: "/reference.html" } },
    { name: "app", use: { wallPath: "/" } },
  ],
  /* The production build, as visitors get it; SERVE_REFERENCE=1 lets it
     serve /reference.html for the baselines. */
  webServer: {
    command: "pnpm build && SERVE_REFERENCE=1 pnpm start",
    url: "http://127.0.0.1:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 300_000,
  },
});
