import type { Page } from "@playwright/test";
import { expect, test, viewports } from "./wall";

/*
 * UX behaviour the screenshots cannot see (BUILD_BRIEF §6, §7, §17). Every
 * test runs on the reference and on the app; both must pass.
 */

const phone = viewports[0];
const desktop = viewports[2];

const sheet = (page: Page) => page.locator("#dsheet");
const sheetNo = (page: Page) => page.locator("#dsheet").getAttribute("data-no");

/** A vertical touch drag on the sheet's grab handle over `ms` (§7). */
async function drag(page: Page, dy: number, ms: number) {
  await page.evaluate(
    async ([dy, ms]) => {
      const grab = document.querySelector("#dsheet .grab")!;
      const touch = (y: number) => new Touch({ identifier: 1, target: grab, clientX: 195, clientY: y });
      const fire = (type: string, y: number, touches: boolean) =>
        grab.dispatchEvent(
          new TouchEvent(type, { bubbles: true, cancelable: true, touches: touches ? [touch(y)] : [], changedTouches: [touch(y)] }),
        );
      const steps = 10;
      fire("touchstart", 60, true);
      for (let i = 1; i <= steps; i++) {
        await new Promise((r) => setTimeout(r, ms / steps));
        fire("touchmove", 60 + (dy * i) / steps, true);
      }
      fire("touchend", 60 + dy, false);
    },
    [dy, ms],
  );
}

