import { SITE_URL } from "../../lib/site/facts";
import { discoveryFiles, xml } from "../../lib/site/sitemap";

export const revalidate = 3600;

/** The sitemap index: the public pages, and the discoveries in files of 50,000. */
export async function GET() {
  const n = await discoveryFiles();
  const files = [`${SITE_URL}/sitemaps/pages.xml`, ...Array.from({ length: n }, (_, i) => `${SITE_URL}/sitemaps/discoveries-${i}.xml`)];
  return xml(`<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${files.map((f) => `<sitemap><loc>${f}</loc></sitemap>`).join("\n")}\n</sitemapindex>`);
}
