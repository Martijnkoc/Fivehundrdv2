"use client";

import { useEffect } from "react";
import { bridge } from "./store";

/**
 * Starts the wall's behaviour once the page has hydrated: fixture mode first
 * (it patches the clock and Math.random), then the controller, on the live
 * wall when Supabase is configured (the demo wall with ?demo=1 or ?fixture=1).
 * On the live wall the feed (preloaded by the page), the controller and the
 * live client all load at once, so the wall appears as soon as the slowest is in.
 *
 * Every mount starts a run and every unmount stops it: leaving the wall by a
 * link inside the app and coming back gets a working wall, and React's
 * development double mount starts one run, not two.
 */
export function WallRuntime() {
  useEffect(() => {
    let stop: (() => void) | undefined,
      gone = false;
    const run = (f: () => void) => (gone ? f() : (stop = f));
    (async () => {
      if (new URLSearchParams(location.search).get("fixture") === "1") await import("../../scripts/fixture.js");
      const client = import("./liveClient");
      const controller = import("./controller");
      const { fetchFeed, liveWanted, supabase, SUPABASE_URL } = await client;
      if (gone) return;
      if (!liveWanted()) return run((await controller).startWall(bridge));
      const feed = fetchFeed(true).catch(() => ({ now: "", stories: [], held: [] }));
      /* back from a login link: let Supabase read it before the wall rewrites the address */
      if (/access_token|error_description/.test(location.hash)) await (await supabase()).auth.getSession();
      /* the live wall (open spots only if the database can't be reached; it catches up each minute) */
      document.documentElement.dataset.live = "1";
      const [{ startWall }, f] = await Promise.all([controller, feed]);
      if (gone) return;
      run(startWall(bridge, { feed: f, base: SUPABASE_URL }));
    })();
    return () => {
      gone = true;
      stop?.();
    };
  }, []);
  return null;
}
