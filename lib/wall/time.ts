import { BIND, LIFE, lum, rng, type Spot } from "./model";

type Timed = { start: number };

/** Milliseconds this story has left on the wall. */
export const left = (s: Timed) => Math.max(0, s.start + LIFE - Date.now());

export function short(ms: number) {
  const h = Math.floor(ms / 3600e3);
  return h >= 1 ? h + "h" : Math.max(1, Math.floor(ms / 60e3)) + "m";
}

export function long(ms: number) {
  const d = Math.floor(ms / 864e5),
    h = Math.floor((ms % 864e5) / 3600e3),
    m = Math.floor((ms % 3600e3) / 60e3),
    s = Math.floor((ms % 60e3) / 1e3);
  return (d ? d + "d " : "") + h + "h " + String(m).padStart(2, "0") + "m " + String(s).padStart(2, "0") + "s";
}

export function until(s: Timed) {
  return new Date(s.start + LIFE).toLocaleString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** The lane colours and ageing of one story, as CSS custom properties. */
export function styleFor(s: { lane: keyof typeof BIND; start: number; seed?: number }) {
  const l = left(s) / LIFE,
    b = BIND[s.lane] || BIND.writers,
    c1 = b.c1,
    light = lum(c1) > 0.28;
  return `--age:${(1 - l) * 0.9};--left:${l};--c1:${c1};--c2:${b.c2};--c3:${b.c3};--pill:${b.pill || "#ff7bc3"};--pillt:${b.pillt || "#0d0d0d"};--h:${[50, 54, 54, 58, 62][(s.seed || 0) % 5]}px;--st:${light ? "#141210" : "#fbf5e6"};--emb:${light ? "0 1px 0 rgba(255,255,255,.55)" : "0 -1px 0 rgba(0,0,0,.55),0 1px 0 rgba(255,255,255,.14)"};--sm:${light ? "rgba(20,18,16,.72)" : "rgba(251,245,230,.74)"}`;
}

/** Per-spot layout variables, seeded so every visitor sees the same wall. */
export function bookVars(s: Spot) {
  const r = rng(("seed" in s && s.seed ? s.seed : s.no * 7919) ^ 0x5f3),
    bw = 0.8 + r() * 0.16,
    ar = [0.707, 0.707, 0.78, 1, 0.8][Math.floor(r() * 5)],
    rot = r() < 0.3 ? 0 : r() * 6 - 3,
    tx = (r() * 10 - 5).toFixed(1),
    ty = (r() * 14).toFixed(1),
    tape = ["rgba(216,255,69,.82)", "rgba(255,123,195,.82)", "rgba(243,234,211,.9)"][Math.floor(r() * 3)],
    tr = (r() * 10 - 5).toFixed(1);
  return `--bw:${bw.toFixed(3)};--ar:${ar};--rot:${rot.toFixed(2)}deg;--tx:${tx}px;--ty:${ty}px;--tape:${tape};--tr:${tr}deg`;
}

export function spotStyle(s: Spot) {
  return s.vacant ? bookVars(s) : styleFor(s) + ";" + bookVars(s);
}
