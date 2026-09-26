/*
 * The live view's sentences: "visitor from Instagram opened No. 281". Only
 * where people came from, their device and country; never who they are.
 */
import { LANE_LABEL } from "./filters";
import { money } from "./format";
import type { FeedItem } from "./types";

const NAMES: Record<string, string> = {
  instagram: "Instagram",
  tiktok: "TikTok",
  x: "X",
  facebook: "Facebook",
  threads: "Threads",
  linkedin: "LinkedIn",
  reddit: "Reddit",
  youtube: "YouTube",
  pinterest: "Pinterest",
  whatsapp: "WhatsApp",
  telegram: "Telegram",
  discord: "Discord",
  bluesky: "Bluesky",
  google: "Google",
  bing: "Bing",
  duckduckgo: "DuckDuckGo",
  hackernews: "Hacker News",
  producthunt: "Product Hunt",
  email: "email",
};
export const sourceName = (s: string | null | undefined) => (s ? (NAMES[s] ?? s) : "");

/** "visitor from Instagram", "new visitor", "visitor on mobile in NL" … */
export function who(i: Pick<FeedItem, "source" | "isNew">) {
  const base = i.isNew ? "new visitor" : i.isNew === false ? "returning visitor" : "visitor";
  return i.source && i.source !== "direct" ? `${base} from ${sourceName(i.source)}` : base;
}

export type Phrase = { lead: string; spot?: string; tail?: string };
export const spotName = (i: Pick<FeedItem, "no" | "lane">) => (i.no != null ? `No. ${i.no}${i.lane ? ` ${LANE_LABEL[i.lane] ?? ""}`.trimEnd() : ""}` : "");

export function phrase(i: FeedItem): Phrase {
  const spot = spotName(i);
  switch (i.kind) {
    case "visit":
      return i.story ? { lead: `${who(i)} arrived through a shared link to`, spot } : { lead: `${who(i)} arrived${i.device ? ` on ${i.device}` : ""}${i.country ? ` in ${i.country}` : ""}` };
    case "open":
      return { lead: `${who(i)} opened`, spot };
    case "save":
      return { lead: "", spot, tail: "saved" };
    case "unsave":
      return { lead: "", spot, tail: "unsaved" };
    case "share":
      return { lead: "", spot, tail: "shared" };
    case "link_click":
      return { lead: "", spot, tail: "link clicked" };
    case "entry":
      return { lead: "shared link to", spot, tail: "opened" };
    case "create_start":
      return { lead: "creator began Create" };
    case "create_step":
      return { lead: `creator reached step ${i.step ?? "?"} of Create` };
    case "checkout":
      return { lead: "checkout started for", spot };
    case "paid":
      return { lead: `checkout completed — ${money(i.amount ?? 0)} —`, spot, tail: "is live" };
    default:
      return { lead: String(i.kind) };
  }
}

export const phraseText = (i: FeedItem) => {
  const p = phrase(i);
  return [p.lead, p.spot, p.tail].filter(Boolean).join(" ");
};
