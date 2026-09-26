/*
 * A believable, made-up Fivehundrd for the Control Room when FOUNDER_DEMO=1
 * (local development, previews, screenshots; never production). It generates
 * raw rows (visitors, visits, impressions, events, Create moments, stories)
 * for 120 days up to a little past now, and answers the same questions as the
 * fd_* database functions, with the same filters, by scanning them. Rows
 * dated after "now" appear as time passes, so the live view moves.
 */
import { LANE_IDS, LANE_LABEL, addDays, dayOf, dayStart, type Filters } from "./filters";
import type {
  Cohort,
  CreateFunnel,
  CreatorRow,
  DimRow,
  ExportRow,
  FeedItem,
  Kpis,
  LaneRow,
  Live,
  Ops,
  Point,
  SpotDetail,
  SpotRow,
  Transaction,
} from "./types";

const H = 3600e3;
const D = 24 * H;

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function pick<T>(r: () => number, xs: readonly [T, number][]): T {
  let x = r() * xs.reduce((a, b) => a + b[1], 0);
  for (const [v, w] of xs) if ((x -= w) <= 0) return v;
  return xs[xs.length - 1][0];
}

const SOURCES: [string, number][] = [
  ["instagram", 30],
  ["direct", 24],
  ["tiktok", 15],
  ["google", 8],
  ["x", 6],
  ["whatsapp", 6],
  ["reddit", 4],
  ["email", 3],
  ["linkedin", 2],
  ["producthunt", 2],
];
const DEVICES: ["mobile" | "tablet" | "desktop", number][] = [
  ["mobile", 68],
  ["desktop", 27],
  ["tablet", 5],
];
const COUNTRIES: [string, number][] = [
  ["NL", 30],
  ["US", 19],
  ["GB", 12],
  ["DE", 9],
  ["BE", 6],
  ["FR", 5],
  ["SE", 3],
  ["ES", 3],
  ["CA", 3],
  ["AU", 2],
  ["BR", 2],
  ["JP", 2],
];
const LANE_W: [string, number][] = [
  ["music", 30],
  ["art", 20],
  ["writers", 15],
  ["podcasts", 12],
  ["games", 13],
  ["letters", 10],
];
/** visits by local hour (evening peak) */
const HOURS = [2, 1, 1, 1, 1, 2, 3, 5, 6, 6, 6, 7, 8, 8, 7, 7, 7, 8, 9, 11, 12, 12, 9, 5];

const WORDS: Record<string, [string[], string[]]> = {
  music: [
    ["Velvet", "Neon", "Paper", "Salt", "Quiet", "Glass", "Midnight", "Honey", "Static", "Lowtide", "Golden", "Hollow"],
    ["Hours", "Radio", "Tapes", "Bloom", "Echoes", "Motel", "Weather", "Choir", "Dunes", "Signals", "Club", "Satellite"],
  ],
  art: [
    ["Studio", "Ink", "Soft", "Wild", "Loose", "Bright", "Plain", "Folded", "Small", "Wide", "Grey", "Open"],
    ["Prints", "Objects", "Walls", "Portraits", "Collage", "Ceramics", "Stitches", "Frames", "Posters", "Forms", "Lines", "Rooms"],
  ],
  writers: [
    ["The Last", "A Small", "Winter", "Salt", "The Quiet", "Borrowed", "Northern", "Second", "Paper", "Lost", "Every", "Late"],
    ["Harbour", "Summer", "Letters", "Orchard", "Kingdom", "Houses", "Rivers", "Daughters", "Machine", "Garden", "Promise", "Island"],
  ],
  podcasts: [
    ["Deep", "Slow", "Odd", "Small", "Night", "Loud", "Useful", "Honest", "Weird", "Long", "Good", "True"],
    ["Questions", "Talk", "Hours", "Stories", "Signals", "Money", "Science", "Makers", "History", "Radio", "Minds", "Tapes"],
  ],
  games: [
    ["Pixel", "Tiny", "Hollow", "Star", "Moss", "Rust", "Cloud", "Pocket", "Dungeon", "Solar", "Paper", "Lantern"],
    ["Knight", "Garden", "Drift", "Tactics", "Quest", "Racers", "Keeper", "Island", "Engine", "Heist", "Farm", "Signal"],
  ],
  letters: [
    ["Sunday", "Weekly", "Field", "Morning", "Slow", "Small", "Good", "Plain", "Local", "Curious", "Monday", "Late"],
    ["Notes", "Letter", "Digest", "Dispatch", "Paper", "Brief", "Post", "Report", "Journal", "Almanac", "Edition", "Memo"],
  ],
};
const MAKERS = ["lena", "otis", "mara", "jun", "ada", "noor", "felix", "ivy", "sam", "rosa", "theo", "yara", "kai", "zoe", "milo", "iris"];
const DOMAINS = ["example.com", "studio.example", "mail.example", "hey.example"];

type Story = {
  id: string;
  slug: string;
  lane: string;
  no: number;
  name: string;
  creator: string;
  created: number;
  starts: number | null;
  ends: number | null;
  amount: number;
  fee: number | null;
  refund: number;
  refundedAt: number | null;
  dispute: number;
  disputedAt: number | null;
  disputeStatus: string | null;
  kind: "artwork" | "audio" | "excerpt" | "trailer" | "pattern";
  seed: number;
  pal: number;
  quality: number;
  hidden: boolean;
  removed: boolean;
  pi: string;
};

type Data = {
  at: number;
  start: number;
  /* visitors */
  vSource: string[];
  vDevice: string[];
  vCountry: string[];
  vFirst: Float64Array;
  /* visits (sorted by time) */
  visitAt: Float64Array;
  visitV: Int32Array;
  visitNew: Uint8Array;
  visitSource: string[];
  visitStory: Int32Array;
  /* impressions: story, visitor, time (one per story, visitor, day) */
  impAt: Float64Array;
  impS: Int32Array;
  impV: Int32Array;
  /* events: kind 0 open, 1 save, 2 unsave, 3 share, 4 link_click, 5 entry */
  evAt: Float64Array;
  evS: Int32Array;
  evV: Int32Array;
  evK: Uint8Array;
  /* Create moments: step 0 = start */
  trAt: Float64Array;
  trV: Int32Array;
  trStep: Uint8Array;
  stories: Story[];
  byId: Map<string, number>;
  profiles: Float64Array;
  reports: Float64Array;
  exports: ExportRow[];
  files: Map<string, { body: Uint8Array; type: string }>;
};
const EV = ["open", "save", "unsave", "share", "link_click", "entry"] as const;

