import { deflateSync } from "node:zlib";
import { expect, test, viewports } from "./wall";

/*
 * The maker's tools (approved 2026-10-05, overrides/19-maker-tools.css): in
 * the Create form and the open spot, something coming up with its day, two
 * more images for Art and Games, and what an audio clip is from. (Fixing a
 * spot, clicks per link and the report after 72 hours run on the live wall:
 * db/schema.test.mjs and lib/wall tests.)
 */
test.beforeEach(() => test.skip(test.info().project.name === "reference", "approved change: the maker's tools"));

const [phone, , desktop] = viewports;

/** A small solid PNG, so each extra image is told apart in a screenshot. */
function png(r: number, g: number, b: number, size = 24) {
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (buf: Buffer) => {
    let c = 0xffffffff;
    for (const x of buf) c = crcTable[(c ^ x) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const c = Buffer.alloc(4);
    c.writeUInt32BE(crc(td));
    return Buffer.concat([len, td, c]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  const row = Buffer.concat([Buffer.from([0]), Buffer.from(Array.from({ length: size }, () => [r, g, b]).flat())]);
  const raw = Buffer.concat(Array.from({ length: size }, () => row));
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}
const PINK = { name: "pink.png", mimeType: "image/png", buffer: png(255, 123, 195) };
const LIME = { name: "lime.png", mimeType: "image/png", buffer: png(216, 255, 69) };
const INK = { name: "ink.png", mimeType: "image/png", buffer: png(20, 18, 16) };

/** The day `days` after the page's own today (the fixture's clock), as the date field takes it. */
const dayAhead = (page: import("@playwright/test").Page, days: number) =>
  page.evaluate((d) => {
    const t = new Date(Date.now() + d * 864e5);
    return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
  }, days);

for (const scheme of ["light", "dark"] as const)
  test.describe(`${desktop.name} ${scheme}`, () => {
    test.use({ viewport: { width: desktop.width, height: desktop.height }, viewportSpec: desktop, colorScheme: scheme });

    test("a game with something coming up and two more images, placed and open (approved)", async ({ wall, page }) => {
      await wall.goto();
      await wall.openCreate();
      await page.locator('#fLane [data-l="games"]').click();
      await page.locator("#fName").fill("Lantern Run");
      await page.locator("#fArt").setInputFiles(INK);
      await page.locator("#fMore").setInputFiles([PINK, LIME]);
      await expect(page.locator(".more-imgs .mi img")).toHaveCount(2);
      /* two at most: the add box goes once there are two */
      await expect(page.locator("#fMore")).toHaveCount(0);
      await page.locator("[data-link]").first().fill("lanternrun.itch.io");
      await page.locator("#fSnip").fill("A tiny co-op game about carrying light home.");
      await page.locator("#fMile").fill("Demo out");
      await page.locator("#fMileOn").fill(await dayAhead(page, 9));
      const prev = page.locator("#fPrev");
      await expect(prev.locator(".mile b")).toHaveText("Demo out");
      await expect(prev.locator(".mile span")).toContainText("in 9 days");
      await expect(prev.locator(".gal-i")).toHaveCount(3);
      await page.locator("#fPay").click();
      await expect(page.locator("#claimH")).toHaveText("You're on the wall.");
      await page.locator("#dSee").click();
      const open = page.locator("#rack .panel .cover");
      await expect(open.locator(".title")).toHaveText("Lantern Run");
      await expect(open.locator(".gal-i").first()).toHaveAttribute("aria-pressed", "true");
      /* a small square switches the big image, and the spot stays open */
      await open.locator(".gal-i").nth(1).click();
      await expect(open.locator(".gal-i").nth(1)).toHaveAttribute("aria-pressed", "true");
      await expect(open.locator(".art > img")).toHaveAttribute("alt", "Image 2 for Lantern Run");
      await expect(page.locator("#rack .panel")).toHaveCount(1);
      await wall.quiet();
      await expect(open).toHaveScreenshot(["approved", `${desktop.name}-${scheme}-maker-tools-open.png`]);
    });

    test("a song preview says what it's from; a day that has passed isn't shown", async ({ wall, page }) => {
      await wall.goto();
      await wall.openCreate();
      const prev = page.locator("#fPrev");
      /* the line only asks once there's a clip */
      await expect(page.locator("#fAudioT")).toHaveCount(0);
      await page.locator("#fAudio").setInputFiles({ name: "clip.mp3", mimeType: "audio/mpeg", buffer: Buffer.alloc(2000) });
      await page.locator("#fAudioT").fill("Night Bus EP");
      await expect(prev.locator(".pcap")).toContainText("30-second preview from Night Bus EP.");
      await page.locator("#fMile").fill("Album out");
      await expect(prev.locator(".mile")).toHaveText("Album out");
      await page.locator("#fMileOn").fill(await dayAhead(page, 1));
      await expect(prev.locator(".mile span")).toHaveText("Tomorrow");
      await page.locator("#fMileOn").fill(await dayAhead(page, -2));
      await expect(prev.locator(".mile")).toHaveCount(0);
      /* more images are for Art and Games only */
      await expect(page.locator("#fMore")).toHaveCount(0);
    });
  });

test.describe(`${phone.name} light`, () => {
  test.use({ viewport: { width: phone.width, height: phone.height }, viewportSpec: phone, colorScheme: "light", hasTouch: true });

  test("in steps: more images with the artwork, coming up with the story; the open sheet keeps its close button clear (approved)", async ({ wall, page }) => {
    await wall.goto();
    await wall.openCreate();
    await page.locator(".st-lane", { hasText: "Creators" }).click();
    await page.locator(".st-upload input").first().setInputFiles(INK);
    await page.locator("#fMore").setInputFiles([PINK]);
    await expect(page.locator(".more-imgs .mi img")).toHaveCount(1);
    await page.locator(".st-next").click();
    await page.locator("#fName").fill("Harbour Lights");
    await page.locator(".st-next").click();
    await page.locator("#fSnip").fill("Ink drawings of ports at night.");
    await page.locator("#fMile").fill("Show opens");
    await page.locator("#fMileOn").fill(await dayAhead(page, 3));
    await page.locator(".st-next").click();
    await page.locator("[data-link]").first().fill("harbourlights.art");
    await page.locator(".st-next").click();
    await page.locator("#fPay").click();
    await expect(page.locator("#claimH")).toHaveText("You're on the wall.");
    await page.locator("#dSee").click();
    const sheet = page.locator(".dsheet .cover").first();
    await expect(sheet.locator(".title")).toHaveText("Harbour Lights");
    await expect(sheet.locator(".gal-i")).toHaveCount(2);
    await sheet.locator(".gal-i").nth(1).tap();
    await expect(sheet.locator(".gal-i").nth(1)).toHaveAttribute("aria-pressed", "true");
    await wall.quiet();
    await expect(sheet.locator(".art")).toHaveScreenshot(["approved", `${phone.name}-light-maker-tools-sheet-art.png`]);
  });
});
