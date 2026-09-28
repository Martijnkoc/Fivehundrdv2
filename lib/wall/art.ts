/*
 * genArt from reference.html: seeded patterns in a lane palette, the demo
 * tiles' artwork. Prototype-only filler (BUILD_BRIEF §6): production always
 * has real artwork or a logo.
 *
 * The shapes are computed once, in the reference's draw order, and rendered
 * either as the reference's SVG string or as React elements.
 */
import { rng, type Palette } from "./model";

export type Shape = { tag: "circle" | "rect" | "path"; attrs: [string, string | number][] };

export function artShapes(seed: number, pal: Palette): { bg: string; shapes: Shape[] } {
  const r = rng(seed),
    [a, b, c] = pal,
    k = Math.floor(r() * 5),
    g: Shape[] = [];
  const circle = (...attrs: Shape["attrs"]) => g.push({ tag: "circle", attrs });
  const rect = (...attrs: Shape["attrs"]) => g.push({ tag: "rect", attrs });
  if (k === 0) {
    for (let i = 7; i > 0; i--) circle(["cx", 140 + r() * 120], ["cy", 150 + r() * 40], ["r", i * 26], ["fill", i % 2 ? a : c]);
    rect(["x", "0"], ["y", 190 + r() * 60], ["width", "400"], ["height", "8"], ["fill", b]);
  } else if (k === 1) {
    const w = 14 + r() * 20;
    for (let x = -400; x < 800; x += w * 2)
      rect(["x", x], ["y", "-200"], ["width", w], ["height", "800"], ["fill", a], ["transform", `rotate(${20 + r() * 40} 200 150)`]);
    circle(["cx", 100 + r() * 200], ["cy", 80 + r() * 140], ["r", 50 + r() * 40], ["fill", b]);
  } else if (k === 2) {
    for (let y = 20; y < 300; y += 26) for (let x = 20; x < 400; x += 26) circle(["cx", x], ["cy", y], ["r", 2 + r() * 4], ["fill", a]);
    rect(["x", 60 + r() * 120], ["y", 50 + r() * 80], ["width", 120 + r() * 80], ["height", 120 + r() * 60], ["fill", b]);
  } else if (k === 3) {
    rect(["width", "400"], ["height", 150 + r() * 60], ["fill", a]);
    circle(["cx", 120 + r() * 160], ["cy", "200"], ["r", 80 + r() * 40], ["fill", b]);
    for (let i = 0; i < 6; i++) rect(["x", "0"], ["y", 214 + i * 14], ["width", "400"], ["height", 4 + i], ["fill", c]);
  } else {
    let x = 0;
    while (x < 400) {
      const w = 20 + r() * 90;
      rect(["x", x], ["y", "0"], ["width", w], ["height", "300"], ["fill", [a, b, c][Math.floor(r() * 3)]]);
      x += w;
    }
    g.push({
      tag: "path",
      attrs: [
        ["d", `M0 ${200 + r() * 60} Q200 ${60 + r() * 80} 400 ${180 + r() * 80} L400 300 L0 300Z`],
        ["fill", a],
        ["opacity", ".85"],
      ],
    });
  }
  return { bg: c, shapes: g };
}

/** The reference's SVG markup, byte for byte. */
export function genArt(seed: number, pal: Palette) {
  const { bg, shapes } = artShapes(seed, pal);
  const g = shapes.map((s) => `<${s.tag} ${s.attrs.map(([k, v]) => `${k}="${v}"`).join(" ")}/>`).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300" preserveAspectRatio="xMidYMid slice"><rect width="400" height="300" fill="${bg}"/>${g}</svg>`;
}
