import { expect, test, viewports } from "./wall";

/*
 * Retention (docs/retention.md): the one line of history under each Find,
 * the one personal thing "since your last visit" says. (Call it became the
 * Scout Timeheart, docs/scout.md; its old calls still show in the history.) The
 * history normally comes from the database (/api/finds); on the fixture wall
 * it is seeded into the browser's copy (fh-finds).
 */
test.beforeEach(() => test.skip(test.info().project.name === "reference", "approved change: retention"));

const SEP24 = Date.UTC(2026, 8, 24, 12);

test.describe("behaviour", () => {
  test.use({ viewport: { width: 1400, height: 900 }, viewportSpec: viewports[2] });

  test("Finds: one line of history each, the most meaningful one", async ({ wall, page }) => {
    await wall.goto();
    await wall.save(3);
    await page.evaluate(
      ([t, h]) => {
        const keys: string[] = JSON.parse(localStorage.getItem("fh-saves")!).map((x: { k: string }) => x.k);
        const st = (id: string, extra: object) => ({ id, savedAt: null, rank: 1, savers: 1, saves: 1, hotAt: null, endsAt: null, gone: false, early: false, call: null, back: null, ...extra });
        localStorage.setItem(
          "fh-finds",
          JSON.stringify({
            [keys[0]]: st(keys[0], { call: { calledAt: new Date(t - 20 * h).toISOString(), outcome: "hotspot", outcomeAt: new Date(t - 6 * h).toISOString(), savesThen: 4, rank: 3 } }),
            [keys[1]]: st(keys[1], { early: true, rank: 23, savers: 400, saves: 1284, savedAt: new Date(t - 30 * h).toISOString() }),
            [keys[2]]: st(keys[2], { back: { id: "b", lane: "music", no: 212, slug: "abcdefgh", name: "Lowtide Club" } }),
          }),
        );
        return keys;
      },
      [SEP24, 3600e3] as const,
    );
    await wall.goto();
    const lines = page.locator("#card .sq-r");
    /* Finds are ordered by time left, so compare as a set */
    await expect(lines).toHaveCount(3);
    expect((await lines.allInnerTexts()).sort()).toEqual(["Called 3rd · 14h early", "Found at 23 · now 1,284", "Maker is back"].sort());
    await expect(page.locator("#card .sq-r.called")).toHaveAttribute("title", "You called this 14 hours before it became a Hotspot. You were the 3rd to call it.");
    await expect(page.locator("#card .sq-r.early")).toHaveAttribute("title", /You were the 23rd to give this a Timeheart, among the first 10% of the people who did\. 1,284 keep it now\./);
  });

  test("since your last visit: the wall's news plus one thing that changed for you", async ({ wall, page }) => {
    await wall.goto("", { spotlight: true });
    await wall.save(1);
    const key = await page.evaluate(
      ([t, h]) => {
        const k: string = JSON.parse(localStorage.getItem("fh-saves")!)[0].k;
        const m = JSON.parse(localStorage.getItem("fh-visits")!);
        const at = t - 5 * h;
        localStorage.setItem("fh-visits", JSON.stringify({ active: at, cur: { at, ids: m.cur.ids.filter((_: string, i: number) => i % 3) }, prev: null }));
        localStorage.setItem(
          "fh-finds",
          JSON.stringify({
            [k]: { id: k, savedAt: null, rank: 1, savers: 1, saves: 1, hotAt: null, endsAt: null, gone: false, early: false, back: null,
                   call: { calledAt: new Date(t - 20 * h).toISOString(), outcome: "hotspot", outcomeAt: new Date(t - 2 * h).toISOString(), savesThen: 1 } },
          }),
        );
        return k;
      },
      [SEP24, 3600e3] as const,
    );
    expect(key).toBeTruthy();
    const no = await wall.openView.getAttribute("data-no");
    await wall.goto("", { spotlight: true });
    await expect(page.locator(".sl-since")).toHaveText(/^\d+ new since your last visit · Something you called became a Hotspot$/);
    await page.locator(".sl-mine").click();
    await expect(wall.openView).toBeVisible();
    await expect(wall.openView).toHaveAttribute("data-no", no!);
  });
});

/* The maker's journey, start to finish: Create, pay, see it, share it, come back. */
for (const viewport of [viewports[2], viewports[0]])
  test.describe(`maker journey, ${viewport.name}`, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height }, viewportSpec: viewport, hasTouch: viewport.width < 700 });
    test("from Create to their own spot on the wall, and first in Newest on the next visit", async ({ wall, page }) => {
      await wall.goto("", { spotlight: true });
      await wall.openCreate();
      if (wall.createsInSteps) {
        await page.locator(".st-lane", { hasText: "Music" }).click();
        await page.locator(".st-next").click();
        await page.locator("#fName").fill("Lowtide Club");
        await page.locator(".st-next").click();
        await page.locator(".st-next").click();
        await page.locator("[data-link]").first().fill("open.spotify.com/artist/lowtide");
        await page.locator(".st-next").click();
      } else {
        await page.locator("#fName").fill("Lowtide Club");
        await page.locator("[data-link]").first().fill("open.spotify.com/artist/lowtide");
      }
      await page.locator("#fPay").click();
      await expect(page.locator("#claimH")).toHaveText("You're on the wall.");
      await page.locator("#dSee").click();
      await expect(wall.openView.locator(".title")).toHaveText("Lowtide Club");
      /* nobody calls their own spot */
      await expect(wall.openView.locator("[data-share]")).toBeVisible();
      await expect(wall.openView.locator(".act.call")).toHaveCount(0);
      /* "Your story" on the card: the maker's own numbers */
      await expect(page.locator("#card .mine .mine-nums")).toHaveText(/^(\d[\d,]* (saw it|opened|kept|to your links|shared)( · )?)+$|^Live now\./);
      await wall.goto("", { spotlight: true });
      await page.locator(".sl-tabs").getByRole("tab", { name: "Newest" }).click();
      await expect(page.locator(".sl-item").first()).toHaveAttribute("aria-label", /^Lowtide Club, No\. \d{3}: joined/);
    });
  });