test.describe("phone: the tile comes forward as a sheet (§7)", () => {
  test.use({ viewport: { width: phone.width, height: phone.height }, viewportSpec: phone, hasTouch: true });

  test("tapping a tile opens the sheet over a backdrop, with its own history entry", async ({ wall, page }) => {
    await wall.goto();
    await expect(sheet(page)).toBeHidden();
    const entries = await page.evaluate(() => window.history.length);
    const tile = wall.filledTile(1);
    const no = (await tile.evaluate((el) => el.closest(".spot")!.getAttribute("data-no")))!;
    await tile.click();
    await expect(sheet(page)).toBeVisible();
    await expect(page.locator("#dveil")).toHaveClass(/\bon\b/);
    await expect(page.locator("html")).toHaveClass(/sheet-lock/);
    expect(await sheetNo(page)).toBe(no);
    await expect(tile).toHaveAttribute("aria-expanded", "true");
    await expect(page.locator(`#s-${no.padStart(3, "0")}`)).toHaveClass(/\bopen\b/);
    expect(await page.evaluate(() => window.history.length)).toBe(entries + 1);
    expect(await page.evaluate(() => location.hash)).toBe(`#${no.padStart(3, "0")}`);
  });

  for (const [how, close] of [
    ["the × button", (page: Page) => page.locator("#dsheet .dclose").click()],
    ["the backdrop", (page: Page) => page.locator("#dveil").click({ position: { x: 195, y: 10 } })],
    ["Escape", (page: Page) => page.keyboard.press("Escape")],
    ["the back gesture", (page: Page) => page.goBack()],
    ["a slow downward drag past 120px", (page: Page) => drag(page, 200, 600)],
    ["a short fast flick", (page: Page) => drag(page, 60, 40)],
  ] as const) {
    test(`closes with ${how}`, async ({ wall, page }) => {
      await wall.goto();
      await wall.openTile(1);
      await close(page);
      await expect(sheet(page)).toBeHidden();
      await expect(page.locator("#dveil")).not.toHaveClass(/\bon\b/);
      await expect(page.locator("html")).not.toHaveClass(/sheet-lock/);
      await expect(page.locator("#rack .spot.open")).toHaveCount(0);
    });
  }

  test("a short, slow drag snaps back instead of closing", async ({ wall, page }) => {
    await wall.goto();
    await wall.openTile(1);
    await drag(page, 60, 600);
    await page.waitForTimeout(300);
    await expect(sheet(page)).toBeVisible();
  });

  test("Next spot slides the next tile into the same sheet, without a new history entry", async ({ wall, page }) => {
    await wall.goto();
    await wall.openTile(0);
    const first = (await sheetNo(page))!;
    const entries = await page.evaluate(() => window.history.length);
    await page.locator("#dsheet [data-next]").click();
    await expect(sheet(page)).not.toHaveAttribute("data-no", first);
    await expect(sheet(page)).toBeVisible();
    const next = (await sheetNo(page))!;
    await expect(page.locator(`#s-${next.padStart(3, "0")}`)).toHaveClass(/\bopen\b/);
    await expect(page.locator(`#s-${first.padStart(3, "0")}`)).not.toHaveClass(/\bopen\b/);
    expect(await page.evaluate(() => window.history.length)).toBe(entries);
  });

  test("Save inside the sheet pops the button and the My card badge", async ({ wall, page }) => {
    await wall.goto();
    await wall.openTile(1);
    const save = page.locator("#dsheet [data-save]");
    await save.click();
    await expect(save).toHaveAttribute("aria-pressed", "true");
    await expect(save).toHaveText("Saved");
    await expect(save).toHaveClass(/\bpop\b/);
    await expect(page.locator("#tbN")).toBeVisible();
    await expect(page.locator("#tbN")).toHaveText("1");
    await expect(page.locator("#tbN")).toHaveClass(/\bpop\b/);
    await expect(page.locator(".flyer")).toHaveCount(0);
  });

  test("lane switches and search never pop the sheet uninvited", async ({ wall, page }) => {
    await wall.goto();
    await page.locator('#lanes [data-lane="music"]').click();
    await wall.settle();
    await expect(sheet(page)).toBeHidden();
    await page.locator("#q").fill("lowtide");
    await page.waitForTimeout(300);
    await expect(sheet(page)).toBeHidden();
  });

  test("a deep link opens that spot's sheet", async ({ wall, page }) => {
    await wall.goto("#138");
    await expect(sheet(page)).toBeVisible();
    expect(await sheetNo(page)).toBe("138");
  });

  test("rotating past 700px hands the open spot over to the inline panel", async ({ wall, page }) => {
    await wall.goto();
    await wall.openTile(1);
    const no = (await sheetNo(page))!;
    await page.setViewportSize({ width: 1000, height: 900 });
    await expect(sheet(page)).toBeHidden();
    await expect(page.locator("#rack .panel")).toHaveAttribute("data-no", no);
    await expect(page.locator(`#s-${no.padStart(3, "0")}`)).toHaveClass(/\bopen\b/);
  });

  test("an open counts once per visitor per session", async ({ wall, page }) => {
    await wall.goto();
    /* a tile whose count is shown exactly (under 1,000), so +1 is visible */
    const n = await page.evaluate(() =>
      [...document.querySelectorAll("#rack .spot:not(.vacant):not(.filler)")].findIndex((el) => !/k/.test(el.querySelector("[data-o]")!.textContent!)),
    );
    const count = page.locator("#rack .spot:not(.vacant):not(.filler)").nth(n).locator("[data-o]");
    const before = Number(await count.textContent());
    await wall.openTile(n);
    await page.locator("#dsheet .dclose").click();
    await expect(count).toHaveText(String(before + 1));
    await wall.openTile(n);
    await page.locator("#dsheet .dclose").click();
    await expect(count).toHaveText(String(before + 1));
  });
});

test.describe("phone, with motion (§7)", () => {
  test.use({ viewport: { width: phone.width, height: phone.height }, viewportSpec: phone, hasTouch: true, reducedMotion: "no-preference" });

  test("the tile's artwork travels into the sheet as the sheet rises", async ({ wall, page }) => {
    await wall.goto();
    await wall.filledTile(1).click();
    await expect(page.locator(".art-ghost")).toHaveCount(1);
    expect(await page.evaluate(() => document.getAnimations().filter((a) => a.playState === "running").length)).toBeGreaterThanOrEqual(2);
    await expect(page.locator(".art-ghost")).toHaveCount(0, { timeout: 2_000 });
    await expect(page.locator("#dsheet .art")).toBeVisible();
  });
});

