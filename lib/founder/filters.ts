/*
 * The Control Room's global filters, kept in the address so every view is a
 * link: ?range=30d&lane=music&kind=audio&visitor=new&source=instagram&device=mobile&country=NL
 * (range = today | 7d | 30d | 90d | all | custom with from=YYYY-MM-DD&to=YYYY-MM-DD).
 * Pure functions: the server turns them into periods for the fd_* functions.
 */

export const RANGES = ["today", "7d", "30d", "90d", "all", "custom"] as const;
export type Range = (typeof RANGES)[number];
export const RANGE_LABEL: Record<Range, string> = {
  today: "Today",
  "7d": "7 days",
  "30d": "30 days",
  "90d": "90 days",
  all: "All time",
  custom: "Custom",
};

export const LANE_IDS = ["music", "art", "writers", "podcasts", "games", "letters"] as const;
export const LANE_LABEL: Record<string, string> = {
  music: "Music",
  art: "Creators",
  writers: "Books",
  podcasts: "Podcasts",
  games: "Games",
  letters: "Newsletters",
};
export const KINDS = ["artwork", "audio", "excerpt", "trailer", "pattern"] as const;
export const KIND_LABEL: Record<string, string> = {
  artwork: "With artwork",
  audio: "With audio",
  excerpt: "With excerpt",
  trailer: "With trailer",
  pattern: "Printed pattern",
};
export const DEVICES = ["mobile", "tablet", "desktop"] as const;

export type Filters = {
  lane?: string;
  kind?: string;
  visitor?: "new" | "returning";
  source?: string;
  device?: string;
  country?: string;
};
export const FILTER_KEYS = ["lane", "kind", "visitor", "source", "device", "country"] as const;

export type Period = {
  range: Range;
  /** ISO instants; `to` is exclusive */
  from: string;
  to: string;
  /** the previous equivalent period, or null for all time */
  prevFrom: string | null;
  prevTo: string | null;
  bucket: "hour" | "day";
  tz: string;
  /** YYYY-MM-DD of the first and last day shown (in tz) */
  fromDay: string;
  toDay: string;
  label: string;
};

export type View = { period: Period; f: Filters };

type Params = Record<string, string | string[] | undefined>;
const one = (p: Params, k: string) => {
  const v = p[k];
  return (Array.isArray(v) ? v[0] : v) ?? undefined;
};
const DAY = /^\d{4}-\d{2}-\d{2}$/;

export function parseFilters(p: Params): Filters {
  const f: Filters = {};
  const lane = one(p, "lane");
  if (lane && (LANE_IDS as readonly string[]).includes(lane)) f.lane = lane;
  const kind = one(p, "kind");
  if (kind && (KINDS as readonly string[]).includes(kind)) f.kind = kind;
  const visitor = one(p, "visitor");
  if (visitor === "new" || visitor === "returning") f.visitor = visitor;
  const source = one(p, "source");
  if (source && /^[a-z0-9._-]{1,60}$/.test(source)) f.source = source;
  const device = one(p, "device");
  if (device && (DEVICES as readonly string[]).includes(device)) f.device = device;
  const country = one(p, "country");
  if (country && /^[A-Z]{2}$/.test(country)) f.country = country;
  return f;
}

/* ---------- time zones without a library ---------- */

function partsIn(t: number, tz: string) {
  const f = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const o: Record<string, number> = {};
  for (const x of f.formatToParts(new Date(t))) if (x.type !== "literal") o[x.type] = +x.value;
  return o as { year: number; month: number; day: number; hour: number; minute: number; second: number };
}
/** Milliseconds the zone is ahead of UTC at instant t. */
function offset(t: number, tz: string) {
  const p = partsIn(t, tz);
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(t / 1000) * 1000;
}
/** The instant a local calendar day (YYYY-MM-DD) begins in tz. */
export function dayStart(day: string, tz: string) {
  const [y, m, d] = day.split("-").map(Number);
  const guess = Date.UTC(y, m - 1, d);
  let t = guess - offset(guess, tz);
  t = guess - offset(t, tz);
  return t;
}
/** The local calendar day of an instant. */
export function dayOf(t: number, tz: string) {
  const p = partsIn(t, tz);
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}
export function addDays(day: string, n: number) {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}
export const daysBetween = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 864e5);

const fmtDay = (day: string) =>
  new Date(day + "T12:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

/**
 * The period for a range. Ranges end now and start at the beginning of a
 * local day, so days line up with the charts; the previous period is the
 * same length directly before it (for today: yesterday up to the same hour).
 */
export function parsePeriod(p: Params, now: number, tz: string, since: string): Period {
  let range = (one(p, "range") ?? "today") as Range;
  if (!RANGES.includes(range)) range = "today";
  const today = dayOf(now, tz);
  let fromDay = today;
  let toDay = today;
  let to = now;
  if (range === "7d") fromDay = addDays(today, -6);
  else if (range === "30d") fromDay = addDays(today, -29);
  else if (range === "90d") fromDay = addDays(today, -89);
  else if (range === "all") fromDay = since < today ? since : today;
  else if (range === "custom") {
    const a = one(p, "from"),
      b = one(p, "to");
    if (a && b && DAY.test(a) && DAY.test(b)) {
      fromDay = a <= b ? a : b;
      toDay = a <= b ? b : a;
      if (toDay > today) toDay = today;
      if (fromDay > toDay) fromDay = toDay;
      to = toDay === today ? now : dayStart(addDays(toDay, 1), tz);
    } else range = "today";
  }
  const from = dayStart(fromDay, tz);
  const days = daysBetween(fromDay, toDay) + 1;
  /* the same stretch directly before, up to the same hour (today: yesterday until now's hour) */
  const shift = days * 864e5;
  const prev = range === "all" ? null : { from: from - shift, to: to - shift };
  const label =
    range === "today"
      ? "Today"
      : range === "all"
        ? `All time (since ${fmtDay(fromDay)})`
        : fromDay === toDay
          ? fmtDay(fromDay)
          : `${fmtDay(fromDay)} – ${fmtDay(toDay)}`;
  return {
    range,
    from: new Date(from).toISOString(),
    to: new Date(to).toISOString(),
    prevFrom: prev ? new Date(prev.from).toISOString() : null,
    prevTo: prev ? new Date(prev.to).toISOString() : null,
    bucket: days <= 2 ? "hour" : "day",
    tz,
    fromDay,
    toDay,
    label,
  };
}

/** The address of the same view with some parameters changed (null removes one). */
export function withParams(current: Params, changes: Record<string, string | null | undefined>, path = "") {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(current)) {
    const x = Array.isArray(v) ? v[0] : v;
    if (x != null && x !== "") q.set(k, x);
  }
  for (const [k, v] of Object.entries(changes)) {
    if (v == null || v === "") q.delete(k);
    else q.set(k, v);
  }
  if (q.get("range") !== "custom") {
    q.delete("from");
    q.delete("to");
  }
  const s = q.toString();
  return path + (s ? "?" + s : "");
}

/** Only the view parameters (range and filters), for links between sections. */
export function viewParams(p: Params): Record<string, string> {
  const o: Record<string, string> = {};
  for (const k of ["range", "from", "to", ...FILTER_KEYS]) {
    const v = one(p, k);
    if (v) o[k] = v;
  }
  return o;
}
