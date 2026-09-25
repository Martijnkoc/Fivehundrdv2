import { expect, test, type Browser, type Page } from "@playwright/test";

const viewports = [
  { name: "phone", width: 390, height: 844 },
  { name: "breakpoint", width: 700, height: 900 },
  { name: "desktop", width: 1400, height: 900 },
] as const;

async function deterministicPage(
  browser: Browser,
  viewport: { width: number; height: number },
  colorScheme: "light" | "dark",
) {
  const context = await browser.newContext({
    viewport,
    colorScheme,
    reducedMotion: "reduce",
  });
  await context.addInitScript(() => {
    const frozenAt = new Date("2026-09-24T12:00:00Z").valueOf();
    let randomState = 500;
    Date.now = () => frozenAt;
    Math.random = () => {
      randomState = (randomState * 16_807) % 2_147_483_647;
      return (randomState - 1) / 2_147_483_646;
    };
    localStorage.clear();
    sessionStorage.clear();
  });
  return { context, page: await context.newPage() };
}

async function waitUntilReady(page: Page, path: string) {
  await page.goto(path);
  await page.waitForSelector("#rack .spot");
  await page.evaluate(() => document.fonts.ready);
}

for (const viewport of viewports) {
  for (const colorScheme of ["light", "dark"] as const) {
    test(`${viewport.name} ${colorScheme} matches the approved reference`, async ({
      browser,
    }) => {
      const actual = await deterministicPage(browser, viewport, colorScheme);
      const reference = await deterministicPage(browser, viewport, colorScheme);

      await waitUntilReady(actual.page, "/?fixture=1");
      await waitUntilReady(reference.page, "/reference.html?fixture=1");

      expect(await actual.page.screenshot({ fullPage: true })).toEqual(
        await reference.page.screenshot({ fullPage: true }),
      );

      await actual.context.close();
      await reference.context.close();
    });
  }
}
