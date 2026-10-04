import { expect, test, viewports } from "./wall";

/*
 * The copy pass (docs/copy.md): the first screen says what Fivehundrd is in
 * one line and how it works in three steps; every call to action says what
 * happens; the same thing is always called the same; and the only numbers
 * are real ones (/api/today), or none.
 */
test.beforeEach(() => test.skip(test.info().project.name === "reference", "approved change: the copy pass"));

const [phone, , desktop] = viewports;
const today = (page: import("@playwright/test").Page, body: unknown) => page.route("**/api/today", (r) => r.fulfill({ json: body }));

for (const viewport of [phone, desktop])
  for (const scheme of ["light", "dark"] as const)
    test.describe(`${viewport.name} ${scheme}`, () => {
      test.use({ viewport: { width: viewport.width, height: viewport.height }, viewportSpec: viewport, colorScheme: scheme, hasTouch: viewport.width < 700 });

      test("the first screen (approved)", async ({ wall, page }) => {
        await today(page, { available: false });
        await wall.goto("", { hero: true });
        const hero = page.locator(".hero");
        await expect(hero.locator(".proof-sub")).toBeVisible();
        await wall.quiet();
        await expect(hero).toHaveScreenshot(["approved", `${viewport.name}-${scheme}-hero.png`]);
      });

      test("the first screen with today's numbers (approved)", async ({ wall, page }) => {
        await today(page, { available: true, visitors: 1284, opened: 3906 });
        await wall.goto("", { hero: true });
        const hero = page.locator(".hero");
        await expect(hero.locator(".proof-n")).toBeVisible();
        await wall.quiet();
        await expect(hero).toHaveScreenshot(["approved", `${viewport.name}-${scheme}-hero-today.png`]);
      });
    });