test.describe("phone, reduced motion (§17)", () => {
  test.use({ viewport: { width: phone.width, height: phone.height }, viewportSpec: phone, hasTouch: true });

  test("no ghost and no rising sheet: state changes are instant", async ({ wall, page }) => {
    await wall.goto();
    await wall.filledTile(1).click();
    await expect(sheet(page)).toBeVisible();
    expect(await page.locator(".art-ghost").count()).toBe(0);
    expect(await sheet(page).evaluate((el) => el.getAnimations().length)).toBe(0);
  });
});

test.describe("desktop: a tile opens inline under its row (§6)", () => {
  test.use({ viewport: { width: desktop.width, height: desktop.height }, viewportSpec: desktop });

  test("the panel sits directly under the tile's row, its notch pointing at the tile", async ({ wall, page }) => {
    await wall.goto();
    await wall.openTile(3);
    const panel = page.locator("#rack .panel");
    const no = (await panel.getAttribute("data-no"))!;
    const tile = page.locator(`#s-${no.padStart(3, "0")}`);
    await expect(tile).toHaveClass(/\bopen\b/);
    expect(await panel.evaluate((p) => p.previousElementSibling?.contains(document.querySelector(".spot.open")))).toBe(true);
    const [nx, centre] = await page.evaluate(() => {
      const p = document.querySelector("#rack .panel") as HTMLElement;
      const b = document.querySelector(".spot.open .book")!.getBoundingClientRect();
      return [parseFloat(p.style.getPropertyValue("--nx")), b.left + b.width / 2 - p.getBoundingClientRect().left];
    });
    expect(nx).toBeCloseTo(centre, 3);
  });

  test("clicking the open tile again closes it", async ({ wall, page }) => {
    await wall.goto();
    await wall.openTile(3);
    await wall.filledTile(3).click();
    await expect(page.locator("#rack .panel")).toHaveCount(0);
    await expect(page.locator("#rack .spot.open")).toHaveCount(0);
  });

  test("Next spot moves the panel to the next filled tile", async ({ wall, page }) => {
    await wall.goto();
    await wall.openTile(0);
    const first = (await page.locator("#rack .panel").getAttribute("data-no"))!;
    await page.locator("#rack .panel [data-next]").click();
    await expect(page.locator("#rack .panel")).not.toHaveAttribute("data-no", first);
    await expect(page.locator("#rack .panel")).toHaveCount(1);
    await expect(page.locator("#rack .spot.open")).toHaveCount(1);
  });

  test("Keep reading expands the excerpt and Show less folds it", async ({ wall, page }) => {
    await wall.goto();
    await page.locator('#lanes [data-lane="writers"]').click();
    await expect(page.locator("#rack .panel .read")).toBeVisible();
    const more = page.locator("#rack .panel [data-more]");
    await more.click();
    await expect(page.locator("#rack .panel .read")).toHaveClass(/\bfull\b/);
    await expect(more).toHaveText("Show less");
    await more.click();
    await expect(page.locator("#rack .panel .read")).not.toHaveClass(/\bfull\b/);
    await expect(more).toHaveText("Keep reading");
  });

  test("Save lands the story on the card and counts it on the tile", async ({ wall, page }) => {
    await wall.goto();
    const no = (await page.locator("#rack .panel").getAttribute("data-no"))!;
    const saves = page.locator(`#s-${no.padStart(3, "0")} [data-v]`);
    const before = Number(await saves.textContent());
    const save = page.locator("#rack .panel [data-save]");
    await save.click();
    await expect(save).toHaveAttribute("aria-pressed", "true");
    await expect(save).toHaveText("Saved");
    await expect(page.locator("#card .msp")).toHaveCount(1);
    await expect(page.locator("#card .msp")).toHaveClass(/\blanded\b/);
    await expect(saves).toHaveText(String(before + 1));
    await save.click();
    await expect(save).toHaveText("Save");
    await expect(saves).toHaveText(String(before));
  });
});

