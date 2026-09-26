import type { Page } from "@playwright/test";
import { expect, test, viewports } from "./wall";

/*
 * UX behaviour the screenshots cannot see (BUILD_BRIEF §6, §7, §17). Every
 * test runs on the reference and on the app; both must pass.
 */

/** For approved changes the reference deliberately doesn't have (see app/wall/overrides.css, README). */
const appOnly = (reason: string) => test.skip(test.info().project.name === "reference", reason);

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
    await wall.search("lowtide");
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

  test("the spot grows out of its tile into the overlay, and shrinks back into it", async ({ wall, page }) => {
    appOnly("approved change: an overlay that grows from the tile; the reference's sheet rose from the bottom");
    await wall.goto();
    const tile = wall.filledTile(1);
    const t = (await tile.boundingBox())!;
    await tile.click();
    /* the first frame is the tile itself: same place, same width */
    const first = await sheet(page).evaluate((el) => {
      const a = el.getAnimations()[0];
      const k = (a.effect as KeyframeEffect).getKeyframes()[0];
      return String(k.transform);
    });
    const [, dx, dy, k] = first.match(/translate\(([-\d.]+)px,\s*([-\d.]+)px\) scale\(([\d.]+)\)/)!.map(Number);
    await page.waitForTimeout(500);
    const r = (await sheet(page).boundingBox())!;
    expect(Math.abs(r.x + dx - t.x)).toBeLessThan(1);
    expect(Math.abs(r.y + dy - t.y)).toBeLessThan(1);
    expect(Math.abs(r.width * k - t.width)).toBeLessThan(1);
    /* an overlay, with the wall showing around it */
    expect(r.x).toBeGreaterThanOrEqual(8);
    expect(r.y).toBeGreaterThanOrEqual(40);
    await page.locator("#dsheet .dclose").click();
    await expect(sheet(page)).toBeHidden({ timeout: 2_000 });
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
    /* approved change: phones create in steps */
    await expect(page.locator("#claimH")).toHaveText(wall.isReference ? "Create your story" : "Step 1 of 6 · Lane");
  });
});

