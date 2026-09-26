import { expect, test, viewports } from "./wall";

/*
 * Every state from BUILD_BRIEF §1.3, at 390, 700 and 1400px, light and dark.
 * Screenshots cover the viewport (or the card itself), not the full page, so
 * each one is about the state it names.
 */
/*
 * Screens redesigned on purpose no longer match the reference. They are
 * compared, just as strictly, against approved baselines of the app itself
 * (tests/__baselines__/…/approved/, committed; `pnpm test:approve` rewrites
 * them after a signed-off change).
 */
const approved = (reason: string) => test.skip(test.info().project.name === "reference", `approved change: ${reason}`);

const LANES = ["all", "music", "writers", "games", "art", "podcasts", "letters"] as const;

for (const viewport of viewports) {
  for (const colorScheme of ["light", "dark"] as const) {
    test.describe(`${viewport.name} ${colorScheme}`, () => {
      test.use({
        viewport: { width: viewport.width, height: viewport.height },
        viewportSpec: viewport,
        colorScheme,
        hasTouch: viewport.name === "phone",
      });
      const shot = (state: string) => `${viewport.name}-${colorScheme}-${state}.png`;
      const approvedShot = (state: string) => ["approved", shot(state)];

      test("wall as it loads", async ({ wall, page }) => {
        await wall.goto();
        await wall.quiet();
        await expect(page).toHaveScreenshot(shot("wall-load"));
      });

      test("wall with nothing open", async ({ wall, page }) => {
        await wall.goto();
        await wall.closeOpenTile();
        await wall.quiet();
        await expect(page).toHaveScreenshot(shot("wall-closed"));
      });

      test("a tile open (sheet on phones, inline above)", async ({ wall, page }) => {
        await wall.goto();
        await wall.openTile(1);
        await wall.quiet();
        await expect(page).toHaveScreenshot(shot("tile-open"));
      });

      test("each lane filter", async ({ wall, page }) => {
        await wall.goto();
        for (const lane of LANES) {
          await page.locator(`#lanes [data-lane="${lane}"]`).click();
          await expect(page.locator(`#lanes [data-lane="${lane}"]`)).toHaveClass(/is-active/);
          await wall.quiet();
          await expect(page).toHaveScreenshot(shot(`lane-${lane}`));
        }
      });

      test("search with no matches", async ({ wall, page }) => {
        await wall.goto();
        await page.locator("#q").fill("zzzz");
        await expect(page.locator("#rack .no-hits")).toBeVisible();
        await page.locator("#q").blur();
        await wall.quiet();
        await expect(page).toHaveScreenshot(shot("search-empty"));
      });

      test("create your story (approved)", async ({ wall, page }) => {
        approved("the preview shows the real wall tile");
        await wall.goto();
        await wall.openCreate();
        await wall.quiet();
        await expect(page).toHaveScreenshot(approvedShot("create"));
      });

      test("success screen with the share card (approved)", async ({ wall, page }) => {
        approved("the card is the story share card built from the wall tile");
        await wall.goto();
        await wall.openCreate();
        await page.locator("#fName").fill("Lowtide Club");
        await page.locator("[data-link]").first().fill("open.spotify.com/artist/lowtide");
        await page.locator("#fSnip").fill("Slow songs for the last train home.");
        await page.locator("#fPay").click();
        await expect(page.locator("#claimSheet .card-img")).toBeVisible({ timeout: 10_000 });
        await page.locator("#claimSheet .card-img").evaluate((i: HTMLImageElement) => i.decode());
        await wall.quiet();
        await expect(page).toHaveScreenshot(approvedShot("create-done"));
      });

      test("after Next spot ten times and closing", async ({ wall, page }) => {
        await wall.goto();
        await wall.openTile(0);
        for (let i = 0; i < 10; i++) {
          const no = await wall.openView.getAttribute("data-no");
          await wall.openView.locator("[data-next]").click();
          await expect(wall.openView).not.toHaveAttribute("data-no", no ?? "");
        }
        await wall.closeOpenTile();
        await wall.quiet();
        await expect(page).toHaveScreenshot(shot("next-then-close"));
      });

      test("share sheet (approved)", async ({ wall, page }) => {
        approved("the share sheet carries the spot's card");
        await wall.goto();
        await wall.openTile(0);
        await wall.openView.locator("[data-share]").click();
        await expect(page.locator("#shareVeil")).toHaveClass(/\bon\b/);
        await expect(page.locator("#shareSheet .sc-preview img")).toBeVisible({ timeout: 10_000 });
        await page.locator("#shareSheet .sc-preview img").evaluate((i: HTMLImageElement) => i.decode());
        await wall.quiet();
        await expect(page).toHaveScreenshot(approvedShot("share"));
      });

      for (const saves of [0, 3, 13]) {
        test(`fivehundrd card with ${saves} saves`, async ({ wall }) => {
          await wall.goto();
          await wall.save(saves);
          const card = await wall.showCard();
          await wall.quiet();
          await expect(card).toHaveScreenshot(shot(`card-${saves}-saves`));
        });
      }

      test("footer in view", async ({ wall, page }) => {
        await wall.goto();
        await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
        await expect(page.locator(".site-foot")).toBeInViewport();
        await wall.quiet();
        await expect(page).toHaveScreenshot(shot("footer"));
      });
    });
  }
}
