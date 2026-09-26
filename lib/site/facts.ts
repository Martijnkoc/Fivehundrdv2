/*
 * What Fivehundrd is, in one place: the footer, the info pages, structured
 * data (JSON-LD), the sitemap and /llms.txt all read from here, so search
 * engines and AI answer engines get the same plain, checkable facts people do.
 * Every fact here is how the product actually works (BUILD_BRIEF.md, the code).
 */
import type { LaneId } from "../wall/model";

export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || "https://fivehundrd.com").replace(/\/$/, "");
/** Only shown when the founder has set it; no address is made up. */
export const CONTACT_EMAIL = process.env.NEXT_PUBLIC_CONTACT_EMAIL || "";
export const NAME = "Fivehundrd";
export const TAGLINE = "Discover before the crowd.";
export const SLOGAN = "Good stories find good people.";
export const PRICE_USD = "9.95";
export const UPDATED = "2026-09-26";

/** One sentence that answers "what is Fivehundrd?" */
export const DEFINITION =
  "Fivehundrd is a public wall where independent makers (musicians, writers, artists, game makers, podcasters and newsletter writers) pay $9.95 to show their work in one of 500 numbered spots per lane for 72 hours.";

/** The positioning, for metadata and structured data (not shown as UI copy). */
export const POSITIONING =
  "Fivehundrd is a discovery platform where music, books, games, creators, podcasts and newsletters get a limited-time place on The Wall, to be discovered before they become mainstream.";

export const DESCRIPTION =
  "A wall of 3,000 spots across Music, Books, Games, Creators, Podcasts and Newsletters. Each spot is one maker for 72 hours, $9.95. No feed, no algorithm, no front row: every visitor starts somewhere else on the wall.";

/** Lanes as people search for them. Ids are the wall's own. */
export const LANES: { id: LaneId; slug: string; label: string; who: string; what: string; preview: string }[] = [
  { id: "music", slug: "music", label: "Music", who: "musicians and bands", what: "new music from independent artists", preview: "a 30-second preview to play on the wall" },
  { id: "writers", slug: "books", label: "Books", who: "authors and writers", what: "new books and stories from independent authors", preview: "the first pages to read on the wall" },
  { id: "games", slug: "games", label: "Games", who: "game makers and indie studios", what: "new indie games", preview: "a trailer" },
  { id: "art", slug: "creators", label: "Creators", who: "artists, designers and creators", what: "art, design and creative work", preview: "a video or the artwork itself" },
  { id: "podcasts", slug: "podcasts", label: "Podcasts", who: "podcasters", what: "new podcasts and episodes", preview: "an episode trailer to play on the wall" },
  { id: "letters", slug: "newsletters", label: "Newsletters", who: "newsletter writers", what: "newsletters worth subscribing to", preview: "the latest issue to read on the wall" },
];
export const laneBySlug = (slug: string) => LANES.find((l) => l.slug === slug);
export const laneById = (id: string) => LANES.find((l) => l.id === id);
export const lanePath = (id: string) => (id === "all" ? "/" : `/lanes/${laneById(id)?.slug ?? id}`);

/** The info pages, in footer order. */
export const PAGES = {
  "how-it-works": { title: "How it works", description: "How Fivehundrd works for visitors and for makers: 500 numbered spots per lane, 72 hours each, no feed and no algorithm." },
  pricing: { title: "Pricing", description: "One price: $9.95 for a spot on the wall for 72 hours. No subscription, no ads, no bidding. Browsing and saving are free." },
  rules: { title: "Wall rules", description: "What can go on Fivehundrd, what can't, how stories are checked before they go live, and how reporting works." },
  faq: { title: "Questions", description: "Answers about Fivehundrd: what it is, how spots work, what it costs, saves, accounts, refunds and safety." },
  about: { title: "About", description: "Why Fivehundrd exists: a fair place for independent makers to be discovered, without a feed or an algorithm." },
  contact: { title: "Contact", description: "How to reach Fivehundrd: questions, press, reports and refunds." },
  terms: { title: "Terms", description: "The terms for using Fivehundrd and for buying a spot on the wall." },
  privacy: { title: "Privacy", description: "What Fivehundrd collects, why, who processes it, and your choices. Visitors are anonymous; we don't sell data or show ads." },
} as const;
export type PageSlug = keyof typeof PAGES;

