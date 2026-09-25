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
