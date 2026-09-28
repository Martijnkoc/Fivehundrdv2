import { chromium } from "@playwright/test";
const OUT = process.argv[2];
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const SIZES = [[320, 568], [375, 667], [390, 844], [430, 932]];
const U = "http://127.0.0.1:3000/?fixture=1";

const probe = () => {
  const W = innerWidth, H = innerHeight;
  const vis = (e) => { const r = e.getBoundingClientRect(); const s = getComputedStyle(e); return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && s.display !== "none" && r.bottom > 0 && r.top < H && r.right > 0 && r.left < W; };
  const name = (e) => (e.getAttribute("aria-label") || e.textContent || e.className || e.tagName).toString().trim().replace(/\s+/g, " ").slice(0, 40);
  const inScroller = (e) => { for (let p = e.parentElement; p; p = p.parentElement) { const s = getComputedStyle(p); if ((s.overflowX === "auto" || s.overflowX === "scroll") && p.scrollWidth > p.clientWidth) return true; } return false; };
  const covered = (e) => { const r = e.getBoundingClientRect(); const x = r.left + r.width / 2, y = r.top + r.height / 2; if (x < 0 || y < 0 || x > W || y > H) return true; const t = document.elementFromPoint(x, y); return t && !e.contains(t) && !t.contains(e); };
  const small = [...document.querySelectorAll("button, a[href], [role=tab], input, textarea, select, label.drop-art")]
    .filter((e) => vis(e) && !covered(e))
    .map((e) => { const r = e.getBoundingClientRect(); return [name(e), Math.round(r.width), Math.round(r.height), e.closest("p,li,span.sub") && e.tagName === "A" ? "inline" : ""]; })
    .filter(([, w, h]) => h < 44 || w < 44)
    /* a real 44x44 target: the corners of a 44px box around its centre still hit it */
    .filter(([n]) => { const e = [...document.querySelectorAll("button, a[href], [role=tab], input, textarea, select, label.drop-art")].find((x) => name(x) === n && vis(x)); if (!e) return true;
      const r = e.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      return ![[-21, -21], [21, -21], [-21, 21], [21, 21]].every(([dx, dy]) => { const t = document.elementFromPoint(cx + dx, cy + dy); return t && (t === e || e.contains(t)); }); });
  const clipped = [...document.querySelectorAll("body *")]
    .filter((e) => vis(e) && e.children.length === 0 && e.textContent.trim() && !covered(e))
    .filter((e) => { const s = getComputedStyle(e); return (e.scrollWidth > e.clientWidth + 1 && s.textOverflow !== "ellipsis" && s.overflowX !== "visible") || (e.getBoundingClientRect().right > W + 1 && !inScroller(e)); })
    .map((e) => [name(e), e.className]);
  const tab = document.querySelector(".tabbar");
  const tr = tab && tab.getBoundingClientRect();
  return { overflow: document.documentElement.scrollWidth - W, small, clipped: clipped.slice(0, 12), tabbar: tr ? [Math.round(tr.top), Math.round(tr.bottom), H, getComputedStyle(tab).position] : null, cls: window.__cls ?? null };
};

const report = {};
for (const [w, h] of SIZES) {
  const ctx = await b.newContext({ viewport: { width: w, height: h }, isMobile: true, hasTouch: true, deviceScaleFactor: 3, userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1" });
  await ctx.addInitScript(() => { window.__cls = 0; new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__cls += e.value; }).observe({ type: "layout-shift", buffered: true }); });
  const p = await ctx.newPage();
  await p.route("**/api/today", (r) => r.fulfill({ json: { available: true, visitors: 1284, opened: 3906 } }));
  const R = (report[w] = {});
  const step = async (k) => { await p.waitForTimeout(700); R[k] = await p.evaluate(probe); };
  await p.goto(U); await p.waitForSelector("#rack[data-complete]"); await p.waitForTimeout(1200);
  await step("first");
  await p.evaluate(() => window.scrollTo(0, 3000)); await p.waitForTimeout(600); R.clsAfterScroll = await p.evaluate(() => window.__cls);
  await p.evaluate(() => window.scrollTo(0, 0));
  await p.evaluate(() => document.querySelector(".spotlight").scrollIntoView()); await step("hotspots");
  await p.locator(".sl-tabs").getByRole("tab", { name: "Newest" }).tap(); await step("newest");
  /* open discovery */
  await p.locator("#rack .spot:not(.vacant) .book").first().tap(); await p.waitForTimeout(900); await step("open");
  R.openZ = await p.evaluate(() => { const t = document.querySelector(".tabbar").getBoundingClientRect(); const e = document.elementFromPoint(t.left + t.width / 2, t.top + 5); return e ? (e.closest(".dsheet") ? "sheet" : e.closest(".tabbar") ? "tabbar" : e.className) : null; });
  R.openSheetBottom = await p.evaluate(() => { const s = document.querySelector("#dsheet"); const t = document.querySelector(".tabbar"); return s ? [Math.round(s.getBoundingClientRect().bottom), Math.round(t.getBoundingClientRect().top)] : null; });
  await p.goBack(); await p.waitForTimeout(700);
  R.backClosesOpen = await p.evaluate(() => document.querySelector("#dsheet").hidden || !document.querySelector("#dsheet").classList.contains("on"));
  /* Scout Card */
  await p.locator('.tabbar [data-tab="finds"], .tabbar button').nth(1).tap(); await p.waitForTimeout(900); await step("card");
  await p.goBack(); await p.waitForTimeout(700);
  R.backClosesCard = await p.evaluate(() => !document.body.classList.contains("card-open") && !document.querySelector(".colophon.on, #card.on"));
  R.backCardState = await p.evaluate(() => [document.body.className, document.querySelector("#card").className]);
  /* Create */
  await p.locator('.tabbar [data-tab="create"]').tap(); await p.waitForTimeout(900); await step("create");
  R.createPay = await p.evaluate(() => { const a = [...document.querySelectorAll("#claimSheet button")].filter((e) => e.offsetParent).map((e) => [e.textContent.trim().slice(0, 20), Math.round(e.getBoundingClientRect().top)]); return a; });
  await p.goBack(); await p.waitForTimeout(700);
  R.backClosesCreate = await p.evaluate(() => !document.querySelector("#claimVeil").classList.contains("on"));
  /* returning visitor */
  await p.evaluate(() => localStorage.setItem("fh-intro", "1"));
  await p.goto(U); await p.waitForSelector("#rack[data-complete]"); await p.waitForTimeout(1000); await step("returning");
  await ctx.close();
}
/* reduced motion + keyboard */
{
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, reducedMotion: "reduce" });
  const p = await ctx.newPage();
  await p.goto(U); await p.waitForSelector("#rack[data-complete]"); await p.waitForTimeout(800);
  report.reduced = await p.evaluate(() => {
    const long = [...document.querySelectorAll("*")].filter((e) => { const s = getComputedStyle(e); const d = (s.transitionDuration + "," + s.animationDuration).split(",").map(parseFloat); return d.some((x) => x > 0.01) && e.getBoundingClientRect().width > 0; });
    return long.slice(0, 15).map((e) => [e.className.toString().slice(0, 40), getComputedStyle(e).transitionDuration, getComputedStyle(e).animationName]);
  });
  await ctx.close();
}
await b.close();
console.log(JSON.stringify(report, null, 1));
