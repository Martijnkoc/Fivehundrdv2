import type { MetadataRoute } from "next";
import { hasDatabase, rpc } from "../lib/server/backend";
import { LANES, PAGES, SITE_URL } from "../lib/site/facts";
import type { Feed } from "../lib/wall/live";

/* rebuilt every hour, so live stories' lasting links are listed while they're on the wall */
export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();
  const out: MetadataRoute.Sitemap = [
    { url: `${SITE_URL}/`, lastModified: now, changeFrequency: "hourly", priority: 1 },
    ...LANES.map((l) => ({ url: `${SITE_URL}/lanes/${l.slug}`, lastModified: now, changeFrequency: "hourly" as const, priority: 0.8 })),
    ...Object.keys(PAGES).map((p) => ({
      url: `${SITE_URL}/${p}`,
      changeFrequency: "monthly" as const,
      priority: ["terms", "privacy"].includes(p) ? 0.2 : 0.6,
    })),
  ];
  if (hasDatabase())
    try {
      const feed = await rpc<Feed>("wall_public", {}, false);
      for (const s of feed.stories)
        if (s.slug) out.push({ url: `${SITE_URL}/s/${s.lane}/${s.no}/${s.slug}`, changeFrequency: "daily", priority: 0.5 });
    } catch {
      /* the static pages are enough */
    }
  return out;
}
