import type { MetadataRoute } from "next";
import { SITE_URL } from "../lib/site/facts";

/*
 * The Wall, lanes, info pages and discoveries may be crawled, including by AI
 * answer engines. Private surfaces and test views may not.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/founder", "/admin", "/api/", "/*?*fixture=", "/*?*demo=", "/*?*claimed=", "/*?*create="],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
