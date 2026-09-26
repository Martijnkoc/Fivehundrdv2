"use client";

import { useEffect } from "react";
import { bridge } from "./store";

let started = false;

/**
 * Starts the wall's behaviour once the page has hydrated: fixture mode first
 * (it patches the clock and Math.random), then the controller, on the live
 * wall when Supabase is configured (the demo wall with ?demo=1 or ?fixture=1).
 * Guarded so React's development double-mount does not start it twice.
 */
export function WallRuntime() {
  useEffect(() => {
    if (started) return;
    started = true;
    (async () => {
      await import("../../scripts/fixture.js");
      const { startWall } = await import("./controller");
      const { fetchFeed, liveWanted, supabase, SUPABASE_URL } = await import("./liveClient");
      if (!liveWanted()) return startWall(bridge);
      /* back from a login link: let Supabase read it before the wall rewrites the address */
      if (/access_token|error_description/.test(location.hash)) await (await supabase()).auth.getSession();
      /* the live wall (open spots only if the database can't be reached; it catches up each minute) */
      document.documentElement.dataset.live = "1";
      const feed = await fetchFeed().catch(() => ({ now: "", stories: [], held: [] }));
      startWall(bridge, { feed, base: SUPABASE_URL });
    })();
  }, []);
  return null;
}