function uuid(r: () => number) {
  const h = () => Math.floor(r() * 16).toString(16);
  const s = Array.from({ length: 32 }, h).join("");
  return `${s.slice(0, 8)}-${s.slice(8, 12)}-4${s.slice(13, 16)}-a${s.slice(17, 20)}-${s.slice(20, 32)}`;
}
const SLUG = "abcdefghjkmnpqrstuvwxyz23456789";

function sortCols(at: number[], cols: number[][]) {
  const idx = at.map((_, i) => i).sort((a, b) => at[a] - at[b]);
  return { at: idx.map((i) => at[i]), cols: cols.map((c) => idx.map((i) => c[i])) };
}

function generate(now: number, tz: string): Data {
  const r = rng(500);
  const DAYS = 120;
  const today = dayOf(now, tz);
  const firstDay = addDays(today, -(DAYS - 1));
  const start = dayStart(firstDay, tz);
  const horizon = now + 3 * H;

  /* stories: a few a day at first, dozens a day now */
  const stories: Story[] = [];
  const taken: Record<string, Set<number>> = Object.fromEntries(LANE_IDS.map((l) => [l, new Set<number>()]));
  for (let d = 0; d < DAYS + 1; d++) {
    const dayT = dayStart(addDays(firstDay, d), tz);
    const n = Math.round((2 + 26 * Math.pow(d / DAYS, 1.6)) * (0.7 + r() * 0.6));
    const checkouts = Math.round(n * (1.5 + r() * 0.4));
    for (let i = 0; i < checkouts; i++) {
      const lane = pick(r, LANE_W);
      const created = dayT + (pick(r, HOURS.map((w, h) => [h, w] as [number, number])) + r()) * H;
      if (created > horizon) continue;
      const paid = i < n;
      let no = 1 + Math.floor(r() * 500);
      while (taken[lane].has(no)) no = 1 + Math.floor(r() * 500);
      taken[lane].add(no);
      const [a, b] = WORDS[lane];
      const starts = paid ? created + (2 + r() * 6) * 60e3 : null;
      const refund = paid && r() < 0.025 ? 995 : 0;
      const dispute = paid && !refund && r() < 0.004 ? 995 : 0;
      const kind = pick(r, [
        ["artwork", 55],
        [lane === "music" || lane === "podcasts" ? "audio" : "trailer", lane === "games" ? 18 : 22],
        [lane === "writers" || lane === "letters" ? "excerpt" : "artwork", 12],
        ["pattern", 11],
      ] as [Story["kind"], number][]);
      stories.push({
        id: uuid(r),
        slug: Array.from({ length: 8 }, () => SLUG[Math.floor(r() * SLUG.length)]).join(""),
        lane,
        no,
        name: `${a[Math.floor(r() * a.length)]} ${b[Math.floor(r() * b.length)]}`,
        creator: `${MAKERS[Math.floor(r() * MAKERS.length)]}${Math.floor(r() * 90) + 10}@${DOMAINS[Math.floor(r() * DOMAINS.length)]}`,
        created,
        starts,
        ends: starts ? starts + 72 * H : null,
        amount: paid ? 995 : 0,
        fee: paid ? 59 : null,
        refund,
        refundedAt: refund ? starts! + r() * 20 * H : null,
        dispute,
        disputedAt: dispute ? starts! + (2 + r() * 10) * D : null,
        disputeStatus: dispute ? pick(r, [["needs_response", 1], ["under_review", 1], ["lost", 1]] as [string, number][]) : null,
        kind,
        seed: Math.floor(r() * 1e9),
        pal: Math.floor(r() * 8),
        quality: Math.exp((r() + r() + r() - 1.5) * 1.1),
        hidden: false,
        removed: paid && r() < 0.006,
        pi: "pi_demo" + Math.floor(r() * 1e12).toString(36),
      });
      if (!paid && r() < 0.8) taken[lane].delete(no);
    }
    /* numbers free up after 72 hours */
    if (d % 3 === 2) for (const l of LANE_IDS) taken[l].clear();
  }
  /* a few repeat creators */
  for (let i = 0; i < stories.length; i++) if (r() < 0.22 && i > 10) stories[i].creator = stories[Math.floor(r() * i)].creator;
  stories.sort((a, b) => a.created - b.created);
  const paid = stories.map((s, i) => [s, i] as const).filter(([s]) => s.starts != null);

  /* live stories by hour */
  const hours = Math.ceil((horizon - start) / H);
  const liveAt: number[][] = Array.from({ length: hours }, () => []);
  for (const [s, i] of paid) {
    if (s.removed) continue;
    const a = Math.max(0, Math.floor((s.starts! - start) / H));
    const b = Math.min(hours - 1, Math.floor((s.ends! - start) / H));
    for (let h = a; h <= b; h++) liveAt[h].push(i);
  }

  /* visitors and their visits */
  const vSource: string[] = [],
    vDevice: string[] = [],
    vCountry: string[] = [],
    vFirst: number[] = [];
  const vAt: number[] = [],
    vV: number[] = [],
    vNew: number[] = [],
    vSrc: number[] = [],
    vStory: number[] = [];
  const srcNames: string[] = [];
  const srcIdx = (s: string) => {
    let i = srcNames.indexOf(s);
    if (i < 0) i = srcNames.push(s) - 1;
    return i;
  };
  for (let d = 0; d < DAYS; d++) {
    const dayT = dayStart(addDays(firstDay, d), tz);
    const weekend = [0, 6].includes(new Date(dayT + 12 * H).getUTCDay()) ? 1.15 : 1;
    const bump = d === 71 ? 2.4 : d === 72 ? 1.5 : 1; /* a launch-day spike */
    const n = Math.round((55 + 1000 * Math.pow(d / (DAYS - 1), 2.1)) * weekend * bump * (0.9 + r() * 0.2));
    for (let i = 0; i < n; i++) {
      const at = dayT + (pick(r, HOURS.map((w, h) => [h, w] as [number, number])) + r()) * H;
      if (at > horizon) continue;
      const v = vFirst.length;
      /* some arrive through a shared spot's link */
      const hr = Math.floor((at - start) / H);
      const live = liveAt[Math.min(hr, hours - 1)] ?? [];
      const viaShare = live.length && r() < 0.09 ? live[Math.floor(r() * live.length)] : -1;
      const src = viaShare >= 0 ? pick(r, [["whatsapp", 4], ["instagram", 4], ["x", 1], ["direct", 2]] as [string, number][]) : pick(r, SOURCES);
      vSource.push(src);
      vDevice.push(pick(r, DEVICES));
      vCountry.push(pick(r, COUNTRIES));
      vFirst.push(at);
      vAt.push(at);
      vV.push(v);
      vNew.push(1);
      vSrc.push(srcIdx(src));
      vStory.push(viaShare);
      /* coming back: about 13% the next day, 31% within a week, 44% within a month */
      let t = at;
      const loyal = r();
      for (let k = 0; k < 12; k++) {
        const p = k === 0 ? 0.44 : loyal > 0.6 ? 0.72 : 0.45;
        if (r() > p) break;
        const gap = k === 0 ? (r() < 0.3 ? D * (0.6 + r() * 0.8) : D * (1 + -Math.log(1 - r()) * 7)) : D * (0.5 + -Math.log(1 - r()) * 5);
        t += gap;
        if (t > horizon) break;
        vAt.push(t);
        vV.push(v);
        vNew.push(0);
        vSrc.push(srcIdx(r() < 0.75 ? "direct" : src));
        vStory.push(-1);
      }
    }
  }
  const vs = sortCols(vAt, [vV, vNew, vSrc, vStory]);

  /* what each visit saw and did */
  const iAt: number[] = [],
    iS: number[] = [],
    iV: number[] = [];
  const eAt: number[] = [],
    eS: number[] = [],
    eV: number[] = [],
    eK: number[] = [];
  const tAt: number[] = [],
    tV: number[] = [],
    tStep: number[] = [];
  const seenDay = new Set<string>();
  for (let j = 0; j < vs.at.length; j++) {
    const at = vs.at[j],
      v = vs.cols[0][j],
      story = vs.cols[3][j];
    const hr = Math.min(hours - 1, Math.floor((at - start) / H));
    const live = liveAt[hr];
    if (!live?.length) continue;
    const dayKey = Math.floor((at - start) / D);
    const seen = Math.min(live.length, 3 + Math.floor(r() * 10));
    let t = at + 5e3;
    const look = (si: number, bias: number) => {
      const k = `${si}:${v}:${dayKey}`;
      if (!seenDay.has(k)) {
        seenDay.add(k);
        iAt.push(t);
        iS.push(si);
        iV.push(v);
      }
      const q = stories[si].quality;
      if (r() < Math.min(0.6, 0.075 * q * bias)) {
        t += 4e3 + r() * 40e3;
        eAt.push(t), eS.push(si), eV.push(v), eK.push(0);
        if (r() < 0.24 * Math.min(2, q)) {
          t += 2e3 + r() * 9e3;
          eAt.push(t), eS.push(si), eV.push(v), eK.push(1);
          if (r() < 0.06) eAt.push(t + 60e3), eS.push(si), eV.push(v), eK.push(2);
        }
        if (r() < 0.055 * Math.min(2.5, q)) {
          t += 3e3 + r() * 20e3;
          eAt.push(t), eS.push(si), eV.push(v), eK.push(3);
        }
        if (r() < 0.3) {
          t += 2e3 + r() * 30e3;
          eAt.push(t), eS.push(si), eV.push(v), eK.push(4);
        }
      }
    };
    if (story >= 0) {
      eAt.push(at + 1e3), eS.push(story), eV.push(v), eK.push(5);
      look(story, 6);
    }
    for (let k = 0; k < seen; k++) look(live[Math.floor(r() * live.length)], 1);
    /* starting Create, and how far people get (phone steps 2–7) */
    if (r() < 0.045) {
      t += 20e3;
      tAt.push(t), tV.push(v), tStep.push(0);
      let p = 0.86;
      for (let s = 2; s <= 6; s++) {
        if (r() > p) break;
        t += 15e3 + r() * 60e3;
        tAt.push(t), tV.push(v), tStep.push(s);
        p = 0.8;
      }
    }
  }
  const im = sortCols(iAt, [iS, iV]);
  const ev = sortCols(eAt, [eS, eV, eK]);
  const tr = sortCols(tAt, [tV, tStep]);

  const profiles: number[] = [];
  const reports: number[] = [];
  for (let d = 0; d < DAYS; d++) {
    const dayT = dayStart(addDays(firstDay, d), tz);
    const n = Math.round(2 + 30 * Math.pow(d / DAYS, 2) * r());
    for (let i = 0; i < n; i++) profiles.push(dayT + r() * D);
    if (r() < 0.25) reports.push(dayT + r() * D);
  }

  const data: Data = {
    at: now,
    start,
    vSource,
    vDevice,
    vCountry,
    vFirst: Float64Array.from(vFirst),
    visitAt: Float64Array.from(vs.at),
    visitV: Int32Array.from(vs.cols[0]),
    visitNew: Uint8Array.from(vs.cols[1]),
    visitSource: vs.cols[2].map((i) => srcNames[i]),
    visitStory: Int32Array.from(vs.cols[3]),
    impAt: Float64Array.from(im.at),
    impS: Int32Array.from(im.cols[0]),
    impV: Int32Array.from(im.cols[1]),
    evAt: Float64Array.from(ev.at),
    evS: Int32Array.from(ev.cols[0]),
    evV: Int32Array.from(ev.cols[1]),
    evK: Uint8Array.from(ev.cols[2]),
    trAt: Float64Array.from(tr.at),
    trV: Int32Array.from(tr.cols[0]),
    trStep: Uint8Array.from(tr.cols[1]),
    stories,
    byId: new Map(stories.map((s, i) => [s.id, i])),
    profiles: Float64Array.from(profiles.sort((a, b) => a - b)),
    reports: Float64Array.from(reports.sort((a, b) => a - b)),
    exports: [],
    files: new Map(),
  };
  return data;
}

