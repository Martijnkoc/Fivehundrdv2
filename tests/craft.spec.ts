import { expect, test, viewports } from "./wall";

/*
 * The craft pass (approved change): time as a material, the wall answering
 * the pointer, the tile becoming the open view, and the Timeheart. The app
 * only; the reference has none of it. Motion is checked with reduced motion
 * off, and that it is gone with it on.
 */
test.beforeEach(() => test.skip(test.info().project.name === "reference", "approved change: the craft pass"));

const [phone, , desktop] = viewports;

test.describe("desktop", () => {
  test.use({ viewport: { width: desktop.width, height: desktop.height }, viewportSpec: desktop });

  test("every live spot has a phase; the final hours read to the minute", async ({ wall, page }) => {
    await wall.goto();
    const phases = await page.locator("#rack .spot:not(.vacant):not(.filler)").evaluateAll((els) => els.map((e) => e.getAttribute("data-phase")));
    expect(phases.length).toBeGreaterThan(0);
    expect(phases.every((p) => p === "rising" || p === "live" || p === "last")).toBe(true);
    const last = page.locator('#rack .spot[data-phase="last"] .cap-l .t');
    expect(await last.count()).toBeGreaterThan(0);
    for (const t of await last.allTextContents()) expect(t).toMatch(/^(\d+h \d\dm|\d+m) left$/);
    const live = page.locator('#rack .spot[data-phase="live"] .cap-l .t').first();
    await expect(live).toHaveText(/^\d+h left$/);
    /* rising spots carry the new dot */
    for (const dot of await page.locator('#rack .spot[data-phase="rising"]').evaluateAll((els) => els.map((e) => !!e.querySelector(".new")))) expect(dot).toBe(true);
  });

  test("tiles say less: no opens pill, and no lane label inside one lane", async ({ wall, page }) => {
    await wall.goto();
    const tile = page.locator("#rack .spot:not(.vacant):not(.filler)").first();
    await expect(tile.locator(".m-o")).toBeHidden();
    await expect(tile.locator(".m-v")).toBeVisible();
    await expect(tile.locator(".bk-strip small")).toBeVisible();
    await page.locator('#lanes [data-lane="music"]').click();
    await expect(page.locator("#rack .spot:not(.vacant):not(.filler) .bk-strip small").first()).toBeHidden();
  });

  test.describe("with motion", () => {
    test.use({ reducedMotion: "no-preference" });

    test("the artwork shifts against the pointer", async ({ wall, page }) => {
      await wall.goto();
      const book = wall.filledTile(4);
      await book.scrollIntoViewIfNeeded();
      const box = (await book.boundingBox())!;
      await page.mouse.move(box.x + box.width * 0.9, box.y + box.height * 0.1);
      await page.mouse.move(box.x + box.width * 0.95, box.y + box.height * 0.05, { steps: 3 });
      await expect.poll(() => book.evaluate((b) => (b as HTMLElement).style.getPropertyValue("--px"))).toMatch(/^-\d/);
      await page.mouse.move(0, 0);
      await expect.poll(() => book.evaluate((b) => (b as HTMLElement).style.getPropertyValue("--px"))).toBe("");
    });

    test("opening a tile flies its artwork into the panel", async ({ wall, page }) => {
      await wall.goto();
      await wall.closeOpenTile();
      await wall.filledTile(3).click();
      await expect(page.locator(".morph")).toHaveCount(1);
      await expect(page.locator("#rack .panel")).toBeVisible();
      await expect(page.locator(".morph")).toHaveCount(0, { timeout: 2_000 });
      await expect(page.locator("#rack .panel .cover > .art")).toHaveCSS("opacity", "1");
    });

    test("a Timeheart beats once, fills, and says Kept", async ({ wall, page }) => {
      await wall.goto();
      const heart = page.locator("#rack .panel [data-save]");
      await expect(heart).toHaveText("Timeheart");
      await heart.click();
      await expect(heart).toHaveAttribute("aria-pressed", "true");
      await expect(heart).toHaveText("Kept");
      await expect(heart).toHaveClass(/\bbeat\b/);
      await expect(page.locator("#rack .panel .live")).toHaveClass(/\bbeat\b/);
      await expect(page.locator("#rack .spot.open")).toHaveClass(/\bbeat\b/);
      await expect(heart).not.toHaveClass(/\bbeat\b/, { timeout: 2_000 });
      await expect(heart.locator(".th-fill")).toHaveCSS("opacity", "1");
      /* letting it go is quiet */
      await heart.click();
      await expect(heart).toHaveText("Timeheart");
      await expect(heart).not.toHaveClass(/\bbeat\b/);
    });
  });

  test("with reduced motion nothing flies and nothing beats", async ({ wall, page }) => {
    await wall.goto();
    await wall.closeOpenTile();
    await wall.filledTile(3).click();
    await expect(page.locator("#rack .panel")).toBeVisible();
    await expect(page.locator(".morph")).toHaveCount(0);
    await expect(page.locator("#rack .panel .cover")).toHaveCSS("animation-name", "none");
    const heart = page.locator("#rack .panel [data-save]");
    await heart.click();
    await expect(heart).toHaveText("Kept");
    await expect(heart).toHaveCSS("animation-name", "none");
  });

  test("Finds read leaving first or as you found them, and remember the choice", async ({ wall, page }) => {
    await wall.goto();
    const names: string[] = [];
    for (let i = 0; i < 3; i++) {
      names.push((await wall.openView.locator(".title").textContent())!);
      await wall.save(1);
      if (i < 2) {
        const no = await wall.openView.getAttribute("data-no");
        await wall.openView.locator("[data-next]").click();
        await expect(wall.openView).not.toHaveAttribute("data-no", no ?? "");
      }
    }
    const order = page.locator("#card .sv-order");
    await expect(order.getByRole("radio", { name: "Leaving first" })).toHaveAttribute("aria-checked", "true");
    await order.getByRole("radio", { name: "As you found them" }).click();
    await expect(page.locator("#card .msp .sq-n")).toHaveText([...names].reverse());
    await page.reload();
    await page.waitForSelector("#rack[data-complete]");
    await expect(page.locator("#card .sv-order").getByRole("radio", { name: "As you found them" })).toHaveAttribute("aria-checked", "true");
    await expect(page.locator("#card .msp .sq-n")).toHaveText([...names].reverse());
  });

  test("the empty Scouts line: its words, and it sits inside the card", async ({ wall, page }) => {
    await wall.goto();
    const line = page.locator("#card .sv-empty p");
    await expect(line).toHaveText("Your Scout story starts here. Scout a few things you believe in. We’ll remember when you found them.");
    await expect(page.locator("#card .sv-empty [data-explore]")).toHaveText("Explore the Wall");
    const [l, c] = await Promise.all([line.boundingBox(), page.locator("#card .lc").boundingBox()]);
    expect(l!.x).toBeGreaterThanOrEqual(c!.x);
    expect(l!.x + l!.width).toBeLessThanOrEqual(c!.x + c!.width);
    const lines = await line.evaluate((el) => Math.round(el.getBoundingClientRect().height / parseFloat(getComputedStyle(el).lineHeight)));
    expect(lines).toBeLessThanOrEqual(3);
  });

  test("keyboard: a focused tile lifts, and Enter opens it", async ({ wall, page }) => {
    await wall.goto();
    await wall.closeOpenTile();
    const book = wall.filledTile(2);
    await book.focus();
    await page.keyboard.press("Tab");
    await page.keyboard.press("Shift+Tab");
    await expect(book).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page.locator("#rack .panel")).toBeVisible();
    await expect(page.locator("#rack .spot.open .book")).toHaveCount(1);
  });
});

test.describe("phone", () => {
  test.use({ viewport: { width: phone.width, height: phone.height }, viewportSpec: phone, hasTouch: true });

  test("the Timeheart in the overlay: Kept, and the Finds badge counts it", async ({ wall, page }) => {
    await wall.goto();
    await wall.openTile(1);
    const heart = page.locator("#dsheet [data-save]");
    await heart.click();
    await expect(heart).toHaveText("Kept");
    await expect(page.locator("#tbN")).toHaveText("1");
    await expect(page.locator("#toast")).toHaveText("Kept in your Scouts.");
  });
});
