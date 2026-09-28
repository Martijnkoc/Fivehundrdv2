"use client";

import { useEffect, useState } from "react";
import { BRAND, HERO, PROOF, STEPS } from "../../lib/site/copy";
import { bridge } from "./store";

type Today = { available: false } | { available: true; visitors: number; opened: number };
const n = (v: number) => v.toLocaleString("en-US");

/**
 * Today on Fivehundrd: real counts from /api/today, refreshed softly every
 * 45 seconds. Not a live region (it would announce every refresh); without
 * a database there are no numbers, only the line.
 */
function Proof() {
  const [t, setT] = useState<Today | null>(null);
  useEffect(() => {
    let on = true;
    const get = () =>
      fetch("/api/today")
        .then((r) => (r.ok ? r.json() : { available: false }))
        .catch(() => ({ available: false }))
        .then((v: Today) => on && setT(v));
    void get();
    const i = setInterval(() => document.hidden || void get(), 45e3);
    return () => {
      on = false;
      clearInterval(i);
    };
  }, []);
  const real = t?.available ? t : null;
  /* while loading, the numbers' room is kept (invisibly), so they arrive without moving anything */
  const nums = real ?? (t ? null : { visitors: 0, opened: 0 });
  return (
    <aside className="proof" aria-label={real ? PROOF.head : BRAND.statement}>
      {nums && (
        <div className={real ? undefined : "proof-wait"} aria-hidden={real ? undefined : true}>
          <p className="proof-h">{PROOF.head}</p>
          <p className="proof-n">
            <b>{PROOF.visitors(n(nums.visitors))}</b>
            <b>{PROOF.opened(n(nums.opened))}</b>
          </p>
        </div>
      )}
      <p className="proof-line">{PROOF.line}</p>
      {t && !real && <p className="proof-sub">{BRAND.creator}</p>}
      <button type="button" className="proof-cta" onClick={() => bridge.actions.heroCta("proof")}>
        {PROOF.cta}
      </button>
    </aside>
  );
}

/**
 * The first screen (docs/copy.md): what this is in one line, what's here,
 * two ways in, today's real numbers, and the loop in three steps. Only for
 * a first visit: once a visitor has given a Timeheart or signed in, the
 * wall starts right under the header. Whether to show it is decided before the
 * first paint (the script in WallPage), so nothing jumps.
 */
export function Hero() {
  return (
    <section className="hero" aria-labelledby="heroH">
      <div className="hero-in">
        <div className="hero-main">
          <h2 className="hero-h" id="heroH">
            {BRAND.line}
          </h2>
          <p className="hero-sub">{BRAND.support}</p>
          <div className="hero-ctas">
            <button type="button" className="hero-go" onClick={() => bridge.actions.heroCta("explore")}>
              {HERO.explore}
            </button>
            <button type="button" className="hero-make" onClick={() => bridge.actions.heroCta("create")}>
              {HERO.create}
            </button>
          </div>
          <p className="hero-micro">{HERO.micro}</p>
        </div>
        <Proof />
        <div className="steps3">
          <p className="steps3-h">{STEPS.head}</p>
          <ol>
            {STEPS.items.map((s, i) => (
              <li key={s.t}>
                <b>{`${i + 1}. ${s.t}`}</b>
                <span>{s.d}</span>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}

/** Before the first paint: someone who has given a Timeheart (fh-intro) or signed in (fh-account) gets the wall straight away. */
export const heroGate = `try{if(localStorage.getItem("fh-intro")||localStorage.getItem("fh-account"))document.documentElement.classList.add("fh-back")}catch(e){}`;
