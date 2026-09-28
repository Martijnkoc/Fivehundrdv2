/*
 * Fixture mode (BUILD_BRIEF §1.3), active only with `?fixture=1`.
 *
 * Inlined at the top of <head> by prepare-reference.mjs so it runs before the
 * wall's own script. The wall's demo data already comes from `rng(500)`; this
 * pins the two remaining sources of drift:
 *   - the clock: `Date.now()` and `new Date()` both read 2026-09-24T12:00:00Z,
 *     so countdowns, ageing, "today" and the card's date are identical on
 *     every run;
 *   - `Math.random()`: a seeded generator, which fixes the visitor's
 *     ring-entry point and the spot numbers offered by "Create your story".
 */
(() => {
  if (new URLSearchParams(location.search).get("fixture") !== "1") return;

  const FROZEN = Date.UTC(2026, 8, 24, 12, 0, 0);
  const RealDate = Date;
  class FixtureDate extends RealDate {
    constructor(...args) {
      super(...(args.length ? args : [FROZEN]));
    }
    static now() {
      return FROZEN;
    }
  }
  window.Date = FixtureDate;

  let seed = 396;
  Math.random = () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  document.documentElement.dataset.fixture = "1";
})();
