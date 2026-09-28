import { expect, test, viewports } from "./wall";

/*
 * Scout (docs/scout.md) on the fixture wall. The database side (snapshots,
 * duplicates, migration, verdicts, reputation, tiers, sharing) is tested in
 * db/scout.test.mjs; here: what a visitor sees. On the demo wall signing in
 * is simulated (fh-account) and a Scout Card can be seeded (fh-scout), the
 * way the live wall would fill it from /api/scout/me.
 */
test.beforeEach(() => test.skip(test.info().project.name === "reference", "approved change: Scout"));

const [phone, , desktop] = viewports;

type Seed = Record<string, unknown>;
const call = (id: string, name: string, position: number, extra: Seed = {}) => ({
  id, lane: "music", no: 12, name, slug: "abcdefgh", artwork: null, logo: null, seed: 1, pal: 0, startsAt: "", endsAt: "", gone: false,
  calledAt: "2026-09-24T10:00:00Z", source: "signed_in", scored: true, position, keepersThen: position - 1, keepersNow: 340,
  wasHot: false, breakout: null, breakoutAt: null, finalKeepers: null, early: null, settled: false, hidden: false, ...extra,
});
const scout = (extra: Seed = {}) => ({
  name: "Martijn", since: "2026-08-01T00:00:00Z", share: null, status: "silver", percentile: 8, calls: 42, early: 11, hotspots: 4,
  settled: 30, minSettled: 10, best: call("b1", "Lowtide Club", 14, { breakout: "hotspot", finalKeepers: 1284, early: true, settled: true }),
  moves: [{ id: 3, from: "bronze", to: "silver", percentile: 8, at: "2026-09-24T03:41:00Z" }], list: [], ...extra,
});
async function signedIn(page: import("@playwright/test").Page, card: Seed | null = scout()) {
  await page.addInitScript((c) => {
    localStorage.setItem("fh-account", JSON.stringify({ via: "Google", remind: true }));
    if (c) localStorage.setItem("fh-scout", JSON.stringify(c));
  }, card);
}

