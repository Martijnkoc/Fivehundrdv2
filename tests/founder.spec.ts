import { expect, test } from "@playwright/test";

/*
 * The Control Room (docs/founder-dashboard.md) is a separate, private surface:
 * nothing without a founder session, and the public wall never loads its code.
 */
test.beforeEach(() => test.skip(test.info().project.name === "reference", "app only"));

test("the Control Room asks for sign-in and gives nothing away", async ({ page, request }) => {
  await page.goto("/founder/overview?range=30d");
  await expect(page).toHaveURL(/\/founder\/login$/);
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  await expect(page.locator("meta[name=robots]")).toHaveAttribute("content", /noindex/);
  /* its own root layout: none of the wall's styles or markup */
  expect(await page.locator("#rack, .rack, .shelf-row").count()).toBe(0);
  expect(await page.evaluate(() => [...document.querySelectorAll("style")].some((s) => s.textContent?.includes(".book{")))).toBe(false);

  for (const path of ["/founder", "/founder/spots/00000000-0000-4000-a000-000000000000", "/founder/exports"]) {
    const r = await request.get(path, { maxRedirects: 0 });
    expect([307, 308]).toContain(r.status());
    expect(r.headers().location).toContain("/founder/login");
  }
  expect((await request.get("/api/founder/feed")).status()).toBe(401);
  expect((await request.get("/api/founder/exports")).status()).toBe(401);
  expect((await request.post("/api/founder/exports", { data: { dataset: "spots", format: "csv" } })).status()).toBe(401);
  expect((await request.get("/api/founder/exports/00000000-0000-4000-a000-000000000000")).status()).toBe(401);
  /* a made-up cookie is not a session */
  const forged = await request.get("/api/founder/feed", { headers: { cookie: "fh_founder=eyJlIjoieEB5LnoiLCJ4Ijo5OTk5OTk5OTk5OTk5fQ.abc" } });
  expect(forged.status()).toBe(401);
});

test("the public wall loads none of the Control Room's code", async ({ page }) => {
  const bodies: string[] = [];
  page.on("response", async (r) => {
    if (["script", "stylesheet"].includes(r.request().resourceType())) bodies.push(await r.text().catch(() => ""));
  });
  await page.goto("/?fixture=1");
  await page.waitForLoadState("networkidle");
  expect(bodies.length).toBeGreaterThan(0);
  for (const b of bodies) {
    expect(b).not.toContain("/api/founder");
    expect(b).not.toContain("Control Room");
    expect(b).not.toContain("cr-side");
  }
});

test("addresses nothing answers get a proper 404", async ({ page }) => {
  const r = await page.goto("/no-such-page");
  expect(r?.status()).toBe(404);
  await expect(page.getByRole("heading", { name: "Nothing lives at this address." })).toBeVisible();
});
