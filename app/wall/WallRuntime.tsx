"use client";

import { useEffect } from "react";
/* loaded with the page, not after it: on a slow phone that was a second round trip before the wall */
import { startWall } from "./controller";
import { fetchFeed, liveWanted, supabase, SUPABASE_URL } from "./liveClient";
import { bridge } from "./store";

/**
 * Starts the wall's behaviour once the page has hydrated: fixture mode first
 * (it patches the clock and Math.random), then the controller, on the live
 * wall when Supabase is configured (the demo wall with ?demo=1 or ?fixture=1).
 * On the live wall the feed (preloaded by the page), the controller and the
 * live client come with the page's own scripts, so the wall appears as soon as the feed is in.
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
      if (!liveWanted()) {
        /* unmounted while the fixture loaded (Back can mount the page twice): no run on a page that's gone */
        if (!gone) run(bridge.batch(() => startWall(bridge)));
        return;
      }
      const feed = fetchFeed(true).catch(() => ({ now: "", stories: [], held: [] }));
      /* back from a login link: let Supabase read it before the wall rewrites the address */
      if (/access_token|error_description/.test(location.hash)) await (await supabase()).auth.getSession();
      /* the live wall (open spots only if the database can't be reached; it catches up each minute) */
      document.documentElement.dataset.live = "1";
      const f = await feed;
      if (gone) return;
      run(bridge.batch(() => startWall(bridge, { feed: f, base: SUPABASE_URL })));
    })();
    return () => {
      gone = true;
      stop?.();
    };
  }, []);
  return null;
}
