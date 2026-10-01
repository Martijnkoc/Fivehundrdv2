/*
 * Phones (§7): pull the open spot down to put it away, past 120px or with a
 * fast flick. Only from the top of its scroll, or by the grab handle;
 * otherwise it springs back.
 */
export function installSheetDrag(sheet: HTMLElement, scroller: HTMLElement, veil: HTMLElement, close: () => void, signal: AbortSignal) {
  let y0 = 0,
    dy = 0,
    drag = false,
    t0 = 0;
  const start = (e: TouchEvent) => {
    if (scroller.scrollTop > 0 && !(e.target as Element).closest(".grab")) return;
    drag = true;
    y0 = e.touches[0].clientY;
    dy = 0;
    t0 = performance.now();
    sheet.style.transition = "none";
  };
  const move = (e: TouchEvent) => {
    if (!drag) return;
    dy = Math.max(0, e.touches[0].clientY - y0);
    if (dy > 0 && scroller.scrollTop <= 0) {
      e.preventDefault();
      sheet.style.transform = `translateY(${dy}px)`;
      veil.style.opacity = String(Math.max(0, 1 - dy / 400));
    }
  };
  const end = () => {
    if (!drag) return;
    drag = false;
    veil.style.opacity = "";
    const v = dy / Math.max(1, performance.now() - t0);
    if (dy > 120 || v > 0.6) close();
    else {
      sheet.animate([{ transform: `translateY(${dy}px)` }, { transform: "none" }], { duration: 220, easing: "cubic-bezier(.2,.9,.25,1)" });
      sheet.style.transform = "none";
    }
  };
  sheet.addEventListener("touchstart", start, { signal, passive: true });
  sheet.addEventListener("touchmove", move, { signal, passive: false });
  sheet.addEventListener("touchend", end, { signal });
  sheet.addEventListener("touchcancel", end, { signal });
}
