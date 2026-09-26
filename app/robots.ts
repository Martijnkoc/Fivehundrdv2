import type { MetadataRoute } from "next";
import { SITE_URL } from "../lib/site/facts";

/* everything public may be crawled, including by AI answer engines; the private surfaces may not */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/founder", "/admin", "/api/"] }],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
