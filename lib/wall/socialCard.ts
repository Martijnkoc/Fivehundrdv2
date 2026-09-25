/*
 * §13: the 1080×1350 social card shown after claiming a spot (drawCard in
 * the reference): wordmark sticker, artwork, "Live for 3 days", name, lane
 * and end time, footer band. Same drawing calls, same order, same pixels.
 */
import { genArt } from "./art";
import { LANE, pad, type LaneId, type Palette } from "./model";
import { until } from "./time";

type CardSpot = { no: number; name: string; lane: LaneId; start: number; img?: string | null; seed: number; pal: Palette };

function loadImg(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = reject;
    i.src = src;
  });
}

export async function drawCard(s: CardSpot) {
  try {
    await document.fonts.ready;
  } catch {}
  const W = 1080,
    H = 1350,
    c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const x = c.getContext("2d")!;
  x.fillStyle = "#ebe5d8";
  x.fillRect(0, 0, W, H);
  // wordmark sticker
  x.save();
  x.translate(80, 70);
  x.transform(1, 0, -0.1405, 1, 0, 0);
  x.fillStyle = "#0d0d0d";
  x.fillRect(0, 0, 330, 84);
  x.font = "900 60px Inter, Arial, sans-serif";
  x.textBaseline = "alphabetic";
  let cx = 22;
  for (const [t, col] of [
    ["f", "#ff7bc3"],
    ["ive", "#fffdf8"],
    ["h", "#ff7bc3"],
    ["undrd", "#fffdf8"],
    [".", "#d8ff45"],
  ]) {
    x.fillStyle = col;
    x.letterSpacing = "-3px";
    x.fillText(t, cx, 62);
    cx += x.measureText(t).width;
  }
  x.restore();
  x.fillStyle = "#0d0d0d";
  x.textAlign = "right";
  x.font = "700 34px Inter, Arial, sans-serif";
  x.fillText(`No. ${pad(s.no)} / 500`, W - 80, 126);
  x.textAlign = "left";
  // artwork
  const ax = 80,
    ay = 200,
    aw = 920,
    ah = 700;
  const img = await loadImg(s.img || "data:image/svg+xml;charset=utf-8," + encodeURIComponent(genArt(s.seed, s.pal)));
  const sc = Math.max(aw / img.width, ah / img.height),
    iw = img.width * sc,
    ih = img.height * sc;
  x.save();
  x.beginPath();
  x.rect(ax, ay, aw, ah);
  x.clip();
  x.drawImage(img, ax + (aw - iw) / 2, ay + (ah - ih) / 2, iw, ih);
  x.globalAlpha = 0.16;
  x.fillStyle = "#000";
  for (let yy = ay; yy < ay + ah; yy += 8)
    for (let xx = ax; xx < ax + aw; xx += 8) {
      x.beginPath();
      x.arc(xx + 4, yy + 4, 1.5, 0, 7);
      x.fill();
    }
  x.restore();
  x.fillStyle = "#d8ff45";
  x.save();
  x.translate(ax + 24, ay + ah - 70);
  x.rotate(-0.035);
  x.fillRect(0, 0, 300, 52);
  x.fillStyle = "#0d0d0d";
  x.font = "800 28px Inter, Arial, sans-serif";
  x.fillText("Live for 3 days", 20, 36);
  x.restore();
  // name
  x.fillStyle = "#0d0d0d";
  let fs = 120;
  x.font = `900 ${fs}px Inter, Arial, sans-serif`;
  x.letterSpacing = "-6px";
  while (x.measureText(s.name).width > 920 && fs > 54) {
    fs -= 4;
    x.font = `900 ${fs}px Inter, Arial, sans-serif`;
  }
  x.fillText(s.name, 76, ay + ah + 40 + fs * 0.82);
  x.letterSpacing = "0px";
  x.fillStyle = "#ff7bc3";
  x.fillRect(80, ay + ah + 80 + fs * 0.82, 60, 8);
  x.fillStyle = "#0d0d0d";
  x.font = "600 32px Inter, Arial, sans-serif";
  x.fillText(`${LANE[s.lane]}. On the wall until ${until(s)}.`, 160, ay + ah + 92 + fs * 0.82);
  // footer band
  x.fillStyle = "#0d0d0d";
  x.fillRect(0, H - 120, W, 120);
  x.fillStyle = "#fffdf8";
  x.font = "700 36px Inter, Arial, sans-serif";
  x.fillText("Find me on the wall at fivehundrd.", 80, H - 48);
  x.fillStyle = "#d8ff45";
  x.beginPath();
  x.arc(W - 110, H - 60, 22, 0, 7);
  x.fill();
  return c;
}