let cache: Data | null = null;
function data(tz: string) {
  const now = Date.now();
  /* regenerate every two hours so rows keep existing ahead of "now" */
  if (!cache || now - cache.at > 2 * H) {
    const keep = cache ? { exports: cache.exports, files: cache.files } : null;
    cache = generate(now, tz);
    if (keep) Object.assign(cache, keep);
  }
  return cache;
}

/* ---------- scanning helpers ---------- */

/** First index with arr[i] >= t (arrays are sorted by time). */
function lower(arr: Float64Array, t: number) {
  let lo = 0,
    hi = arr.length;
  while (lo < hi) {
    const m = (lo + hi) >> 1;
    if (arr[m] < t) lo = m + 1;
    else hi = m;
  }
  return lo;
}
const clampNow = (t: number) => Math.min(t, Date.now());

function storyOk(f: Filters, s: Story) {
  return (!f.lane || s.lane === f.lane) && (!f.kind || s.kind === f.kind);
}
const hasVf = (f: Filters) => !!(f.visitor || f.source || f.device || f.country);
function visitorOk(d: Data, f: Filters, v: number, from: number, to: number) {
  if (f.source && d.vSource[v] !== f.source) return false;
  if (f.device && d.vDevice[v] !== f.device) return false;
  if (f.country && d.vCountry[v] !== f.country) return false;
  if (f.visitor === "new" && !(d.vFirst[v] >= from && d.vFirst[v] < to)) return false;
  if (f.visitor === "returning" && !(d.vFirst[v] < from)) return false;
  return true;
}

