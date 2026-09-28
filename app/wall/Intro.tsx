"use client";

import { useEffect, useState } from "react";

/**
 * Phones, first visit: one line that says what this is, until the visitor
 * closes it or saves their first find. (Hidden from 700px up.)
 */
export function Intro() {
  const [show, setShow] = useState(false);
  useEffect(() => {
    try {
      if (!localStorage.getItem("fh-intro")) setShow(true);
    } catch {}
    const off = () => setShow(false);
    addEventListener("fh-intro-done", off);
    return () => removeEventListener("fh-intro-done", off);
  }, []);
  if (!show) return null;
  return (
    <div className="intro" role="note">
      <p>
        <b>500 spots. 72 hours each.</b> Scroll, open what catches your eye, and save what you want to keep.
      </p>
      <button
        type="button"
        aria-label="Got it"
        onClick={() => {
          try {
            localStorage.setItem("fh-intro", "1");
          } catch {}
          setShow(false);
        }}
      >
        &times;
      </button>
    </div>
  );
}