test.describe("desktop", () => {
  test.use({ viewport: { width: desktop.width, height: desktop.height }, viewportSpec: desktop });

  test("signed out: a Timeheart still works, and one quiet line says what signing in is for, once a day", async ({ wall, page }) => {
    await wall.goto();
    await expect(page.locator("#card .sc-out .lc-h")).toHaveText("Think you know what’s next? Prove it.");
    await expect(page.locator("#card [data-keep]")).toHaveText("Start Scouting");
    await wall.openView.locator("[data-save]").click();
    await expect(wall.openView.locator("[data-save]")).toHaveText("Kept");
    const nudge = wall.openView.locator(".scout-nudge");
    await expect(nudge).toContainText("Scout this? Sign in to remember you found it early.");
    await expect(nudge).toContainText("Fivehundrd will track when you discovered it and show you what happens next.");
    await expect(nudge.locator(".scout-in")).toHaveText("Sign in & Scout");
    await nudge.getByRole("button", { name: "Not now" }).click();
    await expect(nudge).toHaveCount(0);
    /* the next Timeheart today: no line */
    const no = await wall.openView.getAttribute("data-no");
    await wall.openView.locator("[data-next]").click();
    await expect(wall.openView).not.toHaveAttribute("data-no", no ?? "");
    await wall.openView.locator("[data-save]").click();
    await expect(wall.openView.locator(".scout-nudge")).toHaveCount(0);
    await expect(page.locator("#card .sv-local")).toHaveText("On this device only. Sign in and Fivehundrd remembers them everywhere.");
  });

  test("from the line to signing in, and you're a Scout: building, nothing invented", async ({ wall, page }) => {
    await wall.goto();
    await wall.openView.locator("[data-save]").click();
    await wall.openView.locator(".scout-in").click();
    await expect(page.locator("#shareSheet h2")).toHaveText("Sign in to Scout");
    await page.locator('#shareSheet [data-login="Google"]').click();
    await expect(page.locator("#toast")).toHaveText("You're a Scout. From now on, Fivehundrd remembers when you found things.");
    await expect(page.locator("#card .sc-status b")).toHaveText("Building your Scout history");
    await expect(page.locator("#card .sc-status span")).toHaveText("Your standing shows once 10 of your Scouts have had their 72 hours · 0 so far");
    await expect(page.locator("#card .sc-facts")).toHaveText("1 Scout");
    await expect(page.locator("#card")).not.toContainText("Top ");
    await expect(page.locator("#card .lc")).not.toHaveAttribute("data-tier");
  });

  test("a Silver Scout: the tier's outline, the percentile, the move said once", async ({ wall, page }) => {
    await signedIn(page);
    await wall.goto();
    const card = page.locator("#card .lc");
    await expect(card).toHaveAttribute("data-tier", "silver");
    await expect(page.locator("#card .sc-status")).toHaveText("Top 8%Silver Scout");
    await expect(page.locator("#card .sc-facts")).toHaveText("42 Scouts · 11 Early Calls · 4 became Hotspots");
    await expect(page.locator("#card .sc-best")).toContainText("Lowtide ClubFound #14 · 1,284 kept it · a Hotspot");
    await expect(page.locator("#card .sc-move")).toContainText("Your eye is getting sharper.You’re now a Silver Scout. Top 10% of Fivehundrd Scouts.Some of the things you found early are starting to move.");
    await expect(page.locator("#card .sc-move button")).toHaveText(["See your Scouts", "Share your Scout Card"]);
    await page.reload();
    await page.waitForSelector("#rack[data-complete]");
    await expect(page.locator("#card .sc-status")).toHaveText("Top 8%Silver Scout");
    await expect(page.locator("#card .sc-move")).toHaveCount(0);
  });

  test("no tier, no number: a Scout below the population just says Scout", async ({ wall, page }) => {
    await signedIn(page, scout({ status: "scout", percentile: null, moves: [] }));
    await wall.goto();
    await expect(page.locator("#card .sc-status")).toHaveText("Scout");
    await expect(page.locator("#card")).not.toContainText("Top ");
    await expect(page.locator("#card .lc")).not.toHaveAttribute("data-tier");
  });

  test("signed out, a stored card is never shown", async ({ wall, page }) => {
    await page.addInitScript((c) => localStorage.setItem("fh-scout", JSON.stringify(c)), scout());
    await wall.goto();
    await expect(page.locator("#card .sc-out")).toBeVisible();
    /* the explainer names the tiers; the stored card's own name and standing never show */
    await expect(page.locator("#card")).not.toContainText("Martijn");
    await expect(page.locator("#card .sc-status")).toHaveCount(0);
  });

  test("each Scout's line comes from its call", async ({ wall, page }) => {
    await wall.goto();
    await wall.save(2);
    const keys: string[] = await page.evaluate(() => JSON.parse(localStorage.getItem("fh-saves")!).map((x: { k: string }) => x.k));
    await signedIn(page, scout({
      moves: [],
      list: [
        call(keys[0], "One", 12),
        call(keys[1], "Two", 3, { breakout: "hotspot", finalKeepers: 400, early: true, settled: true, source: "migrated" }),
      ],
    }));
    await wall.goto();
    const lines = page.locator("#card .sq-r");
    expect((await lines.allInnerTexts()).sort()).toEqual(["#12 · now 340", "Early Call · Hotspot"]);
    await expect(page.locator("#card .sq-r.early")).toHaveAttribute("title", /before it became a Hotspot.*Kept before you signed in/);
  });

  test("sharing: what the link shows, a name of your choosing, never the email", async ({ wall, page }) => {
    await signedIn(page, scout({ name: null, moves: [] }));
    await wall.goto();
    await page.locator("#card [data-scout-share]").click();
    const sheet = page.locator("#shareSheet");
    await expect(sheet.locator("h2")).toHaveText("Share your Scout Card");
    await expect(sheet.locator(".scs-name")).toHaveText("A Fivehundrd Scout");
    await sheet.locator("#scName").fill("Martijn");
    await expect(sheet.locator(".scs-name")).toHaveText("Martijn");
    await expect(sheet.locator(".scs")).toContainText("Top 8% · Silver Scout");
    await expect(sheet).toContainText("Never your email.");
    await sheet.getByRole("button", { name: "Make the link" }).click();
    await expect(sheet.locator(".err")).toHaveText("Sharing your Scout Card works on the live wall.");
  });

  test("one Early Call, shared on its own", async ({ wall, page }) => {
    await signedIn(page, scout({ moves: [] }));
    await wall.goto();
    await page.locator("#card [data-share-call]").click();
    const sheet = page.locator("#shareSheet");
    await expect(sheet.locator("h2")).toHaveText("Share this call");
    await expect(sheet.locator(".scs")).toContainText("I called this early.Lowtide ClubFound #14 · now a Hotspot");
  });

  test("with reduced motion the outline changes without a transition", async ({ wall, page }) => {
    await signedIn(page);
    await wall.goto();
    await expect(page.locator("#card .lc")).toHaveCSS("transition-duration", "0s");
  });
});

test.describe("phone", () => {
  test.use({ viewport: { width: phone.width, height: phone.height }, viewportSpec: phone, hasTouch: true });

  test("the tab is Scouts, and it opens the Scout Card", async ({ wall, page }) => {
    await signedIn(page, scout({ moves: [] }));
    await wall.goto();
    const tab = page.locator('.tabbar [data-tab="card"]');
    await expect(tab).toContainText("Scouts");
    await tab.click();
    await expect(page.locator("#card")).toHaveClass(/\bon\b/);
    await expect(page.locator("#card .lc-top span").first()).toHaveText("Scout Card");
    await expect(page.locator("#card [data-scout-share]")).toBeInViewport();
  });
});