function bucketsOf(from: number, to: number, bucket: "hour" | "day", tz: string) {
  const starts: number[] = [];
  const labels: string[] = [];
  if (bucket === "day") {
    let day = dayOf(from, tz);
    for (let t = dayStart(day, tz); t < to; day = addDays(day, 1), t = dayStart(day, tz)) {
      starts.push(t);
      labels.push(day + "T00:00");
    }
  } else {
    for (let t = Math.floor(from / H) * H; t < to; t += H) {
      starts.push(t);
      const hh = new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", hourCycle: "h23" }).format(t);
      labels.push(`${dayOf(t, tz)}T${hh}:00`);
    }
  }
  return { starts, labels };
}
function bucketIndex(starts: number[], t: number) {
  let lo = 0,
    hi = starts.length - 1;
  if (t < starts[0]) return -1;
  while (lo < hi) {
    const m = (lo + hi + 1) >> 1;
    if (starts[m] <= t) lo = m;
    else hi = m - 1;
  }
  return lo;
}

const creatorOf = (s: Story) => s.creator;
const statusOf = (s: Story, now = Date.now()): SpotRow["status"] =>
  s.removed ? "removed" : s.hidden ? "hidden" : s.ends! > now ? "live" : "ended";

/* ---------- the questions ---------- */