test.describe("desktop", () => {
  test.use({ viewport: { width: desktop.width, height: desktop.height }, viewportSpec: desktop });

  test("the hero says what this is, without buttons of its own", async ({ wall, page }) => {
    await wall.goto("", { hero: true });
    const hero = page.locator(".hero");
    await expect(hero.locator(".hero-h")).toHaveText("Find what’s next. Before everyone else does.");
    await expect(hero.locator(".hero-sub")).toHaveText("500 spots. 72 hours. New music, creators, books, games and ideas.");
    /* the only button on the first screen is Claim a spot, in today's box */
    await expect(hero.getByRole("button")).toHaveText(["Claim a spot · $9.95 / 72h"]);
    await expect(hero.locator(".steps3-h")).toHaveText("See it. Scout it. Watch what happens.");
    await expect(hero.locator(".steps3 li b")).toHaveText(["1. Discover", "2. Scout", "3. Come back"]);
    await expect(page.locator("#brand .slogan")).toHaveText("Find what’s next.");
  });

  test("Claim a spot on the first screen opens Create, in its words", async ({ wall, page }) => {
    await wall.goto("", { hero: true });
    await page.locator(".proof-cta").click();
    await expect(page.locator("#claimH")).toHaveText("Put it on the Wall.");
    await expect(page.locator("#claimSheet .sub")).toContainText("72 hours. $9.95.");
    await expect(page.locator("#claimSheet .sub")).not.toContainText("follower");
    await expect(page.locator("#claimSheet .promise")).toContainText("People come to Fivehundrd to find things they don’t know yet.");
    await expect(page.locator("#fPay")).toHaveText("Place it · $9.95");
    for (const t of ["Name", "Lane", "Artwork", "Links", "One-line story"]) await expect(page.locator("#cf")).toContainText(t);
  });

  test("the header's call to action", async ({ wall, page }) => {
    await wall.goto();
    await expect(page.locator("#claimTop")).toHaveText("Claim a spot");
  });

  test("an Open Spot invites; its price is in Create, not under the tile", async ({ wall, page }) => {
    await wall.goto();
    const v = page.locator("#rack .spot.vacant").first();
    await expect(v.locator(".v-cta")).toHaveText("Claim this spot");
    /* no price or time under the tile (the demo wall has no lanes per number, so no caption at all) */
    await expect(v.locator(".cap")).not.toContainText("$9.95");
    await expect(v.locator(".cap")).not.toHaveText(/72 ?h/);
    await expect(v.locator(".vbook")).toHaveAttribute("aria-label", /Open Spot .*Put something worth finding here\. Claim this spot: \$9\.95 for 72 hours/);
    await v.locator(".vbook").click();
    await expect(page.locator("#claimVeil")).toHaveClass(/\bon\b/);
  });

  test("today's numbers: real ones only, never announced", async ({ wall, page }) => {
    await today(page, { available: true, visitors: 1284, opened: 3906 });
    await wall.goto("", { hero: true });
    const proof = page.locator(".proof");
    await expect(proof.locator(".proof-h")).toHaveText("Today on Fivehundrd");
    await expect(proof.locator(".proof-n b")).toHaveText(["1,284 visitors", "3,906 discoveries opened"]);
    await expect(proof.locator(".proof-line")).toHaveText("People are here to discover.");
    await expect(proof.locator(".proof-cta")).toHaveText("Claim a spot · $9.95 / 72h");
    /* a live region would announce every refresh */
    await expect(page.locator(".hero [aria-live], .hero [role=status]")).toHaveCount(0);
  });

  test("a quiet day: under 25 visitors no numbers show, and the card keeps its height", async ({ wall, page }) => {
    await today(page, { available: true, visitors: 1284, opened: 3906 });
    await wall.goto("", { hero: true });
    await expect(page.locator(".proof .proof-n")).toBeVisible();
    const busy = (await page.locator(".proof").boundingBox())!.height;
    await page.unroute("**/api/today");
    await today(page, { available: true, visitors: 1, opened: 0 });
    await wall.goto("", { hero: true });
    const proof = page.locator(".proof");
    await expect(proof.locator(".proof-sub")).toBeVisible();
    await expect(proof.locator(".proof-n")).toBeHidden();
    expect(await proof.innerText()).not.toMatch(/\d+ (visitors|discoveries)/);
    expect((await proof.boundingBox())!.height).toBeCloseTo(busy, 0);
  });

  test("today's numbers unavailable: no numbers, no heading that promises them", async ({ wall, page }) => {
    await today(page, { available: false });
    await wall.goto("", { hero: true });
    const proof = page.locator(".proof");
    await expect(proof.locator(".proof-line")).toHaveText("People are here to discover.");
    await expect(proof.locator(".proof-n")).toHaveCount(0);
    await expect(proof.locator(".proof-h")).toHaveCount(0);
    expect(await proof.innerText()).not.toMatch(/\d+ (visitors|discoveries)/);
  });

  test("a returning visitor starts on the wall", async ({ wall, page }) => {
    await page.addInitScript(() => localStorage.setItem("fh-intro", "1"));
    await wall.goto("", { hero: true });
    await expect(page.locator(".hero")).toBeHidden();
  });

  test("one vocabulary: no likes, favorites, saved or finds", async ({ wall, page }) => {
    await wall.goto("", { hero: true });
    /* nothing opens by itself (approved change, 2026-10-01): open the first spot */
    await wall.openTile(0);
    await wall.openView.locator("[data-save]").click();
    const text = await page.locator("body").innerText();
    expect(text).not.toMatch(/\b(My Finds|Finds|Saved|Likes?|Favou?rites?|Bookmarks?|Trending|Listings?|Campaigns?)\b/);
    expect(text).toContain("Your Scouts");
    expect(text).toContain("Kept");
  });

  test("signed in without Scouts yet: where the story starts", async ({ wall, page }) => {
    await page.addInitScript(() => {
      localStorage.setItem("fh-account", JSON.stringify({ via: "Google", remind: true }));
      localStorage.setItem(
        "fh-scout",
        JSON.stringify({ name: null, since: "2026-09-20T00:00:00Z", share: null, status: "building", percentile: null, calls: 0, early: 0, hotspots: 0, settled: 0, minSettled: 10, best: null, moves: [], list: [] }),
      );
    });
    await wall.goto();
    await expect(page.locator("#card .sc-proven")).toHaveText("Your taste, proven over time.");
    /* said once, under Your Scouts, with the way to start (not again in the Scout block) */
    await expect(page.locator("#card .sc-facts")).toHaveCount(0);
    await expect(page.locator('#card b:text-is("Your Scout story starts here.")')).toHaveCount(1);
    await expect(page.locator("#card .sv-empty p")).toHaveText("Your Scout story starts here. Scout a few things you believe in. We’ll remember when you found them.");
    await expect(page.locator("#card .sv-sub")).toHaveText("The things you believed in early.");
  });
});