test.describe("desktop: sharing and Keep my card (§12, §15)", () => {
  test.use({ viewport: { width: desktop.width, height: desktop.height }, viewportSpec: desktop });

  test("Share falls back to a sheet with WhatsApp, Telegram, X, Facebook, Email and Copy link", async ({ wall, page }) => {
    appOnly("approved change: the share sheet carries the spot's card; its link list is checked below");
    await wall.goto();
    await page.locator("#rack .panel [data-share]").click();
    await expect(page.locator("#shareVeil")).toHaveClass(/\bon\b/);
    await expect(page.locator("#shareSheet .sharelist > *")).toHaveText(["WhatsApp", "Telegram", "X", "Facebook", "Email"]);
    await expect(page.locator("#shareSheet [data-copy]")).toHaveText("Copy link");
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

/** A 2×2 red PNG, for upload tests. */
const PNG_2x2 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFklEQVR4nGP4z8DwHwyBDAYGBgYGAAG+Af9xXw1IAAAAAElFTkSuQmCC",
  "base64",
);

test.describe("desktop: Create your story (§13)", () => {
  test.use({ viewport: { width: desktop.width, height: desktop.height }, viewportSpec: desktop });

  test("asks for a name, then a link, then a real web address", async ({ wall, page }) => {
    await wall.goto();
    await wall.openCreate();
    const err = page.locator("#fErr");
    await page.locator("#fPay").click();
    await expect(err).toHaveText("Add your name so people know who they're looking at.");
    await expect(page.locator("#fName")).toBeFocused();
    await page.locator("#fName").fill("Lowtide Club");
    await page.locator("#fPay").click();
    await expect(err).toHaveText("Add at least one link, so visitors can go and find you.");
    await expect(page.locator("[data-link]").first()).toBeFocused();
    await page.locator("[data-link]").first().fill("not a link");
    await page.locator("#fPay").click();
    await expect(err).toHaveText("That link doesn't look like a web address. Try something like instagram.com/yourname.");
  });

  test("the preview follows the form: name, line, link label, lane block", async ({ wall, page }) => {
    await wall.goto();
    await wall.openCreate();
    const prev = page.locator("#fPrev");
    await expect(prev.locator(".title")).toHaveText("Your name here");
    await page.locator("#fName").fill("Paper Engines");
    await expect(prev.locator(".title")).toHaveText("Paper Engines");
    await page.locator("#fSnip").fill("Brass and tape hiss.");
    await expect(prev.locator(".snip")).toHaveText("Brass and tape hiss.");
    await expect(page.locator("#fCount")).toHaveText("120 left");
    await page.locator("[data-link]").first().fill("open.spotify.com/artist/x");
    await expect(prev.locator(".links a").first()).toContainText("Spotify");
    await page.locator('#fLane [data-l="writers"]').click();
    await expect(page.locator('#fLane [data-l="writers"]')).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator("#fExtra label")).toContainText("First pages");
    await page.locator("#fEx").fill("First paragraph.\n\nSecond paragraph.");
    await expect(prev.locator(".read .page p")).toHaveCount(2);
    await page.locator('#fLane [data-l="games"]').click();
    await expect(page.locator("#fExtra label")).toContainText("Trailer link");
    await page.locator("#fTrailer").fill("youtube.com/watch?v=x");
    await expect(prev.locator(".trailer")).toBeVisible();
    await page.locator('#fLane [data-l="podcasts"]').click();
    await expect(page.locator("#fExtra .lbl")).toContainText("Episode trailer");
  });

  test("Pick another number offers a different open spot", async ({ wall, page }) => {
    await wall.goto();
    await wall.openCreate();
    const first = await page.locator("#claimNo").textContent();
    await page.locator("#reroll").click();
    await expect(page.locator("#claimNo")).not.toHaveText(first!);
    const no = Number(await page.locator("#claimNo").textContent());
    await expect(page.locator(`#s-${String(no).padStart(3, "0")}`)).toHaveClass(/\bvacant\b/);
  });

  test("an open spot on the wall opens Create for that number", async ({ wall, page }) => {
    await wall.goto();
    const vacant = page.locator("#rack .spot.vacant").first();
    const no = (await vacant.getAttribute("data-no"))!;
    await vacant.locator(".book").click();
    await expect(page.locator("#claimVeil")).toHaveClass(/\bon\b/);
    await expect(page.locator("#claimNo")).toHaveText(no.padStart(3, "0"));
  });

  test("uploaded artwork and logo show in the form and the preview", async ({ wall, page }) => {
    await wall.goto();
    await wall.openCreate();
    await page.locator("#fArt").setInputFiles({ name: "art.png", mimeType: "image/png", buffer: PNG_2x2 });
    await expect(page.locator("#fTh img")).toHaveAttribute("src", /^data:image\/jpeg/);
    await expect(page.locator("#fPrev .art img")).toHaveAttribute("src", /^data:image\/jpeg/);
    await page.locator("#fLogo").setInputFiles({ name: "logo.png", mimeType: "image/png", buffer: PNG_2x2 });
    await expect(page.locator("#fLogoTh img")).toHaveAttribute("src", /^data:image\/jpeg/);
    await expect(page.locator("#fErr")).toHaveText("");
  });

  test("an audio clip over 4 MB is refused", async ({ wall, page }) => {
    await wall.goto();
    await wall.openCreate();
    await page.locator("#fAudio").setInputFiles({ name: "big.mp3", mimeType: "audio/mpeg", buffer: Buffer.alloc(4_000_001) });
    await expect(page.locator("#fErr")).toHaveText("That audio file is over 4 MB. Trim it to about 30 seconds.");
  });

  test("paying places the story on the wall and shows the social card", async ({ wall, page }) => {
    await wall.goto();
    await wall.openCreate();
    const no = (await page.locator("#claimNo").textContent())!;
    await page.locator("#fName").fill("Lowtide Club");
    await page.locator("[data-link]").first().fill("open.spotify.com/artist/lowtide");
    await page.locator("#fPay").click();
    await expect(page.locator("#fPay")).toHaveText("Placing you on the wall…");
    await expect(page.locator("#fPay")).toBeDisabled();
    await expect(page.locator("#claimH")).toHaveText("You're on the wall.");
    await expect(page.locator("#claimSheet .sub").first()).toContainText(`Spot ${no} is yours until`);
    await expect(page.locator("#dCard .card-img")).toBeVisible({ timeout: 10_000 });
    await page.locator("#dSee").click();
    await expect(page.locator("#claimVeil")).not.toHaveClass(/\bon\b/);
    await expect(page.locator("#rack .panel")).toHaveAttribute("data-no", String(Number(no)));
    await expect(page.locator("#rack .panel .title")).toHaveText("Lowtide Club");
    await expect(page.locator("#card .mine")).toContainText(`No. ${no} Lowtide Club`);
  });

  test("a claimed spot stays on the wall after a reload", async ({ wall, page }) => {
    await wall.goto();
    await wall.openCreate();
    const no = (await page.locator("#claimNo").textContent())!;
    await page.locator("#fName").fill("Lowtide Club");
    await page.locator("[data-link]").first().fill("lowtide.example");
    await page.locator("#fPay").click();
    await expect(page.locator("#claimH")).toHaveText("You're on the wall.");
    await page.reload();
    await page.waitForSelector("#rack .spot");
    await expect(page.locator(`#s-${no} .bk-strip b`)).toHaveText("Lowtide Club");
  });
});

test.describe("desktop: index strip, audio, keys, search (§5, §8, §9)", () => {
  test.use({ viewport: { width: desktop.width, height: desktop.height }, viewportSpec: desktop });

  test("there is no index strip", async ({ wall, page }) => {
    appOnly("approved change: the index strip is removed (the reference only hid it)");
    await wall.goto();
    await expect(page.locator("#code, #scrub, .head")).toHaveCount(0);
  });

  test("j and k step through the filled spots", async ({ wall, page }) => {
    await wall.goto();
    const first = await page.locator("#rack .panel").getAttribute("data-no");
    await page.keyboard.press("j");
    await expect(page.locator("#rack .panel")).not.toHaveAttribute("data-no", first!);
    await page.keyboard.press("k");
    await expect(page.locator("#rack .panel")).toHaveAttribute("data-no", first!);
  });

  test("the preview player plays and stops", async ({ wall, page }) => {
    await wall.goto();
    const player = page.locator("#rack .panel [data-player]");
    await expect(player).toBeVisible();
    await player.locator("[data-play]").click();
    await expect(player).toHaveClass(/\bplaying\b/);
    await expect(player.locator("[data-ptime]")).not.toHaveText("0:00 / 0:30", { timeout: 5_000 });
    await player.locator("[data-play]").click();
    await expect(player).not.toHaveClass(/\bplaying\b/);
    await expect(player.locator("[data-ptime]")).toHaveText("0:00 / 0:30");
  });

  test("search matches names, lane labels and lines, and hides open spots", async ({ wall, page }) => {
    await wall.goto();
    await page.locator("#q").fill("podcasts");
    await expect(page.locator("#rack .spot.vacant")).toHaveCount(0);
    const lanes = await page.locator("#rack .spot:not(.filler) .bk-strip small").allTextContents();
    expect(lanes.length).toBeGreaterThan(0);
    expect(new Set(lanes)).toEqual(new Set(["Podcasts"]));
    await page.locator("#q").fill("lighthouse");
    await expect(page.locator("#rack .spot:not(.filler)").first()).toBeVisible();
    await page.locator("#q").fill("zzzz");
    await expect(page.locator("#rack .no-hits b")).toHaveText("zzzz");
    await page.locator("#rack .no-hits button").click();
    await expect(page.locator("#q")).toHaveValue("");
    await expect(page.locator("#rack .no-hits")).toHaveCount(0);
  });

  test("the brand clears the search and returns to the whole wall", async ({ wall, page }) => {
    await wall.goto();
    await page.locator('#lanes [data-lane="games"]').click();
    await expect(page.locator('#lanes [data-lane="games"]')).toHaveClass(/is-active/);
    await page.locator("#q").fill("tiny");
    await page.locator("#brand").click();
    await expect(page.locator('#lanes [data-lane="all"]')).toHaveClass(/is-active/);
    await expect(page.locator("#q")).toHaveValue("");
    await expect(page.locator("#rack .spot.vacant").first()).toBeVisible();
  });

  test("one visitor keeps the same entry point for the day (§17)", async ({ wall, page }) => {
    await wall.goto();
    const entry = await page.locator("#card .lc-entry b").textContent();
    await page.reload();
    await page.waitForSelector("#rack .spot");
    await expect(page.locator("#card .lc-entry b")).toHaveText(entry!);
  });
});

test.describe("approved changes on top of the reference", () => {
  test.describe("phone", () => {
    test.use({ viewport: { width: phone.width, height: phone.height }, viewportSpec: phone, hasTouch: true });

    test("closing the sheet leaves you where you were on the wall", async ({ wall, page }) => {
      await wall.goto();
      await page.evaluate(() => window.scrollTo(0, 2400));
      const y = await page.evaluate(() => scrollY);
      const tile = page.locator("#rack .spot:not(.vacant):not(.filler) .book");
      const n = await page.evaluate(() => {
        const all = [...document.querySelectorAll("#rack .spot:not(.vacant):not(.filler)")];
        return all.findIndex((el) => el.getBoundingClientRect().top > 150);
      });
      await tile.nth(n).click();
      await expect(page.locator("#dsheet")).toBeVisible();
      for (let i = 0; i < 6; i++) {
        const no = await page.locator("#dsheet").getAttribute("data-no");
        await page.locator("#dsheet [data-next]").click();
        await expect(page.locator("#dsheet")).not.toHaveAttribute("data-no", no!);
      }
      await page.locator("#dsheet .dclose").click();
      await expect(page.locator("#dsheet")).toBeHidden();
      await page.waitForTimeout(300);
      expect(await page.evaluate(() => scrollY)).toBe(y);
    });
  });

  test.describe("phone card", () => {
    test.use({ viewport: { width: phone.width, height: phone.height }, viewportSpec: phone, hasTouch: true });

    test("Keep my card opens the login sheet in front, not behind the card", async ({ wall, page }) => {
      appOnly("approved change: in the reference the login sheet opened behind the phone card");
      await wall.goto();
      await wall.save(1);
      await wall.closeOpenTile();
      await page.locator('.tabbar [data-tab="card"]').click();
      await page.locator("#card [data-keep]").click();
      await expect(page.locator("#card")).not.toHaveClass(/\bon\b/);
      await expect(page.locator('#shareSheet [data-login="Google"]')).toBeInViewport();
      await page.locator('#shareSheet [data-login="Google"]').click();
      await expect(page.locator("#toast")).toHaveText("Card kept.");
    });
  });

  test.describe("desktop", () => {
    test.use({ viewport: { width: desktop.width, height: desktop.height }, viewportSpec: desktop });

    test("the open spot's countdown ticks every second", async ({ wall, page }) => {
      appOnly("approved change (§6): the reference's countdown stood still");
      await wall.goto();
      const live = page.locator("#rack .panel [data-live]");
      const before = await live.textContent();
      /* move the frozen fixture clock on by five seconds */
      await page.evaluate(() => {
        const now = Date.now();
        Date.now = () => now + 5000;
      });
      await expect(live).not.toHaveText(before!, { timeout: 3_000 });
    });

    test("rotating to a phone hands the inline panel over to the sheet", async ({ wall, page }) => {
      appOnly("approved change (§7, 'and vice versa'): the reference kept the inline panel");
      await wall.goto();
      await wall.openTile(3);
      const no = (await page.locator("#rack .panel").getAttribute("data-no"))!;
      await page.setViewportSize({ width: phone.width, height: phone.height });
      await expect(page.locator("#dsheet")).toBeVisible();
      await expect(page.locator("#dsheet")).toHaveAttribute("data-no", no);
      await expect(page.locator("#rack .panel")).toHaveCount(0);
      await expect(page.locator(`#s-${no.padStart(3, "0")}`)).toHaveClass(/\bopen\b/);
      await page.locator("#dsheet .dclose").click();
      await expect(page.locator("#dsheet")).toBeHidden();
    });

    test("Keep my card shows the Google and Apple marks", async ({ wall, page }) => {
      appOnly("approved change (§12): real Google and Apple marks on the login buttons");
      await wall.goto();
      await wall.save(1);
      await page.locator("#card [data-keep]").click();
      const google = page.locator('#shareSheet [data-login="Google"]');
      const apple = page.locator('#shareSheet [data-login="Apple"]');
      await expect(google).toHaveAccessibleName("Continue with Google");
      await expect(apple).toHaveAccessibleName("Continue with Apple");
      await expect(google.locator('svg[data-mark="google"] path')).toHaveCount(4);
      await expect(apple.locator('svg[data-mark="apple"]')).toBeVisible();
    });
  });
});

test.describe("one spot everywhere (approved change)", () => {
  test.use({ viewport: { width: desktop.width, height: desktop.height }, viewportSpec: desktop });

  const inside = (loc: import("@playwright/test").Locator) =>
    loc.evaluate((spot) => ({
      book: spot.querySelector(".book")!.innerHTML,
      cap: spot.querySelector(".cap")!.innerHTML,
      /* the lane colours and ageing; the preview only adds its width */
      vars: (spot.getAttribute("style") ?? "")
        .split(";")
        .map((d) => d.trim())
        .filter((d) => d && !d.startsWith("width"))
        .join(";"),
      size: [spot.querySelector(".book")!.getBoundingClientRect().width, spot.querySelector(".book")!.getBoundingClientRect().height],
    }));

  test("the Create preview is the wall's own tile: after paying, the tile on the wall is the same", async ({ wall, page }) => {
    appOnly("approved change: the Create preview shows the real wall tile");
    await wall.goto();
    await wall.openCreate();
    const no = (await page.locator("#claimNo").textContent())!;
    await page.locator("#fName").fill("Lowtide Club");
    await page.locator("[data-link]").first().fill("open.spotify.com/artist/lowtide");
    const preview = await inside(page.locator("#claimSheet .prev-tile .spot"));
    await page.locator("#fPay").click();
    await expect(page.locator("#claimH")).toHaveText("You're on the wall.");
    const onWall = await inside(page.locator(`#s-${no}`));
    expect(onWall.book).toBe(preview.book);
    expect(onWall.cap).toBe(preview.cap);
    expect(onWall.vars).toBe(preview.vars);
    expect(onWall.size[0]).toBeCloseTo(preview.size[0], 1);
    expect(onWall.size[1]).toBeCloseTo(preview.size[1], 1);
  });

  test("share cards are the wall's tile on a social canvas, in three sizes, with the spot's link", async ({ wall, page }) => {
    appOnly("approved change: share cards are built from the wall tile");
    await wall.goto();
    await page.locator("#rack .panel [data-share]").click();
    for (const [label, size] of [
      ["Square", [1080, 1080]],
      ["Story", [1080, 1920]],
      ["Wide", [1200, 630]],
    ] as const) {
      await page.locator("#shareSheet .sc-pick .chip", { hasText: label }).click();
      const img = page.locator("#shareSheet .sc-preview img");
      await expect(img).toBeVisible({ timeout: 10_000 });
      await expect.poll(() => img.evaluate((i: HTMLImageElement) => [i.naturalWidth, i.naturalHeight])).toEqual(size);
    }
    const no = (await page.locator("#rack .panel").getAttribute("data-no"))!;
    await expect(page.locator("#shareSheet .sharelist a").first()).toHaveAttribute("href", new RegExp(`%23${no.padStart(3, "0")}$`));
  });

  test("the Done screen shows the maker's story card (1080×1920)", async ({ wall, page }) => {
    appOnly("approved change: the Done card is the story share card");
    await wall.goto();
    await wall.openCreate();
    await page.locator("#fName").fill("Lowtide Club");
    await page.locator("[data-link]").first().fill("open.spotify.com/artist/lowtide");
    await page.locator("#fPay").click();
    const img = page.locator("#dCard .card-img");
    await expect(img).toBeVisible({ timeout: 10_000 });
    expect(await img.evaluate((i: HTMLImageElement) => [i.naturalWidth, i.naturalHeight])).toEqual([1080, 1920]);
  });
});

/*
 * The mobile audit (approved changes): on every common phone width the wall
 * fits, every control is thumb-sized, Back closes what's open, sheets sit
 * above the tab bar, and Create goes step by step with the real tile.
 */
const PHONES = [
  { name: "iPhone SE (1st)", width: 320, height: 568 },
  { name: "iPhone SE", width: 375, height: 667 },
  { name: "iPhone", width: 390, height: 844 },
  { name: "Android", width: 412, height: 915 },
  { name: "iPhone Pro Max", width: 430, height: 932 },
] as const;

for (const ph of PHONES) {
  test.describe(`mobile audit, ${ph.name} ${ph.width}px`, () => {
    test.use({ viewport: { width: ph.width, height: ph.height }, viewportSpec: { name: "phone", width: ph.width, height: ph.height } as never, hasTouch: true });

    test("the wall fits, controls are thumb-sized, nothing jumps", async ({ wall, page }) => {
      appOnly("approved change: mobile audit");
      await page.addInitScript(() => {
        (window as unknown as { cls: number }).cls = 0;
        new PerformanceObserver((l) => {
          for (const e of l.getEntries() as unknown as { value: number; hadRecentInput: boolean }[]) if (!e.hadRecentInput) (window as unknown as { cls: number }).cls += e.value;
        }).observe({ type: "layout-shift", buffered: true });
      });
      await wall.goto();
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(ph.width);
      const small = await page.evaluate(() =>
        [...document.querySelectorAll<HTMLElement>(".top a, .top button, .tabbar button, .intro button")]
          .filter((e) => e.offsetParent)
          .map((e) => [e.textContent!.trim() || e.getAttribute("aria-label"), e.getBoundingClientRect().height] as const)
          .filter(([, h]) => h < 44),
      );
      expect(small).toEqual([]);
      expect(await page.evaluate(() => document.querySelector(".top")!.getBoundingClientRect().height)).toBeLessThanOrEqual(100);
      await page.evaluate(() => window.scrollTo(0, 6000));
      await page.waitForTimeout(300);
      expect(await page.evaluate(() => (window as unknown as { cls: number }).cls)).toBeLessThan(0.02);
      /* no price label spills out of its column */
      const spill = await page.evaluate(() =>
        [...document.querySelectorAll<HTMLElement>("#rack .vacant .v2")].some((e) => e.getBoundingClientRect().right > document.documentElement.clientWidth),
      );
      expect(spill).toBe(false);
    });

    test("an open spot's buttons are thumb-sized", async ({ wall, page }) => {
      appOnly("approved change: mobile audit");
      await wall.goto();
      await wall.openTile(0);
      const small = await page.evaluate(() =>
        [...document.querySelectorAll<HTMLElement>("#dsheet .acts button, #dsheet .dclose, #dsheet [data-play]")]
          .map((e) => [e.textContent!.trim() || e.getAttribute("aria-label"), e.getBoundingClientRect().height] as const)
          .filter(([, h]) => h < 44),
      );
      expect(small).toEqual([]);
    });

    test("Back closes Finds, Create and Share, top one first, and you stay where you were", async ({ wall, page }) => {
      appOnly("approved change: Back closes what's open");
      await wall.goto();
      await page.evaluate(() => window.scrollTo(0, 1800));
      const y = await page.evaluate(() => scrollY);
      for (const tab of ["card", "create"]) {
        await page.locator(`.tabbar [data-tab="${tab}"]`).click();
        await page.waitForTimeout(350);
        await page.goBack();
        await expect(page.locator(".veil.on, #card.on")).toHaveCount(0);
        expect(await page.evaluate(() => scrollY)).toBe(y);
      }
      await wall.openTile(0);
      await page.locator("#dsheet [data-share]").click();
      await expect(page.locator("#shareVeil")).toHaveClass(/\bon\b/);
      /* the share sheet is on top of the open spot */
      expect(await page.evaluate(() => {
        const r = document.querySelector("#shareSheet")!.getBoundingClientRect();
        return !!document.elementFromPoint(r.left + r.width / 2, r.top + 20)?.closest("#shareSheet");
      })).toBe(true);
      await page.goBack();
      await expect(page.locator("#shareVeil")).not.toHaveClass(/\bon\b/);
      await expect(sheet(page)).toBeVisible();
      await page.goBack();
      await expect(sheet(page)).toBeHidden();
    });

    test("Create goes step by step, above the tab bar, with the wall's own tile", async ({ wall, page }) => {
      appOnly("approved change: Create in steps on phones");
      await wall.goto();
      await wall.openCreate();
      await expect(page.locator("#claimH")).toHaveText("Step 1 of 6 · Lane");
      await page.locator(".st-lane", { hasText: "Books" }).click();
      await expect(page.locator("#claimH")).toHaveText("Step 2 of 6 · Artwork");
      await page.locator(".st-next").click();
      await page.locator(".st-next").click();
      await expect(page.locator("#fErr")).toHaveText("Add your name so people know who they're looking at.");
      await page.locator("#fName").fill("Paper Moons");
      await page.locator("#fName").press("Enter");
      await expect(page.locator("#claimH")).toHaveText("Step 4 of 6 · Description");
      /* the live tile is the wall tile, and it already carries the name and lane */
      await expect(page.locator(".st-live .bk-strip b")).toHaveText("Paper Moons");
      await expect(page.locator(".st-live .bk-strip small")).toHaveText("Books");
      await page.locator(".st-next").click();
      await page.locator("[data-link]").first().fill("papermoons.example");
      await page.locator(".st-next").click();
      await expect(page.locator("#claimH")).toHaveText("Step 6 of 6 · Preview");
      expect(await page.evaluate(() => document.querySelector("#claimSheet")!.scrollWidth <= document.querySelector("#claimSheet")!.clientWidth)).toBe(true);
      /* the pay button is on screen and on top (not under the tab bar) */
      expect(await page.evaluate(() => {
        const r = document.querySelector("#fPay")!.getBoundingClientRect();
        return r.bottom <= innerHeight && !!document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)?.closest("#fPay");
      })).toBe(true);
      await page.locator(".st-back").click();
      await expect(page.locator("[data-link]").first()).toHaveValue("papermoons.example");
      await page.locator(".st-next").click();
      await page.locator("#fPay").click();
      await expect(page.locator("#claimH")).toHaveText("You're on the wall.");
    });
  });
}
