import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* The dev indicator would show up in the visual parity screenshots. */
  devIndicators: false,
  /* The visual parity suite loads the dev server as 127.0.0.1. */
  allowedDevOrigins: ["127.0.0.1"],
};

export default nextConfig;