test.describe("phone", () => {
  test.use({ viewport: { width: phone.width, height: phone.height }, viewportSpec: phone, hasTouch: true });

  test("the first screen fits, is thumb-sized, and doesn't jump when the numbers arrive", async ({ wall, page }) => {
    await page.addInitScript(() => {
      (window as unknown as { cls: number }).cls = 0;
      new PerformanceObserver((l) => {
        for (const e of l.getEntries() as unknown as { value: number; hadRecentInput: boolean }[]) if (!e.hadRecentInput) (window as unknown as { cls: number }).cls += e.value;
      }).observe({ type: "layout-shift", buffered: true });
    });
    /* the numbers are held back until the page has settled (goto's own test styles move things), then measured alone */
    let release!: () => void;
    const held = new Promise<void>((f) => (release = f));
    await page.route("**/api/today", async (r) => {
      await held;
      await r.fulfill({ json: { available: true, visitors: 1284, opened: 3906 } });
    });
    await wall.goto("", { hero: true });
    await page.evaluate(() => ((window as unknown as { cls: number }).cls = 0));
    release();
    await expect(page.locator(".proof-n")).toBeVisible();
    await page.waitForTimeout(300);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(phone.width);
    const small = await page.evaluate(() =>
      [...document.querySelectorAll<HTMLElement>(".hero button")].filter((e) => e.getBoundingClientRect().height < 44).map((e) => e.textContent),
    );
    expect(small).toEqual([]);
    /* the promise and today's box are on the first screen */
    const bottom = await page.evaluate(() => document.querySelector(".proof")!.getBoundingClientRect().bottom);
    expect(bottom).toBeLessThanOrEqual(phone.height - 70);
    expect(await page.evaluate(() => (window as unknown as { cls: number }).cls)).toBeLessThan(0.02);
  });

  test("iPhone pass: small-looking controls are real 44px targets", async ({ wall, page }) => {
    await wall.goto("", { spotlight: true });
    /* the corners of a 44px box around the centre still land on the control */
    const target = (sel: string, i = 0) =>
      page.evaluate(([sel, i]) => {
        const e = document.querySelectorAll<HTMLElement>(sel as string)[i as number];
        e.scrollIntoView({ block: "center" });
        const r = e.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2;
        return [[-21, -21], [21, -21], [-21, 21], [21, 21]].every(([dx, dy]) => { const t = document.elementFromPoint(x + dx, y + dy); return !!t && (t === e || e.contains(t)); });
      }, [sel, i] as const);
    expect(await target("nav.primary a", 0)).toBe(true);
    expect(await target(".sl-tabs button", 0)).toBe(true);
    expect(await target(".sl-tabs button", 1)).toBe(true);
    await wall.showCard();
    expect(await target(".sheet-handle")).toBe(true);
  });

  test("iPhone pass: a returning visitor's wall doesn't jump when Hotspots arrive", async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem("fh-intro", "1");
      (window as unknown as { cls: number }).cls = 0;
      new PerformanceObserver((l) => {
        for (const e of l.getEntries() as unknown as { value: number; hadRecentInput: boolean }[]) if (!e.hadRecentInput) (window as unknown as { cls: number }).cls += e.value;
      }).observe({ type: "layout-shift", buffered: true });
    });
    await page.goto("/?fixture=1");
    await page.waitForSelector("#rack[data-complete]");
    await expect(page.locator(".sl-row")).toBeVisible();
    await page.waitForTimeout(300);
    expect(await page.evaluate(() => (window as unknown as { cls: number }).cls)).toBeLessThan(0.02);
  });

  test("iPhone pass: the promise breaks between its two sentences", async ({ wall, page }) => {
    await wall.goto("", { hero: true });
    const tops = await page.locator(".hero-h span").evaluateAll((els) => els.map((e) => e.getBoundingClientRect().top));
    expect(tops).toHaveLength(2);
    expect(tops[1]).toBeGreaterThan(tops[0]);
  });

  test("the tab bar's Create is Claim", async ({ wall, page }) => {
    await wall.goto();
    await expect(page.locator('.tabbar [data-tab="create"]')).toHaveText("Claim");
  });
});
