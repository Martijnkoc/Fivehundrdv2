import { expect, test, viewports } from "./wall";

/*
 * Retention (docs/retention.md): the one line of history under each Find,
 * the one personal thing "since your last visit" says, and Call it. The
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
    await expect(page.locator("#card .sq-r.early")).toHaveAttribute("title", /You were the 23rd to save this, among the first 10% of the people who did\. 1,284 keep it now\./);
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

  test("Call it: a small question, then back to the spot; it keeps it; three a day", async ({ wall, page }) => {
    await wall.goto("", { call: true });
    for (let i = 0; i < 3; i++) {
      await wall.openTile(i);
      const view = wall.openView;
      await view.getByRole("button", { name: "Call it" }).click();
      await expect(view.locator(".call-q")).toContainText("Think this one will move?");
      await view.locator(".call-q").getByRole("button", { name: "Call it" }).click();
      await expect(view.locator(".act.call.done")).toHaveText("Called · Sep 24");
      await expect(view.locator("[data-save]")).toHaveAttribute("aria-pressed", "true");
    }
    await wall.openTile(3);
    await wall.openView.getByRole("button", { name: "Call it" }).click();
    await wall.openView.locator(".call-q").getByRole("button", { name: "Call it" }).click();
    await expect(wall.openView.locator(".call-note")).toHaveText("That's today's three calls. More tomorrow.");
    /* cancel leaves nothing behind */
    await wall.openTile(4);
    await wall.openView.getByRole("button", { name: "Call it" }).click();
    await wall.openView.getByRole("button", { name: "Cancel" }).click();
    await expect(wall.openView.locator(".call-q")).toHaveCount(0);
    expect(Object.keys(await page.evaluate(() => JSON.parse(localStorage.getItem("fh-calls")!)))).toHaveLength(3);
  });

  test("Call it: which caller you were, when the database knows", async ({ wall, page }) => {
    await wall.goto("", { call: true });
    await wall.openTile(1);
    await wall.openView.getByRole("button", { name: "Call it" }).click();
    await wall.openView.locator(".call-q").getByRole("button", { name: "Call it" }).click();
    const no = await wall.openView.getAttribute("data-no");
    /* the live wall stores the rank the server answered with */
    await page.evaluate(() => {
      const calls = JSON.parse(localStorage.getItem("fh-calls")!);
      for (const k of Object.keys(calls)) calls[k].rank = 2;
      localStorage.setItem("fh-calls", JSON.stringify(calls));
    });
    await wall.goto("", { call: true });
    await wall.openTile(1);
    expect(await wall.openView.getAttribute("data-no")).toBe(no);
    await expect(wall.openView.locator(".act.call.done")).toHaveText("Called 2nd · Sep 24");
    await expect(wall.openView.locator(".act.call.done")).toHaveAttribute("title", /the 2nd to call it/);
  });
});

for (const viewport of [viewports[0], viewports[2]])
  test.describe(`${viewport.name} light`, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height }, viewportSpec: viewport, hasTouch: viewport.width < 700 });
    test("Call it's question (approved)", async ({ wall }) => {
      await wall.goto("", { call: true });
      await wall.openTile(0);
      const acts = wall.openView.locator(".acts");
      await expect(acts).toHaveScreenshot(["approved", `${viewport.name}-call.png`]);
      await acts.getByRole("button", { name: "Call it" }).click();
      await wall.quiet();
      await expect(acts).toHaveScreenshot(["approved", `${viewport.name}-call-ask.png`]);
    });
  });
