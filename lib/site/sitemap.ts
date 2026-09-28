import "server-only";
import { hasDatabase, rpc } from "../server/backend";
import { LANES, PAGES, SITE_URL } from "./facts";

/*
 * The sitemap as an index (/sitemap.xml) of smaller sitemaps: the public
 * pages, then every indexable discovery (a story's lasting link, live or
 * ended) in files of at most 50,000, so it keeps working as the wall grows.
 * Never listed: /founder, /admin, /api, checkout, unpaid, hidden or removed
 * stories, spot-number addresses (they change hands), fixture or demo URLs.
 */

export const PER_FILE = 50000;
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
export const xml = (body: string) =>
  new Response(`<?xml version="1.0" encoding="UTF-8"?>\n${body}`, {
    headers: { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400" },
  });

type Url = { loc: string; lastmod?: string; changefreq?: string; priority?: number };
export const urlset = (urls: Url[]) =>
  `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls
    .map(
      (u) =>
        `<url><loc>${esc(u.loc)}</loc>${u.lastmod ? `<lastmod>${u.lastmod}</lastmod>` : ""}${u.changefreq ? `<changefreq>${u.changefreq}</changefreq>` : ""}${
          u.priority != null ? `<priority>${u.priority}</priority>` : ""
        }</url>`,
    )
    .join("\n")}\n</urlset>`;

export function pageUrls(): Url[] {
  return [
    { loc: `${SITE_URL}/`, changefreq: "hourly", priority: 1 },
    ...LANES.map((l) => ({ loc: `${SITE_URL}/lanes/${l.slug}`, changefreq: "hourly", priority: 0.8 })),
    ...Object.keys(PAGES).map((p) => ({ loc: `${SITE_URL}/${p}`, changefreq: "monthly", priority: ["terms", "privacy"].includes(p) ? 0.2 : 0.6 })),
  ];
}

export async function discoveryFiles(): Promise<number> {
  if (!hasDatabase()) return 0;
  const n = await rpc<number>("stories_indexable_count", {}, false).catch(() => 0);
  return Math.ceil(n / PER_FILE);
}

export async function discoveryUrls(file: number): Promise<Url[]> {
  if (!hasDatabase()) return [];
  const rows = await rpc<{ lane: string; no: number; slug: string; at: string }[]>("stories_indexable", { p_offset: file * PER_FILE, p_limit: PER_FILE }, false).catch(
    () => [],
  );
  return rows.map((r) => ({ loc: `${SITE_URL}/s/${r.lane}/${r.no}/${r.slug}`, lastmod: new Date(r.at).toISOString(), changefreq: "daily" }));
}
