/*
 * The wall's reach, shown in the Hotspots band: people on the wall and spots
 * saved, today or this week. PLACEHOLDER NUMBERS until the live feed carries
 * `stats` (Feed.stats): they follow a plausible day curve so the band can be
 * designed and tested, and must be replaced by real counts before launch.
 */

export type Reach = { visitors: number; saves: number };
export type WallStats = { today: Reach; week: Reach };

/** A day's share of its visitors by hour (quiet at night, busiest in the evening). */
const CURVE = [1, 0.6, 0.4, 0.3, 0.3, 0.5, 1, 2, 3, 3.5, 4, 4.5, 5, 5, 4.8, 4.8, 5, 5.5, 6.5, 7.5, 8, 7, 5, 2.5];
const SUM = CURVE.reduce((a, b) => a + b, 0);

/** Share of the day's visitors that has arrived by this local time. */
function elapsed(d: Date) {
  const h = d.getHours(),
    m = d.getMinutes() / 60;
  let n = 0;
  for (let i = 0; i < h; i++) n += CURVE[i];
  return (n + CURVE[h] * m) / SUM;
}
/** A steady number per calendar day (no Math.random: same for everyone, stable in tests). */
function dayTotal(d: Date) {
  const k = d.getFullYear() * 400 + d.getMonth() * 31 + d.getDate();
  const x = Math.sin(k * 12.9898) * 43758.5453;
  return Math.round(4600 + (x - Math.floor(x)) * 1400);
}
const SAVE_RATE = 0.21;

export function placeholderStats(now = Date.now()): WallStats {
  const d = new Date(now);
  const today = Math.round(dayTotal(d) * elapsed(d));
  let week = today;
  for (let i = 1; i < 7; i++) week += dayTotal(new Date(now - i * 864e5));
  return {
    today: { visitors: today, saves: Math.round(today * SAVE_RATE) },
    week: { visitors: week, saves: Math.round(week * SAVE_RATE) },
  };
}