/** Questions people (and answer engines) ask, answered once. */
export const FAQ: { q: string; a: string }[] = [
  { q: "What is Fivehundrd?", a: DEFINITION },
  {
    q: "How does a spot work?",
    a: "Each lane has 500 numbered spots. A maker picks one, adds a name, artwork, a short pitch (up to 140 characters), up to three links and, depending on the lane, an audio preview, the first pages or a trailer. After payment the spot is live straight away for 72 hours, then the number is free again.",
  },
  { q: "How much does it cost?", a: "$9.95 per spot for 72 hours, paid once through Stripe. There is no subscription. Browsing, opening, saving and sharing spots is free." },
  {
    q: "Is there an algorithm or a feed?",
    a: "No. Everyone sees the same numbered wall. The only difference is where your visit starts: each visitor begins at a different spot, so there is no permanent front row and every spot gets its turn at the top.",
  },
  { q: "Which lanes are there?", a: "Music, Books, Games, Creators, Podcasts and Newsletters: 500 spots each, 3,000 in total." },
  {
    q: "Do I need an account?",
    a: "No. Browsing and saving never need an account; your saves (your Finds) are kept in your browser. Keep my card is optional: sign in to keep your saves on every device.",
  },
  {
    q: "What happens after 72 hours?",
    a: "The spot leaves the wall and its number opens up for the next maker. The story's lasting link keeps working, so shared links and saves still show who it was and where to find them.",
  },
  {
    q: "Can I get a refund?",
    a: "If your spot can't go live after you paid (for example because it was taken off the wall before it started), the payment is refunded automatically. For anything else, contact us and we'll look at it.",
  },
  {
    q: "How is the wall kept safe?",
    a: "Every story is checked before payment: its links against simple rules and lists of known harmful sites, and its name, texts and images against the wall rules. Anyone can report a live story; reported stories are reviewed by a person and can be taken down.",
  },
  { q: "Is Fivehundrd free for visitors?", a: "Yes. There are no ads and no paywall. Makers pay for their spot; visitors don't pay anything." },
];

export const orgJsonLd = () => ({
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": `${SITE_URL}/#org`,
      name: NAME,
      url: SITE_URL,
      slogan: SLOGAN,
      description: POSITIONING,
      ...(CONTACT_EMAIL && { email: CONTACT_EMAIL }),
    },
    {
      "@type": "WebSite",
      "@id": `${SITE_URL}/#site`,
      name: NAME,
      url: SITE_URL,
      description: DESCRIPTION,
      publisher: { "@id": `${SITE_URL}/#org` },
      inLanguage: "en",
    },
    {
      "@type": "DefinedTermSet",
      "@id": `${SITE_URL}/#terms`,
      name: "Fivehundrd terms",
      hasDefinedTerm: [
        { "@type": "DefinedTerm", name: "The Wall", description: "Fivehundrd's public wall: six lanes of 500 numbered spots, the same for every visitor, with no feed and no algorithm." },
        { "@type": "DefinedTerm", name: "Spot", description: "One numbered place on The Wall, held by one maker for a 72-hour placement." },
        { "@type": "DefinedTerm", name: "Discovery", description: "A maker's work in a spot: name, artwork, pitch, preview and links, with a lasting link that keeps working after the 72 hours." },
        { "@type": "DefinedTerm", name: "Finds", description: "The discoveries a visitor saved; they stay after the spot ends." },
        { "@type": "DefinedTerm", name: "Create", description: "Where a maker claims a spot and builds their tile." },
      ],
    },
    {
      "@type": "Service",
      "@id": `${SITE_URL}/#spot`,
      name: "A spot on the Fivehundrd wall",
      provider: { "@id": `${SITE_URL}/#org` },
      serviceType: "Discovery listing for independent makers",
      description: "One numbered spot on the wall for 72 hours: artwork, name, pitch, up to three links and a preview.",
      offers: { "@type": "Offer", price: PRICE_USD, priceCurrency: "USD", url: `${SITE_URL}/pricing`, availability: "https://schema.org/InStock" },
    },
  ],
});
