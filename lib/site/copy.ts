/*
 * Fivehundrd's words, in one place (docs/copy.md). The wall, the Scout Card,
 * Create and the site read their headlines, calls to action and empty states
 * from here, so the same thing is always called the same.
 *
 * Vocabulary: Wall · Spot · Discovery · Timeheart · Kept · Scout · Scouts ·
 * Scout Card · Early Call · Hotspot · Open Spot. Never: likes, favorites,
 * bookmarks, saved, finds, posts, listings, campaigns, trending.
 *
 * Every claim here is true of the product as built. Numbers are never in
 * this file: they come from the database, or aren't shown.
 */
import { COST, FREE } from "../wall/model";

export const BRAND = {
  line: "Find what’s next. Before everyone else does.",
  short: "Find what’s next.",
  support: "500 spots. 72 hours. New music, creators, books, games and ideas.",
  statement: "Fivehundrd is where the internet discovers what’s next.",
  creator: "Put your work where people come to discover.",
  scout: "Your taste. With receipts.",
};

/** Today on Fivehundrd: real counts only (public.today_public), never a promise of reach. */
export const PROOF = {
  head: "Today on Fivehundrd",
  visitors: (n: string) => `${n} visitors`,
  opened: (n: string) => `${n} ${n === "1" ? "discovery" : "discoveries"} opened`,
  /** below this many visitors today the block says no numbers at all (a near-empty count reads as an empty room) */
  min: 25,
  line: "People are here to discover.",
  cta: FREE ? "Claim a spot · free for now" : `Claim a spot · ${COST} / 72h`,
};

export const STEPS = {
  head: "See it. Scout it. Watch what happens.",
  items: [
    { t: "Discover", d: "Explore the Wall and find something you didn’t know yet. Every spot is gone after 72 hours." },
    { t: "Scout", d: "Seen something early? Give it a Timeheart. It becomes one of your Scouts." },
    { t: "Come back", d: "Signed in, Fivehundrd remembers when you found it. If it takes off, you can prove you were early." },
  ],
};

export const TIMEHEART = {
  give: "Timeheart",
  done: "Kept",
  title: "Timeheart: remember this. It goes in your Scouts, even after it leaves the Wall.",
  titleDone: "Kept in your Scouts. Tap to let it go.",
  toast: "Kept in your Scouts.",
};

export const SCOUT = {
  pitchHead: "Think you know what’s next? Prove it.",
  pitch: [
    "When you give something a Timeheart, you become one of its Scouts.",
    "Find great things early and your Scout Card gets stronger over time.",
  ],
  tiers: [
    ["Top 25%", "Bronze"],
    ["Top 10%", "Silver"],
    ["Top 3%", "Gold"],
  ] as const,
  receipts: "Your taste. With receipts.",
  start: "Start Scouting",
  cardTop: "Scout Card",
  cardFallbackName: "Your Scout Card",
  proven: "Your taste, proven over time.",
  share: "Share Scout Card",
  shareCall: "Share this call",
  strongest: "Strongest call",
  startsHead: "Your Scout story starts here.",
  startsBody: "Scout a few things you believe in. We’ll remember when you found them.",
  buildingHead: "Building your Scout history",
  buildingSub: (n: number) => `Your standing shows once ${n} of your Scouts have had their 72 hours.`,
  /* after a Timeheart without an account */
  askHead: "Scout this?",
  askBody: "Sign in to remember you found it early.",
  askSub: "Fivehundrd will track when you discovered it and show you what happens next.",
  askYes: "Sign in & Scout",
  askNo: "Not now",
  signInHead: "Sign in to Scout",
  signInSub: "Fivehundrd remembers when you found things and shows you what happens next. Browsing never needs an account.",
  /* a tier move, said once */
  moveHead: "Your eye is getting sharper.",
  moveTier: (tier: string) => `You’re now a ${tier} Scout.`,
  moveTop: (pct: number) => `Top ${pct}% of Fivehundrd Scouts.`,
  moveLine: "Some of the things you found early are starting to move.",
  seeScouts: "See your Scouts",
  shareYours: "Share your Scout Card",
  /* a call that proved itself */
  earlyHead: "You called it early.",
  movingHead: "Something you Scouted is taking off.",
  seeWhat: "See what happened",
};

export const SCOUTS = {
  head: "Your Scouts",
  sub: "The things you believed in early.",
  local: "On this device only. Sign in and Fivehundrd remembers them everywhere.",
  explore: "Explore the Wall",
};

export const WALL_TODAY = {
  head: "Your Wall Today",
  sub: "Pick up where you left off.",
};

export const HOTSPOTS = {
  head: "Hotspots",
  sub: "What’s getting noticed right now.",
  newest: "Just joined the Wall.",
};

export const OPEN_SPOT = {
  head: "Put something worth finding here.",
  label: `Open Spot · ${COST} · 72 hours`,
  cta: "Claim this spot",
  many: (n: number) => `${n} Open Spots`,
};

export const CREATE = {
  head: "Put it on the Wall.",
  sub: `72 hours. ${COST}.`,
  body: "People come to Fivehundrd to find things they don’t know yet. Give them something worth finding.",
  fair: "There’s no front row: every visitor starts somewhere else on the Wall.",
  nav: "Claim a spot",
  tab: "Claim",
  fields: {
    artwork: ["Artwork", "Show us what people will notice first."],
    name: ["Name", "What should we call it?"],
    story: ["One-line story", "Give people a reason to open it."],
    links: ["Links", "Where can they go next?"],
    lane: ["Lane", "Where does it belong?"],
  } as Record<string, [string, string]>,
  place: FREE ? "Live now" : `Place it · ${COST}`,
  placing: "Placing you on the Wall…",
  fine: FREE ? "Free while we fill the Wall. Nothing to pay." : "Secure payment with Stripe. Refunded if your spot doesn't go live.",
  confirming: FREE ? "Your spot appears in a minute." : "We're confirming your payment. Your spot appears in a minute.",
};

/** A maker's own spot, in people (maker_stats), with what it means. */
export const MAKER = {
  kept: (n: string, one: boolean) => `${n} ${one ? "person" : "people"} thought this was worth remembering.`,
  /* after its 72 hours (founder's ask, 2026-10-02) */
  ended: "Ended",
  endedEmpty: "Its 72 hours are over.",
  again: "Put it on again",
  /* a live spot, in its last 24 hours (founder's ask, 2026-10-03): same number, 72 more hours */
  extend: "Keep it 72 more hours",
  extended: "72 more hours. Same number, same story.",
};
