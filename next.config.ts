import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* The dev indicator would show up in the visual parity screenshots. */
  devIndicators: false,
  /* The visual parity suite loads the dev server as 127.0.0.1. */
  allowedDevOrigins: ["127.0.0.1"],
  /* the site and the Control Room (/founder) have separate root layouts, so unknown addresses need their own page */
  experimental: { globalNotFound: true },
  /* private surfaces are never indexed, whatever links to them */
  async headers() {
    const noindex = [{ key: "X-Robots-Tag", value: "noindex, nofollow" }];
    return [
      { source: "/founder/:path*", headers: noindex },
      { source: "/founder", headers: noindex },
      { source: "/admin", headers: noindex },
      { source: "/api/:path*", headers: noindex },
    ];
  },
};

export default nextConfig;