test.describe("desktop: the Fivehundrd card (§10, §11, §12)", () => {
  test.use({ viewport: { width: desktop.width, height: desktop.height }, viewportSpec: desktop });

  test("shows 12 saves, then more in steps of 12, then Show less", async ({ wall, page }) => {
    await wall.goto();
    await wall.save(14);
    await page.evaluate(() => window.scrollTo(0, 0));
    const tiles = page.locator("#card .msp");
    await expect(page.locator("#card .sv-head b")).toHaveText("14");
    /* saving expands the list so the new save is visible (as in the reference) */
    const shown = await tiles.count();
    if (shown > 12) {
      await expect(page.locator("#card [data-less-saves]")).toHaveText("Show less");
      await page.locator("#card [data-less-saves]").click();
    }
    await expect(tiles).toHaveCount(12);
    await expect(page.locator("#card [data-more-saves]")).toHaveText("Show 2 more");
    await page.locator("#card [data-more-saves]").click();
    await expect(tiles).toHaveCount(14);
    await expect(page.locator("#card [data-less-saves]")).toHaveText("Show less");
  });

  test("saves are ordered leaving first", async ({ wall, page }) => {
    await wall.goto();
    await wall.save(5);
    const left = await page.locator("#card .msp .sq-t").allTextContents();
    const hours = left.map((t) => (t.endsWith("m") ? 0 : parseInt(t, 10)));
    expect(hours).toEqual([...hours].sort((a, b) => a - b));
  });

  test("× removes a save and updates the tile's count", async ({ wall, page }) => {
    await wall.goto();
    const no = (await page.locator("#rack .panel").getAttribute("data-no"))!;
    const count = page.locator(`#s-${no.padStart(3, "0")} [data-v]`);
    const before = await count.textContent();
    await wall.save(1);
    await expect(page.locator("#card .msp")).toHaveCount(1);
    await page.locator("#card .sv-x").click();
    await expect(page.locator("#card .msp")).toHaveCount(0);
    await expect(page.locator("#card .sv-empty")).toBeVisible();
    await expect(count).toHaveText(before!);
  });

  test("Take me back opens the spot the visitor walked in at", async ({ wall, page }) => {
    await wall.goto();
    await wall.openTile(5);
    const entry = await page.locator("#card .lc-entry").getAttribute("data-go");
    await page.locator("#card .lc-entry").click();
    await expect(page.locator("#rack .panel")).toHaveAttribute("data-no", entry!);
  });

  test("Keep my card appears with a save and opens the login sheet", async ({ wall, page }) => {
    await wall.goto();
    await expect(page.locator("#card [data-keep]")).toHaveCount(0);
    await wall.save(1);
    await page.locator("#card [data-keep]").click();
    await expect(page.locator("#shareVeil")).toHaveClass(/\bon\b/);
    await expect(page.locator("#shareSheet h2")).toHaveText("Keep your card");
    await expect(page.locator("#kRemind")).toBeChecked();
  });

  test("saves survive a reload (§17)", async ({ wall, page }) => {
    await wall.goto();
    await wall.save(3);
    await page.reload();
    await page.waitForSelector("#rack .spot");
    await expect(page.locator("#card .msp")).toHaveCount(3);
    await expect(page.locator("#card .sv-head b")).toHaveText("3");
  });
});

