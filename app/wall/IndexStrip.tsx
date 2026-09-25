"use client";

import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type PointerEvent } from "react";
import { LIFE, TOTAL, pad } from "../../lib/wall/model";
import { left } from "../../lib/wall/time";
import { bridge, wallStore } from "./store";

const cssv = (n: string) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
const headY = () => document.getElementById("top")!.getBoundingClientRect().bottom + 12;

/**
 * The index strip: all 500 spots at a glance, with marks for the open spot and
 * the visitor's entry point. Drag it to travel; release to open that spot.
 */
export function IndexStrip() {
  const st = useSyncExternalStore(wallStore.subscribe, wallStore.get, wallStore.getServer);
  const code = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [size, bump] = useState(0);
  const [dark, setDark] = useState(0);
  const [scrub, setScrub] = useState<{ text: string; top: number; on: boolean } | null>(null);
  const scrubbing = useRef(false);
  const last = useRef<HTMLElement | null>(null);

  /* redraw when the strip's size or the colour scheme changes */
  useEffect(() => {
    const cv = canvas.current!;
    const ro = new ResizeObserver(() => bump((n) => n + 1));
    ro.observe(cv);
    const mq = matchMedia("(prefers-color-scheme: dark)");
    const onScheme = () => setDark((d) => d + 1);
    mq.addEventListener?.("change", onScheme);
    return () => {
      ro.disconnect();
      mq.removeEventListener?.("change", onScheme);
    };
  }, []);

  useLayoutEffect(() => {
    const cv = canvas.current!,
      ctx = cv.getContext("2d")!;
    const dpr = devicePixelRatio || 1,
      w = cv.clientWidth,
      ch = cv.clientHeight;
    if (!w || !ch || !st.wall.length) return;
    if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(ch * dpr)) {
      cv.width = Math.round(w * dpr);
      cv.height = Math.round(ch * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, ch);
    const ink = cssv("--ink"),
      line = cssv("--line"),
      row = ch / TOTAL,
      lane = st.lane;
    st.wall.forEach((s, i) => {
      const y = i * row;
      const inLane = lane === "all" || (!s.vacant && s.lane === lane);
      if (s.vacant) {
        ctx.fillStyle = line;
        ctx.globalAlpha = lane === "all" ? 0.9 : 0.3;
        ctx.fillRect(w * 0.55, y, w * 0.45, Math.max(row * 0.8, 0.6));
      } else {
        ctx.fillStyle = ink;
        ctx.globalAlpha = inLane ? 0.25 + 0.75 * (left(s) / LIFE) : 0.12;
        ctx.fillRect(0, y, w, Math.max(row * 0.8, 0.6));
      }
    });
    ctx.globalAlpha = 1;
  }, [st.wall, st.lane, st.minute, st.version, size, dark]);

  const row = (canvas.current?.clientHeight ?? 0) / TOTAL;
  const mark = (no: number | null) =>
    no == null ? { display: "none" } : { display: "block", transform: `translateY(${(no - 1) * row - 2}px)` };
  /* the entry spot is always in the list shown, unless a search is active */
  const entry = st.rack && !st.rack.query && !st.rack.empty ? st.rack.entryNo : null;

  const nearestVisible = (no: number) => {
    for (let d = 0; d < TOTAL; d++)
      for (const n of [no + d, no - d]) {
        const el = document.getElementById("s-" + pad(n));
        if (el && (!el.classList.contains("vacant") || st.lane === "all")) return el;
      }
    return null;
  };
  const scrubTo = (e: PointerEvent) => {
    const r = code.current!.getBoundingClientRect();
    const no = Math.min(TOTAL, Math.max(1, Math.floor(((e.clientY - r.top) / r.height) * TOTAL) + 1));
    const el = nearestVisible(no);
    if (!el) return null;
    window.scrollTo({ top: window.scrollY + el.getBoundingClientRect().top - headY() + 2, behavior: "instant" });
    const s = st.wall[+el.dataset.no! - 1];
    setScrub({ text: s.vacant ? `No. ${pad(s.no)}  open spot` : `No. ${pad(s.no)}  ${s.name}`, top: e.clientY, on: true });
    return el;
  };
  const end = () => {
    if (!scrubbing.current) return;
    scrubbing.current = false;
    setScrub((sc) => sc && { ...sc, on: false });
    let el = last.current;
    if (el) {
      if (el.classList.contains("vacant")) el = nearestVisible(+el.dataset.no! + 1);
      bridge.actions.openSpot(el, { align: true });
    }
  };

  return (
    <>
      <div className="head" aria-hidden="true"></div>
      <div
        ref={code}
        className="code"
        id="code"
        aria-label="Index of all 500 spots. Drag to travel."
        onPointerDown={(e) => {
          bridge.actions.cancelGlide();
          scrubbing.current = true;
          code.current!.setPointerCapture(e.pointerId);
          last.current = scrubTo(e);
        }}
        onPointerMove={(e) => {
          if (scrubbing.current) last.current = scrubTo(e) || last.current;
        }}
        onPointerUp={end}
        onPointerCancel={end}
      >
        <canvas ref={canvas} id="codeCanvas"></canvas>
        <i className="mk mk-e" style={mark(entry)}></i>
        <i className="mk mk-r"></i>
        <i className="mk mk-o" style={mark(st.openNo)}></i>
      </div>
      <div className={scrub?.on ? "scrub on" : "scrub"} id="scrub" style={scrub ? { top: scrub.top + "px" } : undefined}>
        {scrub?.text}
      </div>
    </>
  );
}