export const demo = {
  since(tz: string) {
    return dayOf(data(tz).start, tz);
  },

  kpis(fromIso: string, toIso: string, f: Filters, tz: string): Kpis {
    const d = data(tz);
    const from = Date.parse(fromIso),
      to = clampNow(Date.parse(toIso));
    const vf = hasVf(f),
      sf = !!(f.lane || f.kind);
    const vok = (v: number) => !vf || visitorOk(d, f, v, from, to);
    const visitors = new Set<number>(),
      newV = new Set<number>();
    let visits = 0,
      fromShares = 0;
    for (let i = lower(d.visitAt, from); i < d.visitAt.length && d.visitAt[i] < to; i++) {
      const v = d.visitV[i];
      if (!vok(v)) continue;
      const st = d.visitStory[i];
      if (sf && st >= 0 && !storyOk(f, d.stories[st])) continue;
      visits++;
      visitors.add(v);
      if (d.visitNew[i]) newV.add(v);
      if (st >= 0) fromShares++;
    }
    let impressions = 0;
    const viewers = new Set<number>();
    for (let i = lower(d.impAt, from); i < d.impAt.length && d.impAt[i] < to; i++) {
      if (!vok(d.impV[i]) || (sf && !storyOk(f, d.stories[d.impS[i]]))) continue;
      impressions++;
      viewers.add(d.impV[i]);
    }
    const n = [0, 0, 0, 0, 0, 0];
    const who = [new Set<number>(), new Set<number>(), null, new Set<number>()];
    for (let i = lower(d.evAt, from); i < d.evAt.length && d.evAt[i] < to; i++) {
      if (!vok(d.evV[i]) || (sf && !storyOk(f, d.stories[d.evS[i]]))) continue;
      n[d.evK[i]]++;
      who[d.evK[i]]?.add(d.evV[i]);
    }
    const starters = new Set<number>();
    for (let i = lower(d.trAt, from); i < d.trAt.length && d.trAt[i] < to; i++)
      if (d.trStep[i] === 0 && vok(d.trV[i])) starters.add(d.trV[i]);
    const paidS = d.stories.filter((s) => s.starts != null && s.starts >= from && s.starts < to && storyOk(f, s));
    const started = d.stories.filter((s) => s.created >= from && s.created < to && s.created <= Date.now() && storyOk(f, s));
    const earlier = new Set(d.stories.filter((s) => s.starts != null && s.starts < from).map(creatorOf));
    const at = Math.min(to, Date.now());
    const cohort: number[] = [];
    for (let v = 0; v < d.vFirst.length; v++)
      if (d.vFirst[v] >= to - 14 * D && d.vFirst[v] < to - 7 * D && (!vf || visitorOk(d, f, v, from, to))) cohort.push(v);
    const inCohort = new Set(cohort);
    const returned = new Set<number>();
    for (let i = lower(d.visitAt, to - 14 * D); i < d.visitAt.length && d.visitAt[i] < to; i++) {
      const v = d.visitV[i];
      if (inCohort.has(v) && d.visitAt[i] > d.vFirst[v] + 12 * H && d.visitAt[i] <= d.vFirst[v] + 7 * D) returned.add(v);
    }
    const count = (arr: Float64Array) => lower(arr, to) - lower(arr, from);
    return {
      visitors: visitors.size,
      newVisitors: newV.size,
      visits,
      fromShares,
      impressions,
      viewers: viewers.size,
      opens: n[0],
      openers: who[0]!.size,
      saves: n[1],
      savers: who[1]!.size,
      unsaves: n[2],
      shares: n[3],
      sharers: who[3]!.size,
      clicks: n[4],
      entries: n[5],
      createStarts: starters.size,
      checkouts: started.length,
      paid: paidS.length,
      creators: new Set(paidS.map(creatorOf)).size,
      newCreators: new Set(paidS.map(creatorOf).filter((c) => !earlier.has(c))).size,
      gross: paidS.reduce((a, s) => a + s.amount, 0),
      refunds: d.stories.filter((s) => s.refundedAt && s.refundedAt >= from && s.refundedAt < to && storyOk(f, s)).reduce((a, s) => a + s.refund, 0),
      fees: paidS.reduce((a, s) => a + (s.fee ?? 0), 0),
      disputes: d.stories.filter((s) => s.disputedAt && s.disputedAt >= from && s.disputedAt < to && storyOk(f, s)).reduce((a, s) => a + s.dispute, 0),
      liveSpots: d.stories.filter((s) => s.starts != null && s.starts <= at && s.ends! > at && !s.removed && storyOk(f, s)).length,
      accounts: count(d.profiles),
      reports: count(d.reports),
      cohort: cohort.length,
      returned7: returned.size,
    };
  },

  series(fromIso: string, toIso: string, bucket: "hour" | "day", f: Filters, tz: string): Point[] {
    const d = data(tz);
    const from = Date.parse(fromIso),
      to = clampNow(Date.parse(toIso));
    const { starts, labels } = bucketsOf(from, Date.parse(toIso), bucket, tz);
    const pts: Point[] = labels.map((t) => ({
      t,
      visitors: 0,
      newVisitors: 0,
      visits: 0,
      fromShares: 0,
      opens: 0,
      saves: 0,
      shares: 0,
      clicks: 0,
      impressions: 0,
      createStarts: 0,
      checkouts: 0,
      paid: 0,
      gross: 0,
    }));
    if (!pts.length) return pts;
    const vf = hasVf(f),
      sf = !!(f.lane || f.kind);
    const vok = (v: number) => !vf || visitorOk(d, f, v, from, to);
    const uv = pts.map(() => new Set<number>()),
      nv = pts.map(() => new Set<number>()),
      cs = pts.map(() => new Set<number>());
    for (let i = lower(d.visitAt, from); i < d.visitAt.length && d.visitAt[i] < to; i++) {
      const v = d.visitV[i];
      if (!vok(v)) continue;
      const b = bucketIndex(starts, d.visitAt[i]);
      pts[b].visits++;
      uv[b].add(v);
      if (d.visitNew[i]) nv[b].add(v);
      if (d.visitStory[i] >= 0) pts[b].fromShares++;
    }
    for (let i = lower(d.impAt, from); i < d.impAt.length && d.impAt[i] < to; i++) {
      if (!vok(d.impV[i]) || (sf && !storyOk(f, d.stories[d.impS[i]]))) continue;
      pts[bucketIndex(starts, d.impAt[i])].impressions++;
    }
    const key = ["opens", "saves", null, "shares", "clicks", null] as const;
    for (let i = lower(d.evAt, from); i < d.evAt.length && d.evAt[i] < to; i++) {
      const k = key[d.evK[i]];
      if (!k || !vok(d.evV[i]) || (sf && !storyOk(f, d.stories[d.evS[i]]))) continue;
      pts[bucketIndex(starts, d.evAt[i])][k]++;
    }
    for (let i = lower(d.trAt, from); i < d.trAt.length && d.trAt[i] < to; i++)
      if (d.trStep[i] === 0 && vok(d.trV[i])) cs[bucketIndex(starts, d.trAt[i])].add(d.trV[i]);
    for (const s of d.stories) {
      if (!storyOk(f, s)) continue;
      if (s.created >= from && s.created < to) pts[bucketIndex(starts, s.created)].checkouts++;
      if (s.starts != null && s.starts >= from && s.starts < to) {
        const b = bucketIndex(starts, s.starts);
        pts[b].paid++;
        pts[b].gross += s.amount;
      }
    }
    pts.forEach((p, i) => {
      p.visitors = uv[i].size;
      p.newVisitors = nv[i].size;
      p.createStarts = cs[i].size;
    });
    return pts;
  },

  lanes(fromIso: string, toIso: string, f: Filters, tz: string): LaneRow[] {
    const d = data(tz);
    const from = Date.parse(fromIso),
      to = clampNow(Date.parse(toIso)),
      now = Date.now();
    const vf = hasVf(f);
    const rows = Object.fromEntries(
      LANE_IDS.map((l) => [l, { lane: l, label: LANE_LABEL[l], live: 0, opens: 0, saves: 0, shares: 0, impressions: 0, paid: 0, revenue: 0 }]),
    ) as Record<string, LaneRow>;
    for (const s of d.stories) {
      if (s.starts != null && s.starts <= now && s.ends! > now && !s.removed) rows[s.lane].live++;
      if (s.starts != null && s.starts >= from && s.starts < to) {
        rows[s.lane].paid++;
        rows[s.lane].revenue += s.amount - s.refund;
      }
    }
    for (let i = lower(d.evAt, from); i < d.evAt.length && d.evAt[i] < to; i++) {
      if (vf && !visitorOk(d, f, d.evV[i], from, to)) continue;
      const k = d.evK[i],
        r = rows[d.stories[d.evS[i]].lane];
      if (k === 0) r.opens++;
      else if (k === 1) r.saves++;
      else if (k === 3) r.shares++;
    }
    for (let i = lower(d.impAt, from); i < d.impAt.length && d.impAt[i] < to; i++)
      if (!vf || visitorOk(d, f, d.impV[i], from, to)) rows[d.stories[d.impS[i]].lane].impressions++;
    return Object.values(rows).sort((a, b) => a.lane.localeCompare(b.lane));
  },

  breakdown(dim: string, fromIso: string, toIso: string, f: Filters, tz: string): DimRow[] {
    const d = data(tz);
    const from = Date.parse(fromIso),
      to = clampNow(Date.parse(toIso));
    const vf = hasVf(f);
    const keyOf = (i: number) => {
      const v = d.visitV[i];
      if (dim === "source") return d.visitSource[i];
      if (dim === "device") return d.vDevice[v];
      if (dim === "country") return d.vCountry[v];
      if (dim === "medium") return d.visitSource[i] === "email" ? "email" : ["instagram", "tiktok", "x", "reddit", "linkedin"].includes(d.visitSource[i]) ? "social" : "(none)";
      return d.visitStory[i] >= 0 ? "Shared spot link" : "/";
    };
    const rows = new Map<string, { key: string; vs: Set<number>; visits: number; nw: number; opens: number }>();
    const visitorKeys = new Map<number, Set<string>>();
    for (let i = lower(d.visitAt, from); i < d.visitAt.length && d.visitAt[i] < to; i++) {
      const v = d.visitV[i];
      if (vf && !visitorOk(d, f, v, from, to)) continue;
      const k = keyOf(i);
      let r = rows.get(k);
      if (!r) rows.set(k, (r = { key: k, vs: new Set(), visits: 0, nw: 0, opens: 0 }));
      r.vs.add(v);
      r.visits++;
      if (d.visitNew[i]) r.nw++;
      let ks = visitorKeys.get(v);
      if (!ks) visitorKeys.set(v, (ks = new Set()));
      ks.add(k);
    }
    for (let i = lower(d.evAt, from); i < d.evAt.length && d.evAt[i] < to; i++)
      if (d.evK[i] === 0) for (const k of visitorKeys.get(d.evV[i]) ?? []) rows.get(k)!.opens++;
    return [...rows.values()]
      .map((r) => ({ key: r.key, visitors: r.vs.size, visits: r.visits, new_visits: r.nw, opens: r.opens }))
      .sort((a, b) => b.visitors - a.visitors || a.key.localeCompare(b.key));
  },

  spots(fromIso: string, toIso: string, f: Filters, sort: string, q: string, limit: number, offset: number, tz: string): SpotRow[] {
    const d = data(tz);
    const from = Date.parse(fromIso),
      to = clampNow(Date.parse(toIso));
    const vf = hasVf(f);
    const acc = new Map<number, SpotRow & { vset: Set<number> }>();
    const q2 = q.trim().toLowerCase();
    d.stories.forEach((s, i) => {
      if (s.starts == null || s.starts > Date.now() || !storyOk(f, s)) return;
      if (q2 ? !(s.name.toLowerCase().includes(q2) || s.slug === q2 || s.creator.includes(q2)) : !(s.starts < to && s.ends! > from)) return;
      acc.set(i, {
        id: s.id,
        slug: s.slug,
        lane: s.lane,
        no: s.no,
        name: s.name,
        creator: s.creator,
        startsAt: new Date(s.starts).toISOString(),
        endsAt: new Date(s.ends!).toISOString(),
        status: statusOf(s),
        impressions: 0,
        viewers: 0,
        opens: 0,
        saves: 0,
        shares: 0,
        clicks: 0,
        shareVisits: 0,
        revenue: s.amount - s.refund,
        vset: new Set(),
      });
    });
    for (let i = lower(d.impAt, from); i < d.impAt.length && d.impAt[i] < to; i++) {
      const r = acc.get(d.impS[i]);
      if (r && (!vf || visitorOk(d, f, d.impV[i], from, to))) {
        r.impressions++;
        r.vset.add(d.impV[i]);
      }
    }
    const key = ["opens", "saves", null, "shares", "clicks", null] as const;
    for (let i = lower(d.evAt, from); i < d.evAt.length && d.evAt[i] < to; i++) {
      const r = acc.get(d.evS[i]),
        k = key[d.evK[i]];
      if (r && k && (!vf || visitorOk(d, f, d.evV[i], from, to))) r[k]++;
    }
    for (let i = lower(d.visitAt, from); i < d.visitAt.length && d.visitAt[i] < to; i++) {
      const r = acc.get(d.visitStory[i]);
      if (r && (!vf || visitorOk(d, f, d.visitV[i], from, to))) r.shareVisits++;
    }
    const by = (["saves", "shares", "impressions", "clicks", "revenue", "shareVisits"].includes(sort) ? sort : "opens") as keyof SpotRow;
    return [...acc.values()]
      .map(({ vset, ...r }) => ({ ...r, viewers: vset.size }))
      .sort((a, b) => (b[by] as number) - (a[by] as number) || b.startsAt.localeCompare(a.startsAt))
      .slice(offset, offset + limit);
  },

  spot(id: string, tz: string): SpotDetail | null {
    const d = data(tz);
    const i = d.byId.get(id);
    if (i == null) return null;
    const s = d.stories[i];
    const now = Date.now();
    if (s.created > now) return null;
    const t = { impressions: 0, viewers: 0, opens: 0, openers: 0, saves: 0, shares: 0, clicks: 0, entries: 0, shareVisits: 0 };
    const vw = new Set<number>(),
      op = new Set<number>();
    const a = s.starts ?? s.created,
      b = Math.min(s.ends ?? now, now);
    const hrs = Math.max(1, Math.ceil((b - Math.floor(a / H) * H) / H));
    const timeline = Array.from({ length: hrs }, (_, k) => {
      const at = Math.floor(a / H) * H + k * H;
      const hh = new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", hourCycle: "h23" }).format(at);
      return { t: `${dayOf(at, tz)}T${hh}:00`, impressions: 0, opens: 0, saves: 0, shares: 0, clicks: 0 };
    });
    const slot = (x: number) => timeline[Math.min(hrs - 1, Math.max(0, Math.floor((x - Math.floor(a / H) * H) / H)))];
    for (let j = lower(d.impAt, a - H); j < d.impAt.length && d.impAt[j] < now; j++)
      if (d.impS[j] === i) {
        t.impressions++;
        vw.add(d.impV[j]);
        slot(d.impAt[j]).impressions++;
      }
    const events: SpotDetail["events"] = [];
    const key = ["opens", "saves", null, "shares", "clicks", null] as const;
    for (let j = lower(d.evAt, a - H); j < d.evAt.length && d.evAt[j] < now; j++)
      if (d.evS[j] === i) {
        const k = d.evK[j];
        if (k === 0) (t.opens++, op.add(d.evV[j]));
        else if (k === 1) t.saves++;
        else if (k === 3) t.shares++;
        else if (k === 4) t.clicks++;
        else if (k === 5) t.entries++;
        const kk = key[k];
        if (kk) slot(d.evAt[j])[kk]++;
        events.push({ at: new Date(d.evAt[j]).toISOString(), kind: EV[k], visitor: String(d.evV[j].toString(16)).padStart(6, "0").slice(-6) });
      }
    const sources = new Map<string, number>();
    for (let j = lower(d.visitAt, a - H); j < d.visitAt.length && d.visitAt[j] < now; j++)
      if (d.visitStory[j] === i) {
        t.shareVisits++;
        sources.set(d.visitSource[j], (sources.get(d.visitSource[j]) ?? 0) + 1);
      }
    t.viewers = vw.size;
    t.openers = op.size;
    return {
      story: {
        id: s.id,
        slug: s.slug,
        lane: s.lane,
        no: s.no,
        name: s.name,
        snippet: null,
        artwork: null,
        logo: null,
        seed: s.seed,
        pal: s.pal,
        creator: s.creator,
        links: [{ label: "Website", url: "https://example.com" }],
        createdAt: new Date(s.created).toISOString(),
        startsAt: s.starts ? new Date(s.starts).toISOString() : null,
        endsAt: s.ends ? new Date(s.ends).toISOString() : null,
        amount: s.amount || null,
        refund: s.refund || null,
        fee: s.fee,
        dispute: s.dispute || null,
        moderation: { verdict: "ok", reason: "Fine." },
        status: s.starts == null ? "unpaid" : statusOf(s),
      },
      totals: t,
      timeline,
      sources: [...sources].map(([key, visits]) => ({ key, visits })).sort((x, y) => y.visits - x.visits),
      events: events.reverse().slice(0, 200),
    };
  },

  creators(fromIso: string, toIso: string, f: Filters, tz: string): CreatorRow[] {
    const d = data(tz);
    const from = Date.parse(fromIso),
      to = clampNow(Date.parse(toIso));
    const rows = new Map<string, CreatorRow & { ids: Set<number> }>();
    d.stories.forEach((s, i) => {
      if (s.starts == null || s.starts >= to || !storyOk(f, s)) return;
      let r = rows.get(s.creator);
      if (!r)
        rows.set(
          s.creator,
          (r = { creator: s.creator, spots: 0, spotsInPeriod: 0, firstAt: "", lastAt: "", revenue: 0, opens: 0, saves: 0, lanes: [], ids: new Set() }),
        );
      r.spots++;
      r.ids.add(i);
      const at = new Date(s.starts).toISOString();
      if (!r.firstAt || at < r.firstAt) r.firstAt = at;
      if (at > r.lastAt) r.lastAt = at;
      if (!r.lanes.includes(s.lane)) r.lanes.push(s.lane);
      if (s.starts >= from) {
        r.spotsInPeriod++;
        r.revenue += s.amount - s.refund;
      }
    });
    const byStory = new Map<number, CreatorRow>();
    for (const r of rows.values()) for (const i of r.ids) byStory.set(i, r);
    for (let j = lower(d.evAt, from); j < d.evAt.length && d.evAt[j] < to; j++) {
      const r = byStory.get(d.evS[j]);
      if (!r) continue;
      if (d.evK[j] === 0) r.opens++;
      else if (d.evK[j] === 1) r.saves++;
    }
    return [...rows.values()].map(({ ids: _ids, ...r }) => r).sort((a, b) => b.revenue - a.revenue || b.lastAt.localeCompare(a.lastAt));
  },

  createFunnel(fromIso: string, toIso: string, tz: string): CreateFunnel {
    const d = data(tz);
    const from = Date.parse(fromIso),
      to = clampNow(Date.parse(toIso));
    const started = new Set<number>();
    const steps = new Map<number, Set<number>>();
    for (let i = lower(d.trAt, from); i < d.trAt.length && d.trAt[i] < to; i++) {
      const s = d.trStep[i];
      if (s === 0) started.add(d.trV[i]);
      else {
        let x = steps.get(s);
        if (!x) steps.set(s, (x = new Set()));
        x.add(d.trV[i]);
      }
    }
    return {
      started: started.size,
      steps: [...steps].map(([step, v]) => ({ step, visitors: v.size })).sort((a, b) => a.step - b.step),
      checkouts: d.stories.filter((s) => s.created >= from && s.created < to).length,
      paid: d.stories.filter((s) => s.starts != null && s.starts >= from && s.starts < to).length,
    };
  },

  transactions(fromIso: string, toIso: string, f: Filters, tz: string): Transaction[] {
    const d = data(tz);
    const from = Date.parse(fromIso),
      to = clampNow(Date.parse(toIso));
    return d.stories
      .filter((s) => s.starts != null && s.starts >= from && s.starts < to && storyOk(f, s))
      .sort((a, b) => b.starts! - a.starts!)
      .map((s) => ({
        id: s.id,
        paidAt: new Date(s.starts!).toISOString(),
        lane: s.lane,
        no: s.no,
        name: s.name,
        creator: s.creator,
        currency: "usd",
        amount: s.amount,
        fee: s.fee,
        refund: s.refund,
        refundedAt: s.refundedAt ? new Date(s.refundedAt).toISOString() : null,
        dispute: s.dispute,
        disputeStatus: s.disputeStatus,
        net: s.amount - s.refund - (s.fee ?? 0) - s.dispute,
        paymentIntent: s.pi,
        session: null,
      }));
  },

  cohorts(weeks: number, tz: string): Cohort[] {
    const d = data(tz);
    const now = Date.now();
    /* local day numbers, with the zone's offset looked up once per hour */
    const offs = new Map<number, number>();
    const dn = (t: number) => {
      const h = Math.floor(t / H);
      let o = offs.get(h);
      if (o == null) {
        o = Date.parse(dayOf(t, tz)) - Math.floor(t / D) * D;
        o = Math.round(o / D) * D;
        offs.set(h, o);
      }
      return Math.floor(t / D) + o / D;
    };
    /* weeks start on Monday; day 0 (1970-01-01) was a Thursday */
    const wk = (n: number) => n - ((n + 3) % 7);
    const thisWeek = wk(dn(now));
    const first = thisWeek - 7 * weeks;
    const days = new Map<number, number[]>();
    for (let i = 0; i < d.visitAt.length && d.visitAt[i] < now; i++) {
      const v = d.visitV[i];
      let a = days.get(v);
      if (!a) days.set(v, (a = []));
      a.push(dn(d.visitAt[i]));
    }
    const out = new Map<number, Cohort>();
    for (let v = 0; v < d.vFirst.length; v++) {
      const f0 = d.vFirst[v];
      if (f0 > now) continue;
      const d0 = dn(f0);
      const w = wk(d0);
      if (w < first) continue;
      let c = out.get(w);
      if (!c) {
        const n = Math.max(0, Math.min(8, Math.round((thisWeek - w) / 7)));
        const iso = new Date(w * D).toISOString().slice(0, 10);
        out.set(w, (c = { week: iso, size: 0, d1: 0, d7: 0, d30: 0, weeks: n ? Array(n).fill(0) : null }));
      }
      c.size++;
      const ds = days.get(v) ?? [];
      if (ds.some((x) => x === d0 + 1)) c.d1++;
      if (ds.some((x) => x >= d0 + 1 && x <= d0 + 7)) c.d7++;
      if (ds.some((x) => x >= d0 + 1 && x <= d0 + 30)) c.d30++;
      if (c.weeks) {
        const seen = new Set(ds.map((x) => (wk(x) - w) / 7));
        for (let k = 0; k < c.weeks.length; k++) if (seen.has(k + 1)) c.weeks[k]++;
      }
    }
    return [...out.values()].sort((a, b) => a.week.localeCompare(b.week));
  },

  feed(sinceIso: string, limit: number, tz: string): FeedItem[] {
    const d = data(tz);
    const since = Date.parse(sinceIso),
      now = Date.now();
    const items: FeedItem[] = [];
    const base = { source: null, device: null, country: null, isNew: null, lane: null, no: null, name: null, story: null, amount: null, step: null };
    const story = (i: number) => {
      const s = d.stories[i];
      return { lane: s.lane, no: s.no, name: s.name, story: s.id };
    };
    const back = (arr: Float64Array, fn: (i: number) => void) => {
      let n = 0;
      for (let i = lower(arr, now) - 1; i >= 0 && arr[i] > since && n < limit; i--, n++) fn(i);
    };
    back(d.visitAt, (i) => {
      const v = d.visitV[i];
      const st = d.visitStory[i];
      items.push({
        ...base,
        at: new Date(d.visitAt[i]).toISOString(),
        kind: "visit",
        source: d.visitSource[i],
        device: d.vDevice[v],
        country: d.vCountry[v],
        isNew: !!d.visitNew[i],
        ...(st >= 0 ? story(st) : {}),
      });
    });
    back(d.evAt, (i) => {
      const v = d.evV[i];
      items.push({ ...base, at: new Date(d.evAt[i]).toISOString(), kind: EV[d.evK[i]], source: d.vSource[v], device: d.vDevice[v], country: d.vCountry[v], ...story(d.evS[i]) });
    });
    back(d.trAt, (i) => items.push({ ...base, at: new Date(d.trAt[i]).toISOString(), kind: d.trStep[i] ? "create_step" : "create_start", step: d.trStep[i] || null }));
    d.stories.forEach((s, i) => {
      if (s.created > since && s.created <= now) items.push({ ...base, at: new Date(s.created).toISOString(), kind: "checkout", ...story(i), amount: s.amount || 995 });
      if (s.starts && s.starts > since && s.starts <= now) items.push({ ...base, at: new Date(s.starts).toISOString(), kind: "paid", ...story(i), amount: s.amount });
    });
    return items.sort((a, b) => b.at.localeCompare(a.at)).slice(0, Math.min(limit, 500));
  },

  live(tz: string): Live {
    const d = data(tz);
    const now = Date.now();
    const vs = new Set<number>();
    for (let i = lower(d.visitAt, now - 5 * 60e3); i < d.visitAt.length && d.visitAt[i] < now; i++) vs.add(d.visitV[i]);
    for (let i = lower(d.evAt, now - 5 * 60e3); i < d.evAt.length && d.evAt[i] < now; i++) vs.add(d.evV[i]);
    const le = lower(d.evAt, now) - 1;
    return { now: vs.size, lastEvent: le >= 0 ? new Date(d.evAt[le]).toISOString() : null };
  },

  ops(tz: string): Ops {
    const d = data(tz);
    const now = Date.now();
    const r = rng(Math.floor(now / H));
    const h0 = Math.floor(now / H) * H - 23 * H;
    const hours = Array.from({ length: 24 }, (_, k) => {
      const t = h0 + k * H;
      const visits = lower(d.visitAt, Math.min(now, t + H)) - lower(d.visitAt, t);
      const requests = Math.round(visits * 7.5 + 20);
      const hh = new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", hourCycle: "h23" }).format(t);
      return { t: `${dayOf(t, tz)}T${hh}:00`, requests, errors: Math.round(requests * (k === 17 ? 0.012 : 0.0015) * r()), slow: Math.round(requests * 0.004 * r()) };
    });
    const total = hours.reduce((a, h) => a + h.requests, 0);
    const routes = [
      ["/api/track", 0.46, 38],
      ["/api/events", 0.3, 44],
      ["/api/wall", 0.12, 120],
      ["/api/uploads", 0.02, 180],
      ["/api/checkout", 0.015, 1450],
      ["/api/checkout/status", 0.03, 60],
      ["/api/stripe/webhook", 0.01, 310],
      ["/api/reports", 0.001, 90],
      ["/api/cron/cleanup", 0.0001, 2200],
    ].map(([route, share, ms]) => {
      const n = Math.max(1, Math.round(total * (share as number)));
      return {
        route: route as string,
        requests: n,
        errors: route === "/api/checkout" ? 2 : route === "/api/uploads" ? 1 : 0,
        slow: (ms as number) > 1000 ? Math.round(n * 0.2) : 0,
        avgMs: Math.round((ms as number) * (0.85 + r() * 0.3)),
        maxMs: Math.round((ms as number) * (2.5 + r() * 2)),
      };
    });
    return {
      hours,
      routes,
      errors: [
        { at: new Date(now - 6.2 * H).toISOString(), kind: "error", route: "/api/checkout", status: 500, message: "stripe: rate limited (retry succeeded)" },
        { at: new Date(now - 7.9 * H).toISOString(), kind: "upload", route: "/api/uploads", status: 502, message: "signed upload link failed" },
        { at: new Date(now - 30 * H).toISOString(), kind: "client_error", route: null, status: null, message: "ResizeObserver loop completed with undelivered notifications" },
      ],
      webhooks: { ok24h: Math.round(total * 0.01), failed24h: 0, last: new Date(now - 11 * 60e3).toISOString() },
      uploads: { failed24h: 1 },
      clientErrors24h: 4,
      cron: [
        { name: "release-expired", schedule: "* * * * *", active: true, last: { status: "succeeded", at: new Date(now - 40e3).toISOString(), message: "1 row" }, failed24h: 0 },
        { name: "vercel: /api/cron/cleanup", schedule: "17 4 * * *", active: true, last: { status: "succeeded", at: new Date(now - 9 * H).toISOString(), message: "ok" }, failed24h: 0 },
        { name: "vercel: /api/cron/reports", schedule: "53 6 * * *", active: true, last: { status: "succeeded", at: new Date(now - 7 * H).toISOString(), message: "daily report" }, failed24h: 0 },
      ],
      database: { bytes: 212 * 1024 * 1024, connections: 14 },
      ingestion: { lastVisit: new Date(d.visitAt[Math.max(0, lower(d.visitAt, now) - 1)]).toISOString(), lastEvent: this.live(tz).lastEvent, lagMs: 180 + Math.round(r() * 60) },
    };
  },

  /* exports live in memory in the demo */
  exportCreate(e: Omit<ExportRow, "id" | "created_at" | "finished_at" | "status" | "rows" | "bytes" | "path" | "error">, tz: string) {
    const x: ExportRow = { ...e, id: crypto.randomUUID(), created_at: new Date().toISOString(), finished_at: null, status: "queued", rows: null, bytes: null, path: null, error: null };
    data(tz).exports.unshift(x);
    return x.id;
  },
  exportUpdate(id: string, e: Partial<ExportRow>, tz: string) {
    const x = data(tz).exports.find((y) => y.id === id);
    if (x) Object.assign(x, e, e.status === "done" || e.status === "failed" ? { finished_at: new Date().toISOString() } : {});
  },
  exportList(tz: string) {
    return data(tz).exports.slice(0, 50);
  },
  exportGet(id: string, tz: string) {
    return data(tz).exports.find((y) => y.id === id) ?? null;
  },
  fileSave(path: string, body: Uint8Array, type: string, tz: string) {
    data(tz).files.set(path, { body, type });
  },
  fileGet(path: string, tz: string) {
    return data(tz).files.get(path) ?? null;
  },
};
