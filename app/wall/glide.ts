/*
 * Desktop (§6): one continuous glide of the page to a spot's row, then the
 * panel opens. A wheel turn or a touch ends it where it is (and still runs
 * what was waiting for it). With reduced motion it jumps.
 */
export function createGlide(reduce: boolean, signal: AbortSignal) {
  let tween = 0,
    tweenDone: (() => void) | null = null;
  function cancel(finish: boolean) {
    if (!tween) return;
    cancelAnimationFrame(tween);
    tween = 0;
    const d = tweenDone;
    tweenDone = null;
    if (finish && d) d();
  }
  function to(y: number, done?: () => void) {
    cancel(true);
    const max = document.documentElement.scrollHeight - innerHeight;
    y = Math.max(0, Math.min(max, y));
    const from = scrollY,
      dist = y - from;
    if (Math.abs(dist) < 2 || reduce) {
      window.scrollTo(0, y);
      done?.();
      return;
    }
    const dur = Math.min(420, Math.max(180, Math.abs(dist) * 0.32));
    let t0 = 0;
    tweenDone = done ?? null;
    const f = (now: number) => {
      if (!t0) t0 = now - 16;
      const t = Math.max(0, Math.min(1, (now - t0) / dur)),
        e = 1 - Math.pow(1 - t, 3);
      window.scrollTo(0, from + dist * e);
      if (t < 1) tween = requestAnimationFrame(f);
      else {
        tween = 0;
        const d = tweenDone;
        tweenDone = null;
        d?.();
      }
    };
    tween = requestAnimationFrame(f);
  }
  ["wheel", "touchstart"].forEach((ev) => addEventListener(ev, () => cancel(true), { signal, passive: true }));
  return { to, cancel };
}
