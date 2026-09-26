/*
 * Anonymous product measurement for the Control Room (docs/founder-dashboard.md).
 * One beacon per visit (a visit ends after 30 minutes without activity),
 * impressions batched a few seconds at a time, the Create steps, and errors.
 * The visitor is the random id this browser already has; nothing here reads
 * names, emails or addresses. Only on the live site, never in the demo,
 * fixture or test modes, and never in the way of the wall: everything is
 * queued and sent with sendBeacon when the browser is idle or leaving.
 */

const SESSION = 30 * 60e3;
const on = () => {
  if (typeof window === "undefined" || !process.env.NEXT_PUBLIC_SUPABASE_URL) return false;
  if (navigator.webdriver) return false;
  const q = new URLSearchParams(location.search);
  return q.get("fixture") !== "1" && q.get("demo") !== "1";
};

export function visitorId() {
  try {
    let v = localStorage.getItem("fh-visitor");
    if (!v) localStorage.setItem("fh-visitor", (v = crypto.randomUUID()));
    return v;
  } catch {
    return crypto.randomUUID();
  }
}

type Beacon =
  | { t: "visit"; landing: string; slug?: string; referrer?: string; utm?: Record<string, string> }
  | { t: "imp"; stories: string[] }
  | { t: "create"; step?: number }
  | { t: "error"; message: string };

function send(items: Beacon[]) {
  if (!items.length) return;
  const body = JSON.stringify({ visitor: visitorId(), clientAt: new Date().toISOString(), items });
  try {
    if (navigator.sendBeacon?.("/api/track", new Blob([body], { type: "application/json" }))) return;
  } catch {}
  fetch("/api/track", { method: "POST", headers: { "Content-Type": "application/json" }, body, keepalive: true }).catch(() => {});
}

/* ---------- visits ---------- */

let lastSeen = 0;
function stamp() {
  lastSeen = Date.now();
  try {
    localStorage.setItem("fh-seen", String(lastSeen));
  } catch {}
}
function previous() {
  try {
    return Math.max(lastSeen, +(localStorage.getItem("fh-seen") || 0));
  } catch {
    return lastSeen;
  }
}

/** Where people came from: the referring site (host only) and any utm_ tags. */
function arrival(): Beacon {
  const q = new URLSearchParams(location.search);
  const utm: Record<string, string> = {};
  for (const k of ["source", "medium", "campaign"]) {
    const v = q.get("utm_" + k) || (k === "source" ? q.get("ref") : null);
    if (v) utm[k] = v.slice(0, 100);
  }
  let referrer: string | undefined;
  try {
    const r = document.referrer ? new URL(document.referrer).hostname : "";
    if (r && r !== location.hostname) referrer = r;
  } catch {}
  const m = location.pathname.match(/^\/s\/[a-z]+\/\d+\/([a-z0-9]{8})\/?$/);
  return {
    t: "visit",
    landing: m ? "/s/" : location.pathname.slice(0, 100),
    slug: m?.[1],
    referrer,
    utm: Object.keys(utm).length ? utm : undefined,
  };
}

let started = false;
/** Counts the visit (once per 30 minutes of activity) and keeps it alive while people use the page. */
export function startTracking() {
  if (started || !on()) return;
  started = true;
  if (Date.now() - previous() > SESSION) send([arrival()]);
  stamp();
  const touch = () => {
    /* back after a long pause in the same tab: a new visit, from nowhere in particular */
    if (Date.now() - previous() > SESSION) send([{ t: "visit", landing: location.pathname.startsWith("/s/") ? "/s/" : location.pathname.slice(0, 100) }]);
    if (Date.now() - lastSeen > 30e3) stamp();
  };
  addEventListener("pointerdown", touch, { passive: true });
  addEventListener("keydown", touch, { passive: true });
  document.addEventListener("visibilitychange", () => (document.hidden ? flush() : touch()));
  addEventListener("pagehide", flush);
  addEventListener("error", (e) => clientError(e.message || "error"));
  addEventListener("unhandledrejection", (e) => clientError(String((e.reason as Error)?.message ?? e.reason ?? "rejection")));
}

/* ---------- impressions ---------- */

const seen = new Set<string>();
let pending: string[] = [];
let timer = 0;
function flush() {
  clearTimeout(timer);
  timer = 0;
  if (pending.length) send([{ t: "imp", stories: pending.splice(0, 200) }]);
}
/** A live story's tile was on screen (counted once per page view; the database keeps one per day). */
export function impression(story: string) {
  if (!started || seen.has(story)) return;
  seen.add(story);
  pending.push(story);
  if (pending.length >= 60) flush();
  else if (!timer) timer = window.setTimeout(flush, 5000);
}

let io: IntersectionObserver | null = null;
const watched = new WeakSet<Element>();
/**
 * Watches tiles for impressions: a tile counts once at least half of it has
 * been on screen. `idOf` maps a tile element to its story id (or nothing).
 */
export function watchTiles(root: ParentNode, selector: string, idOf: (el: Element) => string | undefined) {
  if (!started || typeof IntersectionObserver === "undefined") return;
  io ??= new IntersectionObserver(
    (entries) => {
      for (const e of entries)
        if (e.isIntersecting) {
          const id = idOf(e.target);
          if (id) impression(id);
          io!.unobserve(e.target);
        }
    },
    { threshold: 0.5 },
  );
  root.querySelectorAll(selector).forEach((el) => {
    if (watched.has(el)) return;
    watched.add(el);
    io!.observe(el);
  });
}

/* ---------- Create and errors ---------- */

let lastStep = -1;
/** Create opened (no step) or reached a step (1-based, phones). */
export function createMoment(step?: number) {
  if (!on()) return;
  if (step == null) lastStep = -1;
  else if (step <= lastStep) return;
  else lastStep = step;
  send([step == null ? { t: "create" } : { t: "create", step }]);
}

let errors = 0;
export function clientError(message: string) {
  if (!started || ++errors > 5) return;
  send([{ t: "error", message: message.slice(0, 300) }]);
}
