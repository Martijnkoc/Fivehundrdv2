/*
 * The browser's side of the live wall: the feed, events, draft uploads and
 * Stripe Checkout. Only used when the site runs against Supabase (never in
 * fixture or demo mode).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { PAL } from "../../lib/wall/demo";
import type { Feed } from "../../lib/wall/live";
import type { Draft } from "./Claim";

export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "";

/** Live unless Supabase isn't configured, or the page asks for the demo wall. */
export function liveWanted() {
  const q = new URLSearchParams(location.search);
  return !!(SUPABASE_URL && PUBLISHABLE_KEY) && q.get("fixture") !== "1" && q.get("demo") !== "1";
}

export async function fetchFeed(): Promise<Feed> {
  const r = await fetch("/api/wall", { cache: "no-store" });
  if (!r.ok) throw new Error("wall " + r.status);
  return r.json();
}

let client: Promise<SupabaseClient> | null = null;
export function supabase() {
  /* implicit flow: an email link still works when it opens in another browser */
  client ??= import("@supabase/supabase-js").then(({ createClient }) =>
    createClient(SUPABASE_URL, PUBLISHABLE_KEY, { auth: { persistSession: true, detectSessionInUrl: true, flowType: "implicit" } }),
  );
  return client;
}

/* ---------- the visitor ---------- */

function randomId() {
  return crypto.randomUUID();
}
export function visitorId() {
  try {
    let v = localStorage.getItem("fh-visitor");
    if (!v) localStorage.setItem("fh-visitor", (v = randomId()));
    return v;
  } catch {
    return randomId();
  }
}

/** The stories this browser paid for (so the card can show "Your story"). */
export function mineIds(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem("fh-mine") || "[]"));
  } catch {
    return new Set();
  }
}
export function addMine(id: string) {
  try {
    const m = mineIds();
    m.add(id);
    localStorage.setItem("fh-mine", JSON.stringify([...m]));
  } catch {}
}

export type EventKind = "open" | "save" | "unsave" | "link_click" | "share" | "entry";
export function sendEvent(story: string, kind: EventKind) {
  const body = JSON.stringify({ story, kind, visitor: visitorId() });
  try {
    if (kind === "link_click" && navigator.sendBeacon) {
      navigator.sendBeacon("/api/events", new Blob([body], { type: "application/json" }));
      return;
    }
  } catch {}
  fetch("/api/events", { method: "POST", headers: { "Content-Type": "application/json" }, body, keepalive: true }).catch(() => {});
}

/* ---------- claiming: upload the draft's media, then pay ---------- */

const EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "audio/mpeg": "mp3",
  "audio/mp3": "mp3",
  "audio/mp4": "m4a",
  "audio/x-m4a": "m4a",
  "audio/aac": "aac",
  "audio/wav": "wav",
  "audio/x-wav": "wav",
  "audio/wave": "wav",
  "audio/ogg": "ogg",
  "audio/webm": "webm",
};

async function upload(bucket: "art" | "audio", dataURL: string | null | undefined): Promise<string | null> {
  if (!dataURL) return null;
  const blob = await (await fetch(dataURL)).blob();
  const type = blob.type === "audio/mp3" ? "audio/mpeg" : blob.type === "audio/wave" ? "audio/wav" : blob.type;
  if (!EXT[type]) throw new Error(bucket === "audio" ? "That audio file type isn't supported. Try an MP3." : "That image type isn't supported. Try a JPG or PNG.");
  /* the server hands out a one-time upload link (and limits how many) */
  const r = await fetch("/api/uploads", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type, size: blob.size }),
  });
  const t = (await r.json().catch(() => ({}))) as { bucket?: "art" | "audio"; path?: string; token?: string; error?: string };
  if (!r.ok || !t.path || !t.token || !t.bucket) throw new Error(t.error || "Your files couldn't be uploaded. Try again.");
  const { error } = await (await supabase()).storage.from(t.bucket).uploadToSignedUrl(t.path, t.token, blob, { contentType: type });
  if (error) throw new Error("Your files couldn't be uploaded. Try again.");
  return t.path;
}

/* ---------- Cloudflare Turnstile: an invisible "are you human" check before paying ---------- */

const TURNSTILE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? "";
type Turnstile = {
  render: (el: HTMLElement, o: Record<string, unknown>) => string;
  execute: (id: string) => void;
  reset: (id: string) => void;
};
let turnstile: Promise<Turnstile> | null = null;
function loadTurnstile() {
  turnstile ??= new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    s.async = true;
    s.onload = () => resolve((window as unknown as { turnstile: Turnstile }).turnstile);
    s.onerror = () => {
      turnstile = null;
      reject(new Error("We couldn't check you're human. Check your connection and try again."));
    };
    document.head.appendChild(s);
  });
  return turnstile;
}
/** A fresh token, or undefined when Turnstile isn't set up. Only asks the visitor something if Cloudflare is unsure. */
async function humanToken(): Promise<string | undefined> {
  if (!TURNSTILE_KEY) return undefined;
  const ts = await loadTurnstile();
  const box = document.createElement("div");
  box.style.cssText = "position:fixed;left:50%;bottom:24px;transform:translateX(-50%);z-index:1000";
  document.body.appendChild(box);
  try {
    return await new Promise<string>((resolve, reject) => {
      ts.render(box, {
        sitekey: TURNSTILE_KEY,
        appearance: "interaction-only",
        callback: resolve,
        "error-callback": () => reject(new Error("We couldn't check you're human. Try again.")),
        "timeout-callback": () => reject(new Error("The check timed out. Try again.")),
      });
    });
  } finally {
    box.remove();
  }
}

