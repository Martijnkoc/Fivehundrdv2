import { mediaURL } from "../wall/live";
import type { PublicStory } from "../server/story";
import { laneById, NAME, SITE_URL } from "./facts";

/*
 * A discovery (one story's lasting link) as machines read it. The story, not
 * the spot number, is the entity: numbers change hands every 72 hours, the
 * address /s/{lane}/{no}/{code} and its code belong to this story for good.
 */

export const storyPath = (s: Pick<PublicStory, "lane" | "no" | "slug">) => `/s/${s.lane}/${s.no}/${s.slug}`;

const when = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });

/** Title and description as search results and link previews show them. */
export function storyMeta(s: PublicStory) {
  const lane = laneById(s.lane)?.label ?? s.lane;
  const title = `${s.name} on fivehundrd.`;
  const pitch = s.snippet ? `${s.snippet.replace(/\s+$/, "")}${/[.!?]$/.test(s.snippet.trim()) ? "" : "."} ` : "";
  const description =
    s.state === "live"
      ? `${pitch}${lane}, No. ${s.no} on The Wall, live for 72 hours on Fivehundrd.`
      : `${pitch}${lane}, No. ${s.no}. Its 72 hours on The Wall ended ${when(s.endsAt)}; here's where to find it now.`;
  return { title, description, lane };
}

export function storyLd(s: PublicStory, base: string) {
  const url = SITE_URL + storyPath(s);
  const lane = laneById(s.lane);
  const image = mediaURL(base, "art", s.artwork ?? s.logo) ?? `${url}/opengraph-image`;
  return [
    {
      "@context": "https://schema.org",
      "@type": "CreativeWork",
      "@id": `${url}#discovery`,
      url,
      name: s.name,
      ...(s.snippet && { abstract: s.snippet }),
      genre: lane?.label,
      image,
      inLanguage: "en",
      isAccessibleForFree: true,
      datePublished: s.startsAt,
      expires: s.endsAt,
      /* the maker's own links: where the work lives */
      ...(s.links?.length && { sameAs: s.links.map((l) => l.url).filter((u) => /^https?:\/\//.test(u)) }),
      isPartOf: { "@type": "CollectionPage", name: `${lane?.label ?? s.lane} on ${NAME}`, url: `${SITE_URL}/lanes/${lane?.slug ?? s.lane}` },
      provider: { "@id": `${SITE_URL}/#org` },
    },
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: NAME, item: `${SITE_URL}/` },
        { "@type": "ListItem", position: 2, name: lane?.label ?? s.lane, item: `${SITE_URL}/lanes/${lane?.slug ?? s.lane}` },
        { "@type": "ListItem", position: 3, name: s.name, item: url },
      ],
    },
  ];
}
