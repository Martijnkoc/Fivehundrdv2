/*
 * The wall's flights (craft pass, §11): the artwork travelling from a tile
 * into the desktop panel, and a kept tile flying into the Scout Card (or,
 * on phones, into the tab bar). Transform and opacity only; the callers
 * skip them with reduced motion.
 */
import type { FilledSpot } from "../../lib/wall/model";
import { skey } from "../../lib/wall/saves";

/**
 * Desktop: the tile's own artwork travels from the wall into the panel that
 * opens under it, so the spot becomes the full view rather than a panel
 * appearing (the phone overlay already grows out of its tile).
 */
export function morphOpen(el: HTMLElement, rack: HTMLElement, signal: AbortSignal) {
  const panel = rack.querySelector<HTMLElement>(".panel"),
    src = el.querySelector<HTMLElement>(".bk-art"),
    art = panel?.querySelector<HTMLElement>(".cover > .art");
  if (!panel || !src || !art) return;
  const a = src.getBoundingClientRect(),
    b = art.getBoundingClientRect();
  if (b.top > innerHeight || b.bottom < 0 || !a.width) return;
  const g = document.createElement("div");
  g.className = "morph";
  g.setAttribute("style", el.getAttribute("style") ?? "");
  g.setAttribute("aria-hidden", "true");
  g.innerHTML = src.innerHTML;
  const rect = (r: DOMRect) => ({ left: r.left + "px", top: r.top + "px", width: r.width + "px", height: r.height + "px" });
  Object.assign(g.style, rect(a));
  document.body.appendChild(g);
  art.style.opacity = "0";
  const flight = g.animate([rect(a), { ...rect(b), borderRadius: "4px 0 0 4px" }], { duration: 380, easing: "cubic-bezier(.2,.9,.25,1)", fill: "forwards" });
  let landed = false;
  const land = () => {
    if (landed) return;
    landed = true;
    art.style.opacity = "";
    g.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 140, fill: "forwards" }).onfinish = () => g.remove();
  };
  flight.onfinish = land;
  flight.oncancel = land;
  /* scrolling or another click mid-flight: land at once */
  addEventListener("wheel", land, { signal, once: true, passive: true });
}

/** The tab bar's Finds count gives a small hop. */
export function bumpTab() {
  const n = document.getElementById("tbN");
  if (!n) return;
  n.classList.remove("pop");
  void n.offsetWidth;
  n.classList.add("pop");
}

/** A copy of the tile, at `from`, to fly. */
function ghostBook(li: HTMLElement, from: DOMRect) {
  const g = document.createElement("div");
  g.className = "flyer";
  g.setAttribute("style", li.getAttribute("style") + `;left:${from.left}px;top:${from.top}px;width:${from.width}px;height:${from.height}px`);
  const b = li.querySelector(".book")!.cloneNode(true) as HTMLElement;
  b.style.cssText = "width:100%;height:100%;transform:none;aspect-ratio:auto";
  g.appendChild(b);
  document.body.appendChild(g);
  return g;
}

/** Phones and tablets with the card closed: into the tab bar's Finds. */
export function flyToTab(li: HTMLElement, from: DOMRect, reduce: boolean) {
  const tab = document.querySelector('[data-tab="card"] .tb-ic');
  if (!tab || reduce) {
    bumpTab();
    return;
  }
  const to = tab.getBoundingClientRect(),
    k = Math.max(0.12, (to.height * 1.3) / from.height);
  const g = ghostBook(li, from),
    dx = to.left + to.width / 2 - from.left - (from.width * k) / 2,
    dy = to.top - from.top - 4;
  const a = g.animate(
    [
      { transform: "translate(0,0) scale(1) rotate(0)", opacity: 1, transformOrigin: "0 0" },
      { transform: `translate(${dx * 0.4}px,${dy * 0.4 - 60}px) scale(${(1 + k) / 2}) rotate(-8deg)`, opacity: 1, offset: 0.45, transformOrigin: "0 0" },
      { transform: `translate(${dx}px,${dy}px) scale(${k}) rotate(0)`, opacity: 0.3, transformOrigin: "0 0" },
    ],
    { duration: 620, easing: "cubic-bezier(.3,.7,.2,1)" },
  );
  const done = () => {
    g.remove();
    bumpTab();
  };
  a.onfinish = done;
  a.oncancel = done;
}

/** Into its place in the Scout Card's list; `headY` is where the page's header ends. */
export function flyToCard(li: HTMLElement, s: FilledSpot, from: DOMRect | null, reduce: boolean, headY: number) {
  const target = document.querySelector<HTMLElement>(`#card .msp[data-k="${skey(s)}"]`);
  if (!target || !from) return;
  if (reduce) {
    target.classList.add("landed");
    return;
  }
  const to = target.querySelector(".sq")!.getBoundingClientRect();
  const visible = to.bottom > headY && to.top < innerHeight,
    k = Math.max(0.15, (to.height * 1.25) / from.height);
  const g = ghostBook(li, from),
    dx = to.left + 10 - from.left,
    dy = (visible ? to.top - 4 : headY - from.height * k) - from.top;
  target.classList.add("landing");
  const a = g.animate(
    [
      { transform: "translate(0,0) scale(1) rotate(0)", opacity: 1, transformOrigin: "0 0" },
      { transform: `translate(${dx * 0.45}px,${dy * 0.45 - 50}px) scale(${(1 + k) / 2}) rotate(-6deg)`, opacity: 1, offset: 0.45, transformOrigin: "0 0" },
      { transform: `translate(${dx}px,${dy}px) scale(${k}) rotate(0)`, opacity: 0, transformOrigin: "0 0" },
    ],
    { duration: 640, easing: "cubic-bezier(.3,.7,.2,1)" },
  );
  const done = () => {
    g.remove();
    target.classList.remove("landing");
    target.classList.add("landed");
  };
  a.onfinish = done;
  a.oncancel = done;
}
