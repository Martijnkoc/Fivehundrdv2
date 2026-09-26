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
  client ??= import("@supabase/supabase-js").then(({ createClient }) =>
    createClient(SUPABASE_URL, PUBLISHABLE_KEY, { auth: { persistSession: true, detectSessionInUrl: true, flowType: "pkce" } }),
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
  const ext = EXT[type];
  if (!ext) throw new Error(bucket === "audio" ? "That audio file type isn't supported. Try an MP3." : "That image type isn't supported. Try a JPG or PNG.");
  const path = `pending/${randomId()}.${ext}`;
  const { error } = await (await supabase()).storage.from(bucket).upload(path, blob, { contentType: type, upsert: false });
  if (error) throw new Error("Your files couldn't be uploaded. Try again.");
  return path;
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
