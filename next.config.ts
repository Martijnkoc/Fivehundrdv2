import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* The dev indicator would show up in the visual parity screenshots. */
  devIndicators: false,
  /* The visual parity suite loads the dev server as 127.0.0.1. */
  allowedDevOrigins: ["127.0.0.1"],
  /* the site and the Control Room (/founder) have separate root layouts, so unknown addresses need their own page */
  experimental: { globalNotFound: true },
  /* no "X-Powered-By: Next.js" */
  poweredByHeader: false,
  async headers() {
    /* private surfaces are never indexed, whatever links to them */
    const noindex = [{ key: "X-Robots-Tag", value: "noindex, nofollow" }];
    /*
     * Every page: no framing by other sites (clickjacking), no type sniffing,
     * no full addresses to other sites, no camera, microphone or location.
     * Scripts aren't restricted yet: that needs nonces for the inline ones.
     */
    const secure = [
      { key: "Content-Security-Policy", value: "frame-ancestors 'none'; base-uri 'self'; object-src 'none'" },
      { key: "X-Frame-Options", value: "DENY" },
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
      { key: "Strict-Transport-Security", value: "max-age=63072000" },
    ];
    return [
      { source: "/:path*", headers: secure },
      { source: "/founder/:path*", headers: noindex },
      { source: "/founder", headers: noindex },
      { source: "/admin", headers: noindex },
      { source: "/api/:path*", headers: noindex },
    ];
  },
};

export default nextConfig;
