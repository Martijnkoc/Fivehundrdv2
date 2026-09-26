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

test("sitemap index, robots and llms.txt", async ({ request }) => {
  const index = await (await request.get("/sitemap.xml")).text();
  expect(index).toContain("<sitemapindex");
  expect(index).toMatch(/\/sitemaps\/pages\.xml<\/loc>/);
  const map = await (await request.get("/sitemaps/pages.xml")).text();
  for (const p of [...PAGES, "lanes/music", "lanes/newsletters"]) expect(map).toContain(`/${p}</loc>`);
  for (const bad of ["/founder", "/admin", "/api", "fixture", "demo"]) expect(map).not.toContain(bad);
  expect((await request.get("/sitemaps/nope.xml")).status()).toBe(404);
  const robots = await (await request.get("/robots.txt")).text();
  for (const d of ["/founder", "/admin", "/api/"]) expect(robots).toContain(`Disallow: ${d}`);
  expect(robots).toMatch(/Sitemap: .*\/sitemap\.xml/);
  const llms = await request.get("/llms.txt");
  expect(llms.headers()["content-type"]).toContain("text/markdown");
  const text = await llms.text();
  for (const t of ["The Wall", "72 hours", "Finds", "Create"]) expect(text).toContain(t);
});

test("private surfaces send noindex, and pages without a story are a real 404", async ({ request }) => {
  for (const p of ["/founder/login", "/admin", "/api/wall"]) expect((await request.get(p)).headers()["x-robots-tag"], p).toContain("noindex");
  expect((await request.get("/s/music/1/zzzzzzzz")).status()).toBe(404);
  expect((await request.get("/lanes/jazz")).status()).toBe(404);
});

test("the home page tells machines what Fivehundrd is", async ({ page }) => {
  await page.goto("/?fixture=1");
  await expect(page.locator("h1")).toHaveCount(1);
  await expect(page.locator('meta[property="og:image"]')).toHaveAttribute("content", /opengraph-image/);
  const ld = (await page.locator('script[type="application/ld+json"]').allTextContents()).map((s) => JSON.parse(s));
  const types = ld.flatMap((d) => (d["@graph"] ? d["@graph"].map((g: { "@type": string }) => g["@type"]) : [d["@type"]]));
  for (const t of ["Organization", "WebSite", "WebPage", "DefinedTermSet"]) expect(types).toContain(t);
  expect(await page.locator("link[rel=canonical]").getAttribute("href")).toMatch(/^https?:\/\/[^/]+\/?$/);
});
