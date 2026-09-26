import { expect, test } from "@playwright/test";

/*
 * The public site around the wall: the footer's pages, lane addresses, and
 * what search and answer engines read (metadata, JSON-LD, sitemap, robots, llms.txt).
 */
test.beforeEach(() => test.skip(test.info().project.name === "reference", "app only"));

const PAGES = ["how-it-works", "pricing", "rules", "faq", "about", "contact", "terms", "privacy"];

test("every footer link leads somewhere real", async ({ page, request }) => {
  await page.goto("/?fixture=1");
  const hrefs = await page.locator(".site-foot a[href]").evaluateAll((as) => as.map((a) => a.getAttribute("href")!));
  expect(hrefs.filter((h) => h === "#")).toEqual([]);
  for (const h of hrefs.filter((h) => h.startsWith("/"))) expect((await request.get(h)).status(), h).toBe(200);
});

test("info pages: one heading, their own canonical, structured data that parses", async ({ page }) => {
  for (const slug of PAGES) {
    await page.goto(`/${slug}`);
    await expect(page.locator("h1")).toHaveCount(1);
    await expect(page.locator("link[rel=canonical]")).toHaveAttribute("href", new RegExp(`/${slug}$`));
    expect((await page.locator("meta[name=description]").getAttribute("content"))!.length).toBeGreaterThan(50);
    for (const s of await page.locator('script[type="application/ld+json"]').allTextContents()) JSON.parse(s);
  }
  await page.goto("/faq");
  const types = (await page.locator('script[type="application/ld+json"]').allTextContents()).map((s) => JSON.parse(s)["@type"] ?? "graph");
  expect(types).toContain("FAQPage");
});

test("a lane's address opens the wall on that lane", async ({ page }) => {
  await page.goto("/lanes/books?fixture=1");
  await expect(page).toHaveTitle(/^Books/);
  await expect(page.locator("#lanes [aria-current]")).toHaveText("Books");
  await expect(page.locator("link[rel=canonical]")).toHaveAttribute("href", /\/lanes\/books$/);
});

test("Claim a spot from another page opens Create", async ({ page }) => {
  await page.goto("/pricing");
  await page.locator(".info-top .info-claim").click();
  await expect(page.locator("#claimVeil")).toHaveClass(/\bon\b/);
});

test("sitemap, robots and llms.txt", async ({ request }) => {
  const map = await (await request.get("/sitemap.xml")).text();
  for (const p of [...PAGES, "lanes/music", "lanes/newsletters"]) expect(map).toContain(`/${p}</loc>`);
  const robots = await (await request.get("/robots.txt")).text();
  expect(robots).toMatch(/Disallow: \/founder/);
  expect(robots).toMatch(/Disallow: \/api\//);
  expect(robots).toMatch(/Sitemap: .*\/sitemap\.xml/);
  const llms = await request.get("/llms.txt");
  expect(llms.headers()["content-type"]).toContain("text/markdown");
  expect(await llms.text()).toContain("$9.95");
});