/** Uploads the draft's files, holds the spot and sends the maker to Stripe. Returns an error message on failure. */
export async function checkout(draft: Draft): Promise<string | null> {
  try {
    const [artwork, logo, audio] = await Promise.all([
      upload("art", draft.img),
      upload("art", draft.logo),
      draft.lane === "music" || draft.lane === "podcasts" ? upload("audio", draft.audio) : null,
    ]);
    const reads = draft.lane === "writers" || draft.lane === "letters";
    const human = await humanToken();
    const r = await fetch("/api/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        lane: draft.lane,
        no: draft.no,
        name: draft.name,
        snippet: draft.snippet,
        links: draft.links.map((l) => l.url),
        artwork,
        logo,
        audio,
        excerptTitle: reads ? draft.excerpt?.t : "",
        excerpt: reads ? draft.excerpt?.x : "",
        trailerUrl: draft.trailer?.url ?? "",
        seed: draft.seed,
        pal: Math.max(0, PAL.findIndex((p) => p.join() === draft.pal.join())),
        visitor: visitorId(),
        human,
      }),
    });
    const out = (await r.json().catch(() => ({}))) as { url?: string; id?: string; error?: string };
    if (!r.ok || !out.url || !out.id) return out.error || "Something went wrong. Try again.";
    addMine(out.id);
    location.assign(out.url);
    return null;
  } catch (e) {
    return (e as Error).message || "Something went wrong. Try again.";
  }
}

export type Status = { status: "reserved" | "live" | "vacant" | "released"; lane: string; no: number; name: string };
export async function checkoutStatus(id: string): Promise<Status | null> {
  const r = await fetch("/api/checkout/status?id=" + encodeURIComponent(id), { cache: "no-store" });
  return r.ok ? r.json() : null;
}
export function cancelCheckout(id: string) {
  return fetch("/api/checkout/cancel", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) }).catch(() => null);
}

/* ---------- Keep my card (§12): Supabase Auth ---------- */

/** Which sign-in providers are switched on in Supabase. */
async function providers(): Promise<Record<string, boolean>> {
  try {
    const r = await fetch(`${SUPABASE_URL}/auth/v1/settings`, { headers: { apikey: PUBLISHABLE_KEY } });
    return ((await r.json()) as { external?: Record<string, boolean> }).external ?? {};
  } catch {
    return {};
  }
}

/** Starts a login. Google and Apple leave the page; email sends a link. Returns an error message, or null. */
export async function signIn(via: string, remind: boolean): Promise<string | null> {
  try {
    localStorage.setItem("fh-remind", remind ? "1" : "0");
  } catch {}
  const auth = (await supabase()).auth;
  const back = location.origin + "/";
  if (via === "Google" || via === "Apple") {
    const id = via.toLowerCase() as "google" | "apple";
    if (!(await providers())[id]) return `${via} login isn't switched on yet. Use your email for now.`;
    const { error } = await auth.signInWithOAuth({ provider: id, options: { redirectTo: back } });
    return error ? "That didn't work. Try again." : null;
  }
  const { error } = await auth.signInWithOtp({ email: via, options: { emailRedirectTo: back } });
  if (error) return error.status === 429 ? "Too many links sent. Try again in a minute." : "That didn't work. Try again.";
  return null;
}

/** A save as the account keeps it (my_saves() in the database). */
export type AccountSave = {
  id: string;
  lane: string;
  no: number;
  name: string;
  startsAt: string;
  link: { label: string; url: string } | null;
  artwork: string | null;
  logo: string | null;
  seed: number;
  pal: number;
  savedAt: string;
};

/**
 * If the visitor is logged in: hands this browser's saves to the account and
 * returns the account's saves and how they logged in; otherwise null.
 */
export async function syncCard(): Promise<{ via: string; remind: boolean; saves: AccountSave[] } | null> {
  const sb = await supabase();
  const { data } = await sb.auth.getSession();
  const user = data.session?.user;
  if (!user) return null;
  let remind: boolean | null = null;
  try {
    const r = localStorage.getItem("fh-remind");
    if (r != null) remind = r === "1";
  } catch {}
  const { data: saves, error } = await sb.rpc("sync_card", { p_visitor: visitorId(), p_remind: remind });
  if (error) return null;
  const provider = user.app_metadata?.provider;
  const via = provider === "google" ? "Google" : provider === "apple" ? "Apple" : (user.email ?? "email");
  return { via, remind: remind ?? true, saves: (saves as AccountSave[]) ?? [] };
}

/** Unsaving while logged in removes the save from the account on every device. */
export async function unsaveForAccount(story: string) {
  const sb = await supabase();
  const { data } = await sb.auth.getSession();
  if (data.session) await sb.from("saves").delete().eq("story_id", story);
}

/* ---------- reporting a story ---------- */

export type ReportReason = "sexual" | "child" | "scam" | "hate" | "violence" | "illegal" | "copyright" | "spam" | "other";
/** Sends a report. Returns true when it was received. */
export async function report(story: string, reason: ReportReason, note: string, email: string): Promise<boolean> {
  try {
    const r = await fetch("/api/reports", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ story, reason, note, email, visitor: visitorId() }),
    });
    return r.ok;
  } catch {
    return false;
  }
}
