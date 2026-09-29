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
        /* seven across on desktop, five below (the rest are hidden) */
        await expect(sl.locator(".sl-item:visible")).toHaveCount(viewport.width >= 980 ? 7 : 5);
        await wall.quiet();
        await expect(sl).toHaveScreenshot(["approved", `${viewport.name}-${scheme}-hotspots.png`]);
        await sl.getByRole("tab", { name: "Newest" }).click();
        await expect(sl.getByRole("tab", { name: "Newest" })).toHaveAttribute("aria-selected", "true");
        await wall.quiet();
        await expect(sl).toHaveScreenshot(["approved", `${viewport.name}-${scheme}-newest.png`]);
      });
    });

for (const viewport of viewports)
  test.describe(`${viewport.name}: switching Hotspots and Newest`, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height }, viewportSpec: viewport, hasTouch: viewport.width < 700 });

    test("moves nothing below the rail, not by a pixel", async ({ wall, page }) => {
      await wall.goto("", { spotlight: true });
      const tops = () =>
        page.evaluate(() =>
          ["#rack", "#card", "#rack .spot", ".site-foot", ".sl-row"].map((sel) => {
            const e = document.querySelector(sel);
            return e ? e.getBoundingClientRect().top + scrollY : null;
          }),
        );
      const height = () => page.locator(".spotlight").evaluate((e) => e.getBoundingClientRect().height);
      const before = await tops();
      const h = await height();
      for (const name of ["Newest", "Hotspots", "Newest", "Hotspots"]) {
        await page.locator(".sl-tabs").getByRole("tab", { name }).click();
        await expect(page.locator(".sl-tabs").getByRole("tab", { name })).toHaveAttribute("aria-selected", "true");
        expect(await tops()).toEqual(before);
        expect(await height()).toBe(h);
      }
    });
  });

test.describe("the rail on desktop", () => {
  test.use({ viewport: { width: 1400, height: 900 }, viewportSpec: viewports[2] });

  test("seven spots across the card's and the wall's width; one segmented control that doesn't move", async ({ wall, page }) => {
    await wall.goto("", { spotlight: true });
    const row = await page.locator(".sl-row").boundingBox();
    const card = await page.locator("#card").boundingBox();
    const rack = await page.locator("#rack").boundingBox();
    expect(Math.abs(row!.x - card!.x)).toBeLessThanOrEqual(2);
    expect(Math.abs(row!.x + row!.width - (rack!.x + rack!.width))).toBeLessThanOrEqual(2);
    const tabs = () =>
      page.locator(".sl-tabs button").evaluateAll((els) => els.map((e) => { const r = e.getBoundingClientRect(); return [r.top, r.height, r.width]; }));
    const before = await tabs();
    expect(before[0]).toEqual(before[1]);
    await page.locator(".sl-tabs").getByRole("tab", { name: "Newest" }).click();
    expect(await tabs()).toEqual(before);
    await expect(page.locator(".sl-item:visible")).toHaveCount(7);
  });

  test("only the rail's cards are framed: wall tiles look as they did", async ({ wall, page }) => {
    await wall.goto("", { spotlight: true });
    const frame = (sel: string) => page.locator(sel).first().evaluate((e) => getComputedStyle(e, "::before").content);
    expect(await frame(".sl-row .book")).not.toBe("none");
    expect(await frame("#rack .spot:not(.vacant) .book")).toBe("none");
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
    /* ended: when you found it (docs/retention.md) */
    await expect(page.locator(".sq-r")).toHaveText("Found Sep 24");
    await expect(page.locator(".sq-r")).toHaveAttribute("title", "Gone from the wall. You found it on Sep 24.");
    /* live: how early you were */
    await wall.save(1);
    await page.evaluate(() => {
      const saves = JSON.parse(localStorage.getItem("fh-saves")!);
      Object.assign(saves[0], { rank: 7, count: 340 });
      localStorage.setItem("fh-saves", JSON.stringify(saves));
    });
    await wall.goto();
    await expect(page.locator(".sq-r").first()).toHaveText(/^#7 of \d+$/);
    await expect(page.locator(".sq-r").first()).toHaveAttribute("title", /7th to give this a Timeheart\. \d+ people have now/);
  });
});
