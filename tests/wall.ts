import { test as base, expect, type Page } from "@playwright/test";

export type WallOptions = { wallPath: string };

export const viewports = [
  { name: "phone", width: 390, height: 844 },
  { name: "breakpoint", width: 700, height: 900 },
  { name: "desktop", width: 1400, height: 900 },
] as const;

export type Viewport = (typeof viewports)[number];

/** Opens the wall in fixture mode and waits until it has settled. */
export class Wall {
  constructor(
    readonly page: Page,
    readonly viewport: Viewport,
    private readonly path: string,
  ) {}

  get isReference() {
    return this.path.includes("reference");
  }

  /** Below 700px a tile opens as a bottom sheet (§7). */
  get usesSheet() {
    return this.viewport.width < 700;
  }

  /** Below 980px the Fivehundrd card lives behind the tab bar (§10). */
  get usesTabBar() {
    return this.viewport.width < 980;
  }

  async goto(hash = "") {
    await this.page.goto(`${this.path}?fixture=1${hash}`);
    /* the baselines are the reference plus the approved changes */
    if (this.isReference) await this.page.addStyleTag({ path: "app/wall/overrides.css" });
    await this.page.waitForSelector("#rack .spot");
    await this.page.evaluate(() => document.fonts.ready);
    await this.settle();
  }

  /** Two frames: the wall opens its first spot and redraws in rAF callbacks. */
  async settle() {
    await this.page.evaluate(
      () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))),
    );
  }

  /** Keeps hover styles out of screenshots; toasts time out after 2.4s. */
  async quiet() {
    await this.page.mouse.move(0, 0);
    await expect(this.page.locator("#toast")).not.toHaveClass(/\bon\b/, {
      timeout: 5_000,
    });
    await this.settle();
  }

  filledTile(n: number) {
    return this.page.locator("#rack .spot:not(.vacant):not(.filler) .book").nth(n);
  }

  /** The open spot's content: the phone sheet or the inline panel. */
  get openView() {
    return this.page.locator(this.usesSheet ? "#dsheet" : "#rack .panel");
  }

  /** Clicking an already open tile closes it (§6), so that click is skipped. */
  async openTile(n: number) {
    const tile = this.filledTile(n);
    const isOpen = await tile.evaluate((el) => el.closest(".spot")?.classList.contains("open"));
    if (!isOpen || this.usesSheet) await tile.click();
    await expect(this.openView).toBeVisible();
    await this.settle();
  }

  async save(count: number) {
    if (!(await this.openView.isVisible())) await this.openTile(0);
    for (let i = 0; i < count; i++) {
      await this.openView.locator("[data-save]").click();
      await expect(this.openView.locator("[data-save]")).toHaveAttribute("aria-pressed", "true");
      if (i < count - 1) {
        const no = await this.openView.getAttribute("data-no");
        await this.openView.locator("[data-next]").click();
        await expect(this.openView).not.toHaveAttribute("data-no", no ?? "");
        await this.settle();
      }
    }
  }

  async showCard() {
    if (this.usesSheet) await this.closeOpenTile();
    if (this.usesTabBar) {
      await this.page.locator('.tabbar [data-tab="card"]').click();
      await expect(this.page.locator("#card")).toHaveClass(/\bon\b/);
    } else {
      await this.page.evaluate(() => window.scrollTo(0, 0));
    }
    return this.page.locator("#card");
  }

  async closeOpenTile() {
    if (this.usesSheet) {
      if (await this.page.locator("#dsheet").isVisible()) {
        await this.page.locator("#dsheet .dclose").click();
        await expect(this.page.locator("#dsheet")).toBeHidden();
      }
      return;
    }
    const open = this.page.locator("#rack .spot.open .book");
    if (await open.count()) {
      await open.click();
      await expect(this.page.locator("#rack .panel")).toHaveCount(0);
    }
  }

  async openCreate() {
    const button = this.usesTabBar
      ? this.page.locator('.tabbar [data-tab="create"]')
      : this.page.locator("#claimTop");
    await button.click();
    await expect(this.page.locator("#claimVeil")).toHaveClass(/\bon\b/);
    await expect(this.page.locator("#fName")).toBeFocused();
  }
}

export const test = base.extend<WallOptions & { viewportSpec: Viewport; wall: Wall }>({
  wallPath: ["/", { option: true }],
  viewportSpec: [viewports[2], { option: true }],
  wall: async ({ page, wallPath, viewportSpec }, use) => {
    /* No native share sheet in the fixture, so Share always opens the
       reference's own fallback sheet (§15). */
    await page.addInitScript(() => {
      Object.defineProperty(Navigator.prototype, "share", { value: undefined });
      Object.defineProperty(Navigator.prototype, "canShare", { value: undefined });
    });
    await use(new Wall(page, viewportSpec, wallPath));
  },
});

export { expect };
