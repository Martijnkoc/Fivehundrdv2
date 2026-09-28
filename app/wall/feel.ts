/*
 * Craft pass (approved change): the wall answers the pointer. The artwork
 * of the tile under a mouse shifts a few pixels against it, as if printed a
 * little above the card. One delegated listener, one write per frame, and
 * only for a fine pointer that hovers, without reduced motion.
 */
const RANGE = 4;

export function startFeel(rack: HTMLElement) {
  const fine = matchMedia("(hover:hover) and (pointer:fine)");
  const reduce = matchMedia("(prefers-reduced-motion: reduce)");
  let cur: HTMLElement | null = null,
    x = 0,
    y = 0,
    frame = 0;

  const reset = (el: HTMLElement | null) => {
    if (!el) return;
    el.style.removeProperty("--px");
    el.style.removeProperty("--py");
  };
  const write = () => {
    frame = 0;
    if (!cur) return;
    const r = cur.getBoundingClientRect();
    const dx = (x - r.left) / r.width - 0.5,
      dy = (y - r.top) / r.height - 0.5;
    cur.style.setProperty("--px", (-dx * 2 * RANGE).toFixed(2) + "px");
    cur.style.setProperty("--py", (-dy * 2 * RANGE).toFixed(2) + "px");
  };

  rack.addEventListener(
    "pointermove",
    (e) => {
      if (e.pointerType !== "mouse" || !fine.matches || reduce.matches) return;
      const book = (e.target as Element).closest<HTMLElement>(".spot:not(.vacant) .book");
      if (book !== cur) {
        reset(cur);
        cur = book;
      }
      if (!cur) return;
      x = e.clientX;
      y = e.clientY;
      if (!frame) frame = requestAnimationFrame(write);
    },
    { passive: true },
  );
  rack.addEventListener("pointerleave", () => {
    reset(cur);
    cur = null;
  });
}
