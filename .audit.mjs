import { chromium } from "@playwright/test";
const S = "/tmp/claude-0/-home-user-Fivehundrdv2/33ba028c-1c10-5a93-a1e1-0bd04fd36df3/scratchpad/audit";
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const sizes = [["se1",320,568],["se",375,667],["iphone",390,844],["android",412,915],["promax",430,932]];
for (const [n,w,h] of sizes) {
  const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const p = await ctx.newPage();
  await p.addInitScript(() => { window.__cls = 0; new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__cls += e.value; }).observe({ type: "layout-shift", buffered: true }); });
  await p.goto("http://127.0.0.1:3000/?fixture=1"); await p.waitForTimeout(1500);
  await p.screenshot({ path: S + "/" + n + "-load.png" });
  const r = await p.evaluate(() => {
    const W = innerWidth;
    const over = [...document.querySelectorAll("body *")].filter((e) => { const b = e.getBoundingClientRect(); return b.width && (b.right > W + 1) && getComputedStyle(e).position !== "fixed" && !e.closest("nav.primary,.lanes-scroll,#lanes"); }).slice(0, 8).map((e) => e.className || e.tagName);
    const vis = (e) => { const b = e.getBoundingClientRect(); return b.width > 0 && b.bottom > 0 && b.top < innerHeight; };
    const small = [...document.querySelectorAll("a,button,input,[role=tab]")].filter(vis).map((e) => { const b = e.getBoundingClientRect(); return [(e.id || e.className || e.tagName).toString().slice(0,30) + ":" + (e.textContent||"").trim().slice(0,14), Math.round(b.width), Math.round(b.height)]; }).filter(([, w, h]) => w < 44 || h < 44).slice(0, 25);
    const trunc = [...document.querySelectorAll("b,span,strong,small,p,h1,h2,a")].filter(vis).filter((e) => e.scrollWidth > e.clientWidth + 1 && getComputedStyle(e).overflow !== "visible").map((e) => (e.textContent||"").trim().slice(0,24)).slice(0, 12);
    const top = document.querySelector(".top").getBoundingClientRect().height;
    const tab = document.querySelector(".tabbar")?.getBoundingClientRect();
    return { docW: document.documentElement.scrollWidth, W, over, small, trunc, header: Math.round(top), tabbar: tab && Math.round(tab.height), nodes: document.getElementsByTagName("*").length, tiles: document.querySelectorAll("#rack .spot").length, svgs: document.querySelectorAll("#rack svg").length };
  });
  console.log(n, JSON.stringify(r));
  await ctx.close();
}
await b.close();