test.describe("phone: the card behind the tab bar (§10)", () => {
  test.use({ viewport: { width: phone.width, height: phone.height }, viewportSpec: phone, hasTouch: true });

  test("My card opens the card sheet; Wall, the backdrop and Escape close it", async ({ wall, page }) => {
    await wall.goto();
    const card = page.locator("#card");
    const tab = page.locator('.tabbar [data-tab="card"]');
    for (const close of [
      () => page.locator('.tabbar [data-tab="wall"]').click(),
      () => page.locator("#cardVeil").click({ position: { x: 195, y: 10 } }),
      () => page.keyboard.press("Escape"),
      () => tab.click(),
    ]) {
      await tab.click();
      await expect(card).toHaveClass(/\bon\b/);
      await expect(tab).toHaveAttribute("aria-expanded", "true");
      await close();
      await expect(card).not.toHaveClass(/\bon\b/);
      await expect(tab).toHaveAttribute("aria-expanded", "false");
    }
  });

  test("the My card badge counts saves", async ({ wall, page }) => {
    await wall.goto();
    await expect(page.locator("#tbN")).toBeHidden();
    await wall.save(2);
    await expect(page.locator("#tbN")).toHaveText("2");
    await expect(page.locator("#tbN")).toBeVisible();
  });

  test("Create in the tab bar opens Create your story", async ({ wall, page }) => {
    await wall.goto();
    await page.locator('.tabbar [data-tab="create"]').click();
    await expect(page.locator("#claimVeil")).toHaveClass(/\bon\b/);
    await expect(page.locator("#claimH")).toHaveText("Create your story");
  });
});

test.describe("desktop: sharing and Keep my card (§12, §15)", () => {
  test.use({ viewport: { width: desktop.width, height: desktop.height }, viewportSpec: desktop });

  test("Share falls back to a sheet with WhatsApp, Telegram, X, Facebook, Email and Copy link", async ({ wall, page }) => {
    await wall.goto();
    await page.locator("#rack .panel [data-share]").click();
    await expect(page.locator("#shareVeil")).toHaveClass(/\bon\b/);
    await expect(page.locator("#shareSheet .sharelist > *")).toHaveText(["WhatsApp", "Telegram", "X", "Facebook", "Email", "Copy link"]);
    const no = (await page.locator("#rack .panel").getAttribute("data-no"))!;
    await expect(page.locator("#shareSheet .sharelist a").first()).toHaveAttribute("href", new RegExp(`%23${no.padStart(3, "0")}$`));
    await page.locator("#shareSheet .x").click();
    await expect(page.locator("#shareVeil")).not.toHaveClass(/\bon\b/);
  });

  test("Copy link copies the spot's link and says so", async ({ wall, page, context }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await wall.goto();
    await page.locator("#rack .panel [data-share]").click();
    await page.locator("#shareSheet [data-copy]").click();
    await expect(page.locator("#toast")).toHaveText("Link copied");
    await expect(page.locator("#toast")).toHaveClass(/\bon\b/);
    expect(await page.evaluate(() => navigator.clipboard.readText())).toMatch(/\?fixture=1#\d{3}$/);
  });

  test("demo links explain themselves instead of leaving", async ({ wall, page }) => {
    await wall.goto();
    await page.locator("#rack .panel .links a").first().click();
    await expect(page.locator("#toast")).toHaveText("Demo spot. Real makers link out to their own pages.");
  });

  test("Keep my card checks the email, then keeps the card with reminders", async ({ wall, page }) => {
    await wall.goto();
    await wall.save(1);
    await page.locator("#card [data-keep]").click();
    await page.locator("#kEmail").fill("not-an-email");
    await page.locator('#shareSheet [data-login="email"]').click();
    await expect(page.locator("#kErr")).toHaveText("That email address doesn't look right. Check it and try again.");
    await page.locator("#kEmail").fill("maker@example.com");
    await page.locator('#shareSheet [data-login="email"]').click();
    await expect(page.locator("#shareVeil")).not.toHaveClass(/\bon\b/);
    await expect(page.locator("#toast")).toHaveText("Check your inbox for the link. Your card is kept.");
    await expect(page.locator("#card .kept")).toHaveText("Card kept with maker@example.com. Reminders on.");
    await expect(page.locator("#card [data-keep]")).toHaveCount(0);
  });

  test("Continue with Google keeps the card without reminders when unticked", async ({ wall, page }) => {
    await wall.goto();
    await wall.save(1);
    await page.locator("#card [data-keep]").click();
    await page.locator("#kRemind").uncheck();
    await page.locator('#shareSheet [data-login="Google"]').click();
    await expect(page.locator("#toast")).toHaveText("Card kept.");
    await expect(page.locator("#card .kept")).toHaveText("Card kept with Google.");
  });
});
