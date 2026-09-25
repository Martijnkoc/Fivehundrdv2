"use client";

import { useEffect } from "react";
import { bridge } from "./store";

let started = false;

/**
 * Starts the wall's behaviour once the page has hydrated: fixture mode first
 * (it patches the clock and Math.random), then the controller.
 * Guarded so React's development double-mount does not start it twice.
 */
export function WallRuntime() {
  useEffect(() => {
    if (started) return;
    started = true;
    (async () => {
      await import("../../scripts/fixture.js");
      const { startWall } = await import("./controller");
      startWall(bridge);
    })();
  }, []);
  return null;
}
