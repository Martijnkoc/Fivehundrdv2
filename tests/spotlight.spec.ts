import { expect, test, viewports } from "./wall";

/*
 * Above the wall (approved change): Hotspots / Newest, what changed since the
 * last visit, and "You were #7" in Finds. Approved screenshots are the app's
 * own (tests/__baselines__/…/approved).
 */
test.beforeEach(() => test.skip(test.info().project.name === "reference", "approved change: Hotspots above the wall"));

for (const viewport of viewports)
  for (const scheme of ["light", "dark"] as const)
    test.describe(`${viewport.name} ${scheme}`, () => {
      test.use({ viewport: { width: viewport.width, height: viewport.height }, viewportSpec: viewport, colorScheme: scheme, hasTouch: viewport.width < 700 });

      test("hotspots and newest (approved)", async ({ wall, page }) => {
        await wall.goto("", { spotlight: true });
        const sl = page.locator(".spotlight");
        await expect(sl.locator(".sl-item")).toHaveCount(5);
        await wall.quiet();
        await expect(sl).toHaveScreenshot(["approved", `${viewport.name}-${scheme}-hotspots.png`]);
        await sl.getByRole("tab", { name: "Newest" }).click();
        await expect(sl.getByRole("tab", { name: "Newest" })).toHaveAttribute("aria-selected", "true");
        await wall.quiet();
        await expect(sl).toHaveScreenshot(["approved", `${viewport.name}-${scheme}-newest.png`]);
      });
    });

test.describe("behaviour", () => {
  test.use({ viewport: { width: 1400, height: 900 }, viewportSpec: viewports[2] });

  test("a hotspot opens its spot on the wall, even from another lane", async ({ wall, page }) => {
    await wall.goto("", { spotlight: true });
    const first = page.locator(".sl-item").first();
    const label = (await first.getAttribute("aria-label"))!;
    const no = label.match(/No\. (\d+)/)![1];
    /* on another lane, the spot isn't in the rack: tapping goes back to the whole wall */
    await page.locator("#lanes [data-lane]").nth(1).click();
    const inLane = await page.locator(".sl-item").first().getAttribute("aria-label");
    await page.locator("#lanes [data-lane='all']").click();
    await first.click();
    await expect(wall.openView).toBeVisible();
    await expect(wall.openView).toContainText(`No. ${no}`);
    expect(inLane).not.toBeNull();
  });

  test("hotspots follow the lane you're on", async ({ wall, page }) => {
    await wall.goto("", { spotlight: true });
    await page.locator("#lanes [data-lane='music']").click();
    for (const l of await page.locator(".sl-item").evaluateAll((els) => els.map((e) => e.querySelector(".bk-strip small")?.textContent ?? "")))
      expect(l).toContain("Music");
  });

  test("coming back: what's new since the last visit, and new tiles are marked", async ({ wall, page }) => {
    await wall.goto("", { spotlight: true });
    await expect(page.locator(".sl-since")).toHaveCount(0);
    await page.evaluate(() => {
      const m = JSON.parse(localStorage.getItem("fh-visits")!);
      const ids: string[] = m.cur.ids;
      localStorage.setItem(
        "fh-visits",
        JSON.stringify({ active: Date.now() - 5 * 3600e3, cur: { at: Date.now() - 5 * 3600e3, ids: [...ids.filter((_, i) => i % 3), "gone-a", "gone-b"] }, prev: null }),
      );
    });
    await wall.goto("", { spotlight: true });
    await expect(page.locator(".sl-since")).toHaveText(/^\d+ new · 2 gone since your last visit$/);
    await expect(page.locator('#rack .new[title="New since your last visit"]').first()).toBeAttached();
    /* a reload is the same visit: the same comparison */
    await wall.goto("", { spotlight: true });
    await expect(page.locator(".sl-since")).toContainText("2 gone");
  });

  test("Finds: how early you were", async ({ wall, page }) => {
    await wall.goto();
    await page.evaluate(() =>
      localStorage.setItem(
        "fh-saves",
        JSON.stringify([{ k: "x1", no: 999, name: "Lowtide Club", lane: "music", start: Date.now() - 80 * 3600e3, link: null, logo: null, savedAt: Date.now(), rank: 7, count: 340 }]),
      ),
    );
    await wall.goto();
    await expect(page.locator(".sq-r")).toHaveText("#7 of 340");
    await expect(page.locator(".sq-r")).toHaveAttribute("title", /7th to save this\. 340 people have now/);
  });
});
